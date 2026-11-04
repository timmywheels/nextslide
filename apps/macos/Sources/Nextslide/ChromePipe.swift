import Foundation
import Darwin

// The app's dedicated Chrome has an inherited pipe, never a debugging port.
@MainActor final class ChromePipe {
    struct Event { let method: String; let params: [String: Any]; let session: String? }
    var onEvent: ((Event) -> Void)?
    var onClose: (() -> Void)?
    private(set) var pid: pid_t = 0
    private var input: FileHandle?
    private var output: FileHandle?
    private var watcher: DispatchSourceProcess?
    private var buffer = Data()
    private var sequence = 0
    private var closed = false
    private var pending: [Int: (CheckedContinuation<[String: Any], Error>, Task<Void, Never>)] = [:]

    static func launch(profile: URL, headless: Bool = false) async throws -> ChromePipe {
        let paths = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", NSHomeDirectory() + "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        guard let executable = paths.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else { throw AppError("Install Google Chrome to open a presentation. No extension is needed.") }
        try FileManager.default.createDirectory(at: profile, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let args = [executable, "--user-data-dir=\(profile.path)", "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check", "--no-startup-window", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] + (headless ? ["--headless=new"] : [])
        let chrome = ChromePipe()
        try chrome.spawn(executable, args)
        do { _ = try await chrome.send("Browser.getVersion", timeout: 15); return chrome }
        catch { await chrome.close(); throw AppError("Could not open the presentation browser. Close its old presentation windows and try again.") }
    }
    private func spawn(_ executable: String, _ arguments: [String]) throws {
        func makePipe() throws -> [Int32] {
            var pair: [Int32] = [0, 0]
            guard Darwin.pipe(&pair) == 0 else { throw AppError("Could not start the presentation browser.") }
            let high = pair.map { fcntl($0, F_DUPFD_CLOEXEC, 10) }
            pair.forEach { Darwin.close($0) }
            guard high.allSatisfy({ $0 >= 0 }) else { high.filter { $0 >= 0 }.forEach { Darwin.close($0) }; throw AppError("Could not create the browser connection.") }
            return high
        }
        let toChrome = try makePipe()
        let fromChrome: [Int32]
        do { fromChrome = try makePipe() } catch { toChrome.forEach { Darwin.close($0) }; throw error }
        var actions: posix_spawn_file_actions_t?, attributes: posix_spawnattr_t?
        posix_spawn_file_actions_init(&actions); posix_spawnattr_init(&attributes)
        defer { posix_spawn_file_actions_destroy(&actions); posix_spawnattr_destroy(&attributes) }
        posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_CLOEXEC_DEFAULT))
        posix_spawn_file_actions_adddup2(&actions, toChrome[0], 3)
        posix_spawn_file_actions_adddup2(&actions, fromChrome[1], 4)
        for fd: Int32 in [0, 1, 2] { posix_spawn_file_actions_addopen(&actions, fd, "/dev/null", O_RDWR, 0) }
        let strings = arguments.map { strdup($0) }
        defer { strings.forEach { free($0) } }
        var argv = strings + [nil]
        let environment = ProcessInfo.processInfo.environment.map { strdup($0.key + "=" + $0.value) }
        defer { environment.forEach { free($0) } }
        var envp = environment + [nil]
        let result = posix_spawn(&pid, executable, &actions, &attributes, &argv, &envp)
        Darwin.close(toChrome[0]); Darwin.close(fromChrome[1])
        guard result == 0 else { Darwin.close(toChrome[1]); Darwin.close(fromChrome[0]); throw AppError("Could not start Google Chrome.") }
        input = FileHandle(fileDescriptor: toChrome[1], closeOnDealloc: true)
        output = FileHandle(fileDescriptor: fromChrome[0], closeOnDealloc: true)
        output?.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil }
            Task { @MainActor in if data.isEmpty { self?.disconnect() } else { self?.receive(data) } }
        }
        let child = pid
        let watcher = DispatchSource.makeProcessSource(identifier: child, eventMask: .exit, queue: .main)
        watcher.setEventHandler { [weak self] in
            var status: Int32 = 0; waitpid(child, &status, WNOHANG)
            Task { @MainActor in self?.disconnect() }
        }
        self.watcher = watcher; watcher.resume()
    }
    func send(_ method: String, _ params: [String: Any] = [:], session: String? = nil, timeout: Double = 3) async throws -> [String: Any] {
        guard !closed else { throw AppError("The presentation browser is closed. Reopen your presentation.") }
        sequence += 1; let id = sequence
        var packet: [String: Any] = ["id": id, "method": method, "params": params]
        if let session { packet["sessionId"] = session }
        return try await withCheckedThrowingContinuation { continuation in
            let timer = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                if !Task.isCancelled, let item = self?.pending.removeValue(forKey: id) { item.0.resume(throwing: AppError("The presentation did not respond. Check the slide before trying again.")) }
            }
            pending[id] = (continuation, timer)
            do { try input?.write(contentsOf: jsonData(packet) + Data([0])) }
            catch { disconnect() }
        }
    }
    private func receive(_ data: Data) {
        guard !closed else { return }
        buffer.append(data)
        guard buffer.count <= 8 * 1024 * 1024 else { disconnect(); return }
        while let end = buffer.firstIndex(of: 0) {
            let line = Data(buffer[..<end]); buffer.removeSubrange(...end)
            guard let packet = jsonObject(line) else { disconnect(); return }
            if let id = packet["id"] as? Int, let item = pending.removeValue(forKey: id) {
                item.1.cancel()
                if let error = packet["error"] as? [String: Any] { item.0.resume(throwing: AppError(error["message"] as? String ?? "Presentation browser error.")) }
                else { item.0.resume(returning: packet["result"] as? [String: Any] ?? [:]) }
            } else if let method = packet["method"] as? String { onEvent?(Event(method: method, params: packet["params"] as? [String: Any] ?? [:], session: packet["sessionId"] as? String)) }
        }
    }
    private func disconnect() {
        guard !closed else { return }; closed = true
        output?.readabilityHandler = nil
        try? input?.close(); try? output?.close(); input = nil; output = nil
        watcher?.cancel(); watcher = nil
        let requests = pending; pending.removeAll()
        for item in requests.values { item.1.cancel(); item.0.resume(throwing: AppError("The presentation browser disconnected. Reopen your presentation.")) }
        onClose?()
    }
    func close() async {
        guard !closed else { return }
        _ = try? await send("Browser.close", timeout: 1)
        let child = pid
        for _ in 0..<40 { if closed { return }; try? await Task.sleep(nanoseconds: 50_000_000) }
        if !closed { kill(child, SIGTERM); disconnect() }
    }
}

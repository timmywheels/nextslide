import Foundation

@MainActor final class PublicTunnel {
    enum State {
        case idle, starting, connecting, checking, ready
        var message: String {
            switch self {
            case .idle: return ""
            case .starting: return "Preparing the invite connection…"
            case .connecting: return "Connecting your presentation…"
            case .checking: return "Checking that speakers can reach the link…"
            case .ready: return "The invite connection is ready."
            }
        }
    }
    private var process: Process?
    private var output: Pipe?
    private var logs = ""
    private var generation = UUID()
    private var starting: Task<String, Error>?
    private var stopping: Task<Void, Never>?
    private let checkReachability: (String) async -> Bool
    var failed: ((String) -> Void)?
    var progress: ((State) -> Void)?
    private(set) var origin: String?

    init(checkReachability: @escaping (String) async -> Bool = PublicTunnel.isReachable) {
        self.checkReachability = checkReachability
    }
    private static func isReachable(_ origin: String) async -> Bool {
        var request = URLRequest(url: URL(string: origin + "/health")!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 2.5)
        request.httpMethod = "GET"
        guard let (data, response) = try? await URLSession.shared.data(for: request) else { return false }
        return (response as? HTTPURLResponse)?.statusCode == 200 && jsonObject(data)?["status"] as? String == "ok"
    }
    // Opening a deck and creating an invite share one in-flight connection.
    func start(service: String, executable: URL) async throws -> String {
        if let origin { return origin }
        if let starting { return try await starting.value }
        if let stopping { await stopping.value }
        // Another caller may have started while shutdown was finishing.
        if let origin { return origin }
        if let starting { return try await starting.value }
        let generation = UUID(); self.generation = generation
        let task = Task { try await self.open(service: service, executable: executable, generation: generation) }
        starting = task
        do {
            let origin = try await task.value
            guard self.generation == generation else { throw CancellationError() }
            starting = nil
            return origin
        } catch {
            if self.generation == generation { await stop() }
            throw error
        }
    }
    private func open(service: String, executable: URL, generation: UUID) async throws -> String {
        try Task.checkCancellation()
        let process = Process(), pipe = Pipe()
        process.executableURL = executable
        process.arguments = ["tunnel", "--no-autoupdate", "--protocol", "http2", "--grace-period", "1s", "--url", service]
        process.standardInput = FileHandle.nullDevice; process.standardOutput = FileHandle.nullDevice; process.standardError = pipe
        self.process = process; output = pipe; logs = ""
        progress?(.starting)
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil }
            Task { @MainActor in
                guard let self, self.generation == generation else { return }
                self.logs = String((self.logs + String(decoding: data, as: UTF8.self)).suffix(8192))
            }
        }
        process.terminationHandler = { [weak self] _ in Task { @MainActor in
            guard let self, self.generation == generation, self.origin != nil else { return }
            self.origin = nil; self.failed?("The public connection stopped. Create a new invite to reconnect speakers.")
        } }
        do { try process.run() }
        catch { throw AppError("The connection helper could not start. Reinstall Nextslide.") }
        let deadline = Date().addingTimeInterval(35)
        var address: String?
        while Date() < deadline {
            try Task.checkCancellation()
            guard self.generation == generation, process.isRunning else { throw AppError("Could not create a public invite. Check your connection and try again.") }
            if let range = logs.range(of: #"https://[a-z0-9-]+\.trycloudflare\.com\b"#, options: .regularExpression) {
                if address == nil { address = String(logs[range]); progress?(.connecting) }
                if logs.contains("Registered tunnel connection") { break }
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        guard let address, logs.contains("Registered tunnel connection") else { throw AppError("Could not create a public invite. Check your connection and try again.") }
        progress?(.checking)
        // Avoid a premature DNS lookup negatively caching a newly allocated name.
        try await Task.sleep(nanoseconds: 2_000_000_000)
        let healthDeadline = Date().addingTimeInterval(60)
        while Date() < healthDeadline {
            try Task.checkCancellation()
            guard self.generation == generation, process.isRunning else { throw AppError("The public connection stopped. Please try again.") }
            if await checkReachability(address) {
                try Task.checkCancellation()
                guard self.generation == generation, process.isRunning else { throw CancellationError() }
                origin = address; progress?(.ready); return address
            }
            try await Task.sleep(nanoseconds: 750_000_000)
        }
        throw AppError("The public invite is not reachable yet. Check your connection and try again.")
    }
    // Wait for the actual child to exit before Quit can terminate the app.
    func stop() async {
        generation = UUID(); origin = nil
        starting?.cancel(); starting = nil
        output?.fileHandleForReading.readabilityHandler = nil
        try? output?.fileHandleForReading.close(); output = nil
        progress?(.idle)
        guard let process = self.process else { if let stopping { await stopping.value }; return }
        self.process = nil
        let cleanup = Task {
            guard process.isRunning else { return }
            process.terminate()
            let deadline = Date().addingTimeInterval(2)
            while process.isRunning && Date() < deadline { try? await Task.sleep(nanoseconds: 25_000_000) }
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            // Process receives the exit on Foundation's reaper thread.
            while process.isRunning { try? await Task.sleep(nanoseconds: 25_000_000) }
        }
        stopping = cleanup
        await cleanup.value
        stopping = nil
    }
}

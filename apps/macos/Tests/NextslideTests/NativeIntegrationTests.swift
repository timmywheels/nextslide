import Foundation
@testable import NextslideCore

final class NativeIntegrationTests {
    private var resources: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("build/resources") }
    private func request(_ server: LocalServer, _ path: String, method: String = "GET", headers: [String: String] = [:]) async throws -> (Data, Int) {
        var request = URLRequest(url: URL(string: server.origin + path)!); request.httpMethod = method; request.allHTTPHeaderFields = headers
        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, (response as! HTTPURLResponse).statusCode)
    }
    private func connect(_ origin: String, _ id: String, hello: [String: Any]) async throws -> URLSessionWebSocketTask {
        let ws = URLSession.shared.webSocketTask(with: URL(string: origin.replacingOccurrences(of: "http:", with: "ws:") + "/ws/desktop/" + id)!)
        ws.resume(); try await ws.send(.string(jsonString(hello))); return ws
    }
    private func message(_ socket: URLSessionWebSocketTask, type: String, dataType: String? = nil) async throws -> [String: Any] {
        for _ in 0..<50 {
            let message = try await socket.receive()
            let value: [String: Any]?
            switch message { case .data(let data): value = jsonObject(data); case .string(let text): value = jsonObject(Data(text.utf8)); @unknown default: value = nil }
            if let value, value["type"] as? String == type, dataType == nil || (value["data"] as? [String: Any])?["type"] as? String == dataType { return value }
        }
        throw AppError("Did not receive \(type).")
    }
    @MainActor private func until(_ check: () async throws -> Bool) async throws {
        let deadline = Date().addingTimeInterval(8)
        while try await !check() { if Date() > deadline { throw AppError("Timed out waiting for test state.") }; try await Task.sleep(nanoseconds: 30_000_000) }
    }
    func testNativeServerAuthenticatesAndPinsGuestIdentity() async throws {
        let server = LocalServer(resources: resources); try await server.start()
        do {
            print("Checking unauthorized session creation")
            let denied = try await request(server, "/api/desktop/sessions", method: "POST")
            try XCTAssertEqual(denied.1, 403)
            let engineDenied = try await request(server, "/engine/host.js")
            try XCTAssertEqual(engineDenied.1, 403)
            let created = try await request(server, "/api/desktop/sessions", method: "POST", headers: ["X-Nextslide-Host": server.hostSecret])
            let room = try XCTUnwrap(jsonObject(created.0)); let id = try XCTUnwrap(room["id"] as? String)
            print("Checking host connection")
            let host = try await connect(server.origin, id, hello: ["type": "hello", "role": "host", "token": room["hostToken"]!])
            _ = try await message(host, type: "welcome")
            print("Checking guest connection")
            let guest = try await connect(server.origin, id, hello: ["type": "hello", "role": "guest", "token": room["inviteToken"]!, "name": "Taylor"])
            let welcome = try await message(guest, type: "welcome")
            let joined = try await message(host, type: "guest_joined")
            try XCTAssertEqual((joined["guest"] as? [String: Any])?["name"] as? String, "Taylor")
            try await guest.send(.string(jsonString(["type": "relay", "peerId": "host", "data": ["type": "command", "direction": "next"]])))
            let relayed = try await message(host, type: "relay")
            try XCTAssertEqual(relayed["peerId"] as? String, welcome["peerId"] as? String, "The server must overwrite a guest's claimed identity.")
            print("Checking invalid host credential")
            let invalid = try await connect(server.origin, id, hello: ["type": "hello", "role": "host", "token": room["inviteToken"]!])
            _ = try await message(invalid, type: "error"); invalid.cancel(with: .goingAway, reason: nil)
            let deniedDelete = try await request(server, "/api/desktop/sessions/" + id, method: "DELETE", headers: ["Authorization": "Bearer invalid"])
            try XCTAssertEqual(deniedDelete.1, 403)
            try await host.send(.string(jsonString(["type": "end"])))
            _ = try await message(guest, type: "ended")
            host.cancel(with: .goingAway, reason: nil); guest.cancel(with: .goingAway, reason: nil)
            print("Checking ended invite")
            let ended = URLSession.shared.webSocketTask(with: URL(string: server.origin.replacingOccurrences(of: "http:", with: "ws:") + "/ws/desktop/" + id)!)
            ended.resume()
            _ = try await message(ended, type: "ended"); ended.cancel(with: .goingAway, reason: nil)
            await server.stop()
        } catch { await server.stop(); throw error }
    }
    @MainActor func testTunnelSharesStartupAndWaitsForCleanup() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("nextslide-tunnel-test-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let executable = folder.appendingPathComponent("fake-cloudflared")
        let pidFile = folder.appendingPathComponent("pids")
        let script = """
        #!/usr/bin/env python3
        import os, signal, sys
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        with open(os.path.join(os.path.dirname(__file__), 'pids'), 'a') as f: f.write(str(os.getpid()) + '\\n')
        print('https://native-test.trycloudflare.com', file=sys.stderr, flush=True)
        print('Registered tunnel connection', file=sys.stderr, flush=True)
        while True: signal.pause()
        """
        try script.write(to: executable, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path)
        let tunnel = PublicTunnel(checkReachability: { _ in true })
        do {
            let first = Task { try await tunnel.start(service: "http://127.0.0.1:1", executable: executable) }
            let second = Task { try await tunnel.start(service: "http://127.0.0.1:1", executable: executable) }
            let address = try await first.value
            let other = try await second.value
            try XCTAssertEqual(address, other)
            let pids = try String(contentsOf: pidFile).split(separator: "\n")
            try XCTAssertEqual(pids.count, 1, "Prewarming and Create invite must share one process.")
            let pid = try XCTUnwrap(Int32(pids[0]))
            try XCTAssertEqual(kill(pid, 0), 0)
            await tunnel.stop()
            try XCTAssertEqual(kill(pid, 0), -1, "Shutdown must wait until even an uncooperative child is gone.")
            try XCTAssertEqual(tunnel.origin, nil)
            let cancelled = Task { try await tunnel.start(service: "http://127.0.0.1:1", executable: executable) }
            try await until { (try? String(contentsOf: pidFile).split(separator: "\n").count) == 2 }
            let cancelledPID = try XCTUnwrap(Int32(try String(contentsOf: pidFile).split(separator: "\n")[1]))
            await tunnel.stop()
            do { _ = try await cancelled.value; throw AppError("Cancelled startup unexpectedly succeeded.") }
            catch is CancellationError { }
            try XCTAssertEqual(kill(cancelledPID, 0), -1, "Cancelling startup must also stop its child.")
        } catch { await tunnel.stop(); throw error }
    }
    @MainActor func checkRealTunnel() async throws {
        let server = LocalServer(resources: resources)
        try await server.start()
        let tunnel = PublicTunnel()
        let started = Date()
        tunnel.progress = { state in print(String(format: "%.1fs: %@", Date().timeIntervalSince(started), state.message)); fflush(stdout) }
        do {
            _ = try await tunnel.start(service: server.origin, executable: resources.appendingPathComponent("cloudflared"))
            let ending = Date()
            await tunnel.stop()
            print(String(format: "Tunnel process exited in %.2fs", Date().timeIntervalSince(ending)))
            await server.stop()
        } catch { await tunnel.stop(); await server.stop(); throw error }
    }
    func testOnlyOriginalGoogleDeckLinksAreAccepted() throws {
        try XCTAssertEqual(try PresentationLink(" https://docs.google.com/presentation/u/1/d/deck_123/edit#slide=id.a ").url, "https://docs.google.com/presentation/d/deck_123/present")
        for value in ["javascript:alert(1)", "http://docs.google.com/presentation/d/x", "https://docs.google.com.evil.test/presentation/d/x", "https://user@docs.google.com/presentation/d/x", "https://docs.google.com/presentation/d/e/published", "not a link"] { try XCTAssertThrowsError(try PresentationLink(value)) }
    }
    @MainActor func testNativeEngineControlsOnlySelectedBackgroundDeckAndOneSpeaker() async throws {
        signal(SIGPIPE, SIG_IGN)
        let profile = FileManager.default.temporaryDirectory.appendingPathComponent("nextslide-native-test-" + UUID().uuidString)
        let server = LocalServer(resources: resources); try await server.start()
        let chrome = try await ChromePipe.launch(profile: profile, headless: true)
        let browser = BrowserControl(chrome: chrome, probe: try String(contentsOf: resources.appendingPathComponent("presentation.js")))
        let engine = HostEngine(chrome: chrome)
        var snapshot: [String: Any] = [:]
        var count = 0
        var body = #"<title>Test deck - Google Slides</title><div class="punch-viewer-page-wrapper" style="width:800px;height:500px">Slide <span id="slide">1</span></div><script>document.addEventListener('keydown', event => { if (event.key === 'ArrowRight') document.querySelector('#slide').textContent = String(Number(document.querySelector('#slide').textContent) + 1); });</script>"#
        chrome.onEvent = { event in
            browser.event(event); engine.event(event)
            if event.method == "Fetch.requestPaused", let id = event.params["requestId"] as? String {
                let page = ((event.params["request"] as? [String: Any])?["url"] as? String ?? "").contains("example.test") ? "<input id='work' value='Keep typing here'>" : body
                Task { _ = try? await chrome.send("Fetch.fulfillRequest", ["requestId": id, "responseCode": 200, "responseHeaders": [["name": "Content-Type", "value": "text/html"]], "body": Data(page.utf8).base64EncodedString()], session: event.session) }
            }
        }
        browser.beforeNavigate = { session in _ = try await chrome.send("Fetch.enable", ["patterns": [["urlPattern": "https://*"]]], session: session) }
        engine.onSnapshot = { snapshot = $0 }
        engine.onCommand = { command in try await browser.dispatch(command); count += 1 }
        do {
            _ = try await chrome.send("Target.setDiscoverTargets", ["discover": true])
            try await browser.open("https://docs.google.com/presentation/d/testDeck/edit", activate: false)
            try await until { await browser.inspect().ready }
            let deckSession = try XCTUnwrap(browser.target?.session)
            let otherID = try XCTUnwrap(try await chrome.send("Target.createTarget", ["url": "about:blank", "newWindow": true])["targetId"] as? String)
            let otherSession = try XCTUnwrap(try await chrome.send("Target.attachToTarget", ["targetId": otherID, "flatten": true])["sessionId"] as? String)
            _ = try await chrome.send("Fetch.enable", ["patterns": [["urlPattern": "https://*"]]], session: otherSession)
            _ = try await chrome.send("Page.navigate", ["url": "https://example.test/work"], session: otherSession)
            try await until { (try await chrome.send("Runtime.evaluate", ["expression": "!!document.querySelector('#work')", "returnByValue": true], session: otherSession)["result"] as? [String: Any])?["value"] as? Bool == true }
            _ = try await chrome.send("Target.activateTarget", ["targetId": otherID])
            _ = try await chrome.send("Runtime.evaluate", ["expression": "document.querySelector('#work').focus()"], session: otherSession)
            try await engine.prepare(server: server)
            try await engine.call("start", arguments: [["service": server.origin, "inviteOrigin": server.origin, "createToken": server.hostSecret]])
            try await engine.call("status", arguments: [(await browser.inspect()).dictionary])
            let invite = try XCTUnwrap(URL(string: snapshot["invite"] as? String ?? ""))
            let guest = try await connect(server.origin, invite.lastPathComponent, hello: ["type": "hello", "role": "guest", "token": invite.fragment!, "name": "Taylor"])
            let welcome = try await message(guest, type: "welcome"); let guestID = welcome["peerId"] as! String
            try await until { (snapshot["guests"] as? [[String: Any]])?.count == 1 }
            try await engine.call("allow", arguments: [guestID, true])
            let command: [String: Any] = ["type": "command", "id": "native-test-command-001", "direction": "next", "expiresAt": milliseconds() + 4000]
            try await guest.send(.string(jsonString(["type": "relay", "data": command])))
            let ack = try await message(guest, type: "relay", dataType: "ack")
            try XCTAssertEqual((ack["data"] as? [String: Any])?["ok"] as? Bool, true)
            try await guest.send(.string(jsonString(["type": "relay", "data": command])))
            _ = try await message(guest, type: "relay", dataType: "ack")
            try XCTAssertEqual(count, 1, "A duplicate packet must not advance twice.")
            let slide = try await chrome.send("Runtime.evaluate", ["expression": "document.querySelector('#slide').textContent", "returnByValue": true], session: deckSession)
            try XCTAssertEqual((slide["result"] as? [String: Any])?["value"] as? String, "2")
            let focus = try await chrome.send("Runtime.evaluate", ["expression": "document.activeElement.id", "returnByValue": true], session: otherSession)
            try XCTAssertEqual((focus["result"] as? [String: Any])?["value"] as? String, "work")
            let second = try await connect(server.origin, invite.lastPathComponent, hello: ["type": "hello", "role": "guest", "token": invite.fragment!, "name": "Morgan"])
            let secondWelcome = try await message(second, type: "welcome")
            try await until { (snapshot["guests"] as? [[String: Any]])?.count == 2 }
            try await engine.call("allow", arguments: [secondWelcome["peerId"]!, true])
            try await until { (snapshot["guests"] as? [[String: Any]])?.first(where: { $0["id"] as? String == guestID })?["enabled"] as? Bool == false }
            var blocked = command; blocked["id"] = "native-test-command-002"; blocked["expiresAt"] = milliseconds() + 4000
            try await guest.send(.string(jsonString(["type": "relay", "data": blocked])))
            let denied = try await message(guest, type: "relay", dataType: "ack")
            try XCTAssertEqual((denied["data"] as? [String: Any])?["ok"] as? Bool, false)
            try XCTAssertEqual(count, 1)
            // Exercise the actual browser remote against the hidden native host engine.
            let remoteID = try XCTUnwrap(try await chrome.send("Target.createTarget", ["url": invite.absoluteString, "background": true])["targetId"] as? String)
            let remoteSession = try XCTUnwrap(try await chrome.send("Target.attachToTarget", ["targetId": remoteID, "flatten": true])["sessionId"] as? String)
            try await until { (try await chrome.send("Runtime.evaluate", ["expression": "!!document.querySelector('#speaker-name')", "returnByValue": true], session: remoteSession)["result"] as? [String: Any])?["value"] as? Bool == true }
            _ = try await chrome.send("Runtime.evaluate", ["expression": "Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(document.querySelector('#speaker-name'), 'Browser speaker'); document.querySelector('#speaker-name').dispatchEvent(new Event('input', {bubbles:true}));"], session: remoteSession)
            try await until { (try await chrome.send("Runtime.evaluate", ["expression": "document.querySelector('.remote-join')?.disabled === false", "returnByValue": true], session: remoteSession)["result"] as? [String: Any])?["value"] as? Bool == true }
            _ = try await chrome.send("Runtime.evaluate", ["expression": "document.querySelector('.remote-join').click()"], session: remoteSession)
            try await until { (snapshot["guests"] as? [[String: Any]])?.count == 3 }
            let webGuest = try XCTUnwrap((snapshot["guests"] as? [[String: Any]])?.first(where: { $0["name"] as? String == "Browser speaker" }))
            try await engine.call("allow", arguments: [webGuest["id"]!, true])
            try await until { (snapshot["guests"] as? [[String: Any]])?.first(where: { $0["name"] as? String == "Browser speaker" })?["direct"] as? Bool == true }
            try await until { (try await chrome.send("Runtime.evaluate", ["expression": "document.querySelector('.remote-next')?.disabled === false", "returnByValue": true], session: remoteSession)["result"] as? [String: Any])?["value"] as? Bool == true }
            _ = try await chrome.send("Runtime.evaluate", ["expression": "document.querySelector('.remote-next').click()"], session: remoteSession)
            try await until { count == 2 }
            let directSlide = try await chrome.send("Runtime.evaluate", ["expression": "document.querySelector('#slide').textContent", "returnByValue": true], session: deckSession)
            try XCTAssertEqual((directSlide["result"] as? [String: Any])?["value"] as? String, "3")
            print("Verified direct WebRTC from the browser remote to the native host.")
            body = "<a href='https://accounts.google.com/ServiceLogin'>Sign in</a>"
            try await browser.open("https://docs.google.com/presentation/d/testDeck/present", activate: false)
            try await until { await browser.inspect().remoteMessage == "The host needs to sign in to Google." }
            body = "<h1>You need access</h1>"
            try await browser.open("https://docs.google.com/presentation/d/testDeck/present", activate: false)
            try await until { await browser.inspect().remoteMessage == "The host needs access to the presentation." }
            _ = try await chrome.send("Page.navigate", ["url": "https://docs.google.com/presentation/d/differentDeck/present"], session: deckSession)
            try await until { await browser.inspect().message.contains("selected deck") }
            await engine.close(); _ = try await message(second, type: "ended")
            guest.cancel(with: .goingAway, reason: nil); second.cancel(with: .goingAway, reason: nil)
            await chrome.close(); await server.stop(); try? FileManager.default.removeItem(at: profile)
        } catch { await engine.close(); await chrome.close(); await server.stop(); try? FileManager.default.removeItem(at: profile); throw error }
    }
}

func XCTUnwrap<T>(_ value: T?) throws -> T { guard let value else { throw AppError("Expected a value.") }; return value }
func XCTAssertEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String = "", file: StaticString = #filePath, line: UInt = #line) throws { guard actual == expected else { throw AppError("\(file):\(line): Expected \(expected), got \(actual). \(message)") } }
func XCTAssertThrowsError<T>(_ action: @autoclosure () throws -> T) throws { do { _ = try action() } catch { return }; throw AppError("Expected rejection.") }
@main enum NativeChecks {
    @MainActor static func main() async {
        let tests = NativeIntegrationTests()
        do {
            if CommandLine.arguments.contains("--tunnel-smoke") { try await tests.checkRealTunnel(); return }
            try await tests.testTunnelSharesStartupAndWaitsForCleanup(); print("PASS: Shared tunnel startup, cancellation, and child-process cleanup")
            try tests.testOnlyOriginalGoogleDeckLinksAreAccepted(); print("PASS: Google Slides URL validation")
            try await tests.testNativeServerAuthenticatesAndPinsGuestIdentity(); print("PASS: Native server authentication, identity routing, and session teardown")
            try await tests.testNativeEngineControlsOnlySelectedBackgroundDeckAndOneSpeaker(); print("PASS: Native Chrome pipe, background deck control, deduplication, exclusive approval, sign-in and access states")
            print("4 native integration checks passed.")
        } catch { fputs("FAIL: \(error.localizedDescription)\n", stderr); exit(1) }
    }
}

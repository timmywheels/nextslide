import Foundation
import NIOCore
import NIOPosix
import NIOHTTP1
import NIOWebSocket

// Every connection and all session state share one event loop. No user browser
// control endpoint is exposed here; the Chrome pipe remains private to the app.
final class LocalServer {
    let hostSecret = secretToken()
    private let group = MultiThreadedEventLoopGroup(numberOfThreads: 1)
    private var listener: Channel?
    private var cleanup: RepeatedTask?
    private let store: SessionStore
    private(set) var origin = ""

    init(resources: URL) { store = SessionStore(resources: resources) }

    func start() async throws {
        store.hostSecret = hostSecret
        let store = self.store
        let channel = try await ServerBootstrap(group: group)
            .serverChannelOption(ChannelOptions.backlog, value: 128)
            .serverChannelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
            .childChannelOption(ChannelOptions.socketOption(.tcp_nodelay), value: 1)
            .childChannelInitializer { channel in
                let http = HTTPHandler(store: store)
                let upgrader = NIOWebSocketServerUpgrader(maxFrameSize: 16384, shouldUpgrade: { channel, head in
                    let allowed = head.uri.hasPrefix("/ws/desktop/") && store.sockets.count < 128
                    return channel.eventLoop.makeSucceededFuture(allowed ? HTTPHeaders() : nil)
                }, upgradePipelineHandler: { channel, head in
                    let id = String(head.uri.dropFirst("/ws/desktop/".count)).components(separatedBy: "?")[0]
                    return channel.pipeline.addHandler(SocketHandler(store: store, roomID: id))
                })
                return channel.pipeline.configureHTTPServerPipeline(withServerUpgrade: (upgraders: [upgrader], completionHandler: { context in
                    context.pipeline.removeHandler(http, promise: nil)
                })).flatMap { channel.pipeline.addHandler(http) }
            }.bind(host: "127.0.0.1", port: 0).get()
        listener = channel
        origin = "http://127.0.0.1:\(channel.localAddress!.port!)"
        cleanup = channel.eventLoop.scheduleRepeatedTask(initialDelay: .seconds(25), delay: .seconds(25)) { _ in store.cleanup() }
    }
    func stop() async {
        guard let listener else { return }
        self.listener = nil
        cleanup?.cancel(); cleanup = nil
        let store = self.store
        try? await listener.eventLoop.submit { store.endAll() }.get()
        try? await listener.close().get()
        try? await group.shutdownGracefully()
    }
}

private final class Speaker {
    let id = secretToken(), resume = secretToken()
    var name: String
    var socket: SessionSocket?
    init(name: String) { self.name = name }
    var roster: [String: Any] { ["id": id, "name": name, "online": socket?.channel.isActive == true] }
}
private final class Room {
    let id = secretToken(), hostToken = secretToken(), inviteToken = secretToken()
    let expires = milliseconds() + 4 * 60 * 60 * 1000
    var host: SessionSocket?
    var guests: [String: Speaker] = [:]
}
private final class SessionSocket {
    let id = UUID(), channel: Channel, roomID: String
    var role: String?, speaker: Speaker?
    var rateUntil = milliseconds() + 1000, rateCount = 0, alive = true
    var deadline: Scheduled<Void>?
    init(channel: Channel, roomID: String) { self.channel = channel; self.roomID = roomID }
    func send(_ message: [String: Any]) {
        guard channel.isActive, channel.isWritable else { return }
        let data = jsonData(message)
        guard data.count <= 65536 else { return }
        var buffer = channel.allocator.buffer(capacity: data.count); buffer.writeBytes(data)
        channel.writeAndFlush(WebSocketFrame(fin: true, opcode: .text, data: buffer), promise: nil)
    }
    func close(_ error: String? = nil) {
        if let error { send(["type": "error", "error": error]) }
        var buffer = channel.allocator.buffer(capacity: 2); buffer.writeInteger(UInt16(error == nil ? 1000 : 1008))
        channel.writeAndFlush(WebSocketFrame(fin: true, opcode: .connectionClose, data: buffer)).whenComplete { _ in self.channel.close(promise: nil) }
    }
}
// Mutable state is confined to the server’s single NIO event loop.
private final class SessionStore: @unchecked Sendable {
    var hostSecret = ""
    var rooms: [String: Room] = [:]
    var sockets: [UUID: SessionSocket] = [:]
    var createWindow = milliseconds(), createCount = 0
    let resources: URL
    init(resources: URL) { self.resources = resources }
    func end(_ room: Room) {
        rooms.removeValue(forKey: room.id)
        for socket in [room.host] + room.guests.values.map(\.socket) {
            socket?.send(["type": "ended"]); socket?.close()
        }
    }
    func endAll() { for room in Array(rooms.values) { end(room) }; for socket in sockets.values { socket.channel.close(promise: nil) } }
    func cleanup() {
        for room in Array(rooms.values) where room.expires <= milliseconds() { end(room) }
        for socket in sockets.values {
            if !socket.alive { socket.channel.close(promise: nil); continue }
            socket.alive = false
            socket.channel.writeAndFlush(WebSocketFrame(fin: true, opcode: .ping, data: ByteBuffer()), promise: nil)
        }
    }
    func joined(_ socket: SessionSocket) {
        sockets[socket.id] = socket
        guard let room = rooms[socket.roomID], room.expires > milliseconds() else { socket.send(["type": "ended"]); socket.close(); return }
        socket.deadline = socket.channel.eventLoop.scheduleTask(in: .seconds(10)) { socket.close("Connection timed out.") }
    }
    func left(_ socket: SessionSocket) {
        socket.deadline?.cancel(); sockets.removeValue(forKey: socket.id)
        guard let room = rooms[socket.roomID] else { return }
        if room.host === socket {
            room.host = nil
            for speaker in room.guests.values { speaker.socket?.send(["type": "host_status", "online": false]) }
        } else if let speaker = socket.speaker, speaker.socket === socket {
            speaker.socket = nil; room.host?.send(["type": "guest_left", "peerId": speaker.id])
        }
    }
    func received(_ socket: SessionSocket, _ bytes: Data) {
        guard bytes.count <= 16384, let message = jsonObject(bytes), let room = rooms[socket.roomID] else { socket.close(); return }
        if socket.rateUntil <= milliseconds() { socket.rateUntil = milliseconds() + 1000; socket.rateCount = 0 }
        socket.rateCount += 1
        guard socket.rateCount <= 100 else { socket.close("Too many messages."); return }
        guard let role = socket.role else {
            guard message["type"] as? String == "hello" else { socket.close("Join the session first."); return }
            if message["role"] as? String == "host", secretEqual(message["token"] as? String, room.hostToken) {
                room.host?.close(); room.host = socket; socket.role = "host"
                socket.send(["type": "welcome", "peerId": "host", "peers": room.guests.values.map(\.roster)])
                for speaker in room.guests.values { speaker.socket?.send(["type": "host_status", "online": true]) }
            } else if message["role"] as? String == "guest", secretEqual(message["token"] as? String, room.inviteToken) {
                let name = String((message["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(48))
                guard !name.isEmpty else { socket.close("Enter your name."); return }
                let existing = room.guests.values.first { secretEqual(message["resumeToken"] as? String, $0.resume) }
                guard existing != nil || room.guests.count < 32 else { socket.close("This session has reached its speaker limit."); return }
                let speaker = existing ?? Speaker(name: name)
                speaker.socket?.close(); speaker.socket = socket; speaker.name = name
                room.guests[speaker.id] = speaker; socket.speaker = speaker; socket.role = "guest"
                socket.send(["type": "welcome", "peerId": speaker.id, "resumeToken": speaker.resume])
                socket.send(["type": "host_status", "online": room.host?.channel.isActive == true])
                room.host?.send(["type": "guest_joined", "guest": speaker.roster])
            } else { socket.close("Invalid invite. Ask the host for a new link."); return }
            socket.deadline?.cancel(); return
        }
        guard (role == "host" && room.host === socket) || (role == "guest" && socket.speaker?.socket === socket) else { return }
        let type = message["type"] as? String ?? ""
        if role == "host", type == "end" { end(room); return }
        guard ["signal", "relay"].contains(type), let data = message["data"] as? [String: Any] else { return }
        if role == "host", let peer = message["peerId"] as? String {
            room.guests[peer]?.socket?.send(["type": type, "peerId": "host", "data": data])
        } else if let speaker = socket.speaker {
            room.host?.send(["type": type, "peerId": speaker.id, "data": data])
        }
    }
}

private final class SocketHandler: ChannelInboundHandler {
    typealias InboundIn = WebSocketFrame
    let store: SessionStore, roomID: String
    var socket: SessionSocket?
    var fragments = Data()
    var fragmenting = false
    init(store: SessionStore, roomID: String) { self.store = store; self.roomID = roomID }
    func handlerAdded(context: ChannelHandlerContext) {
        let socket = SessionSocket(channel: context.channel, roomID: roomID); self.socket = socket; store.joined(socket)
    }
    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        guard let socket else { return }
        let frame = unwrapInboundIn(data)
        switch frame.opcode {
        case .ping: context.writeAndFlush(NIOAny(WebSocketFrame(fin: true, opcode: .pong, data: frame.unmaskedData)), promise: nil)
        case .pong: socket.alive = true
        case .connectionClose: socket.close()
        case .text, .continuation:
            if frame.opcode == .text {
                guard !fragmenting else { socket.close(); return }
                fragments.removeAll(keepingCapacity: true)
            } else if !fragmenting { socket.close(); return }
            fragments.append(contentsOf: frame.unmaskedData.readableBytesView)
            guard fragments.count <= 16384 else { socket.close(); return }
            fragmenting = !frame.fin
            if frame.fin { store.received(socket, fragments); fragments.removeAll(keepingCapacity: true) }
        default: socket.close()
        }
    }
    func channelInactive(context: ChannelHandlerContext) { if let socket { store.left(socket) } }
    func errorCaught(context: ChannelHandlerContext, error: Error) { context.close(promise: nil) }
}

private final class HTTPHandler: ChannelInboundHandler, RemovableChannelHandler {
    typealias InboundIn = HTTPServerRequestPart
    typealias OutboundOut = HTTPServerResponsePart
    let store: SessionStore
    var head: HTTPRequestHead?
    var bodySize = 0
    init(store: SessionStore) { self.store = store }
    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        switch unwrapInboundIn(data) {
        case .head(let head): self.head = head; bodySize = 0
        case .body(let body): bodySize += body.readableBytes; if bodySize > 16384 { context.close(promise: nil) }
        case .end:
            guard let head else { return }; respond(context, head); self.head = nil
        }
    }
    func respond(_ context: ChannelHandlerContext, _ request: HTTPRequestHead) {
        let path = request.uri.components(separatedBy: "?")[0].removingPercentEncoding ?? ""
        if request.method == .OPTIONS { send(context, .noContent, Data()); return }
        if request.method == .GET, path == "/health" { send(context, .ok, jsonData(["status": "ok"])); return }
        if request.method == .POST, path == "/api/desktop/sessions" {
            guard secretEqual(request.headers.first(name: "X-Nextslide-Host"), store.hostSecret) else { send(context, .forbidden, jsonData(["error": "Not authorized"])); return }
            if milliseconds() - store.createWindow > 60000 { store.createWindow = milliseconds(); store.createCount = 0 }
            store.createCount += 1
            guard store.createCount <= 20, store.rooms.count < 8 else { send(context, .tooManyRequests, jsonData(["error": "Please wait before creating another session."])); return }
            let room = Room(); store.rooms[room.id] = room
            send(context, .ok, jsonData(["id": room.id, "hostToken": room.hostToken, "inviteToken": room.inviteToken])); return
        }
        if request.method == .DELETE, path.hasPrefix("/api/desktop/sessions/") {
            let id = String(path.dropFirst("/api/desktop/sessions/".count))
            guard let room = store.rooms[id] else { send(context, .noContent, Data()); return }
            guard secretEqual(request.headers.first(name: "Authorization"), "Bearer " + room.hostToken) else { send(context, .forbidden, Data()); return }
            store.end(room); send(context, .noContent, Data()); return
        }
        guard request.method == .GET, !path.contains(".."), !path.contains("\\"), !path.contains("\0") else { send(context, .notFound, Data()); return }
        let engine = path.hasPrefix("/engine/")
        if engine && !secretEqual(request.headers.first(name: "X-Nextslide-Host"), store.hostSecret) { send(context, .forbidden, Data()); return }
        let root = store.resources.appendingPathComponent(engine ? "engine" : "remote")
        let relative = engine ? String(path.dropFirst("/engine/".count)) : path.hasPrefix("/r/") || path == "/" ? "index.html" : String(path.dropFirst())
        let file = root.appendingPathComponent(relative).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let contents = try? Data(contentsOf: file), contents.count < 8 * 1024 * 1024 else { send(context, .notFound, Data()); return }
        let mime = ["html": "text/html; charset=utf-8", "js": "application/javascript", "css": "text/css", "png": "image/png", "svg": "image/svg+xml", "woff": "font/woff", "woff2": "font/woff2"][file.pathExtension] ?? "application/octet-stream"
        send(context, .ok, contents, mime: mime)
    }
    func send(_ context: ChannelHandlerContext, _ status: HTTPResponseStatus, _ data: Data, mime: String = "application/json") {
        let headers = HTTPHeaders([("Content-Type", mime), ("Content-Length", String(data.count)), ("Connection", "close"), ("Cache-Control", "no-store"), ("Access-Control-Allow-Origin", "null"), ("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Nextslide-Host"), ("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"), ("X-Content-Type-Options", "nosniff")])
        context.write(wrapOutboundOut(.head(HTTPResponseHead(version: .http1_1, status: status, headers: headers))), promise: nil)
        if !data.isEmpty { var buffer = context.channel.allocator.buffer(capacity: data.count); buffer.writeBytes(data); context.write(wrapOutboundOut(.body(.byteBuffer(buffer))), promise: nil) }
        context.writeAndFlush(wrapOutboundOut(.end(nil))).whenComplete { _ in context.close(promise: nil) }
    }
    func errorCaught(context: ChannelHandlerContext, error: Error) { context.close(promise: nil) }
}

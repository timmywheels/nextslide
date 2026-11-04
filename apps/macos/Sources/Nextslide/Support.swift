import Foundation
import Security

struct AppError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

func secretToken() -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    precondition(SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess)
    return Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
}
func secretEqual(_ value: String?, _ secret: String) -> Bool {
    guard let value, value.utf8.count == secret.utf8.count else { return false }
    return zip(value.utf8, secret.utf8).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
}
func jsonData(_ value: Any) -> Data { (try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys])) ?? Data("null".utf8) }
func jsonString(_ value: Any) -> String { String(decoding: jsonData(value), as: UTF8.self) }
func jsonObject(_ data: Data) -> [String: Any]? { (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] }
let milliseconds: () -> Double = { Date().timeIntervalSince1970 * 1000 }

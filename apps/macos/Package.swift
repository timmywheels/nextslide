// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Nextslide",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Nextslide", targets: ["Nextslide"])],
    dependencies: [.package(url: "https://github.com/apple/swift-nio.git", from: "2.101.2")],
    targets: [
        .target(name: "NextslideCore", dependencies: [
            .product(name: "NIOCore", package: "swift-nio"),
            .product(name: "NIOPosix", package: "swift-nio"),
            .product(name: "NIOHTTP1", package: "swift-nio"),
            .product(name: "NIOWebSocket", package: "swift-nio")
        ], path: "Sources/Nextslide"),
        .executableTarget(name: "Nextslide", dependencies: ["NextslideCore"], path: "Sources/Launcher"),
        .executableTarget(name: "NextslideChecks", dependencies: ["NextslideCore"], path: "Tests/NextslideTests")
    ]
)

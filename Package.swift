// swift-tools-version:6.0
// Swift package of simple-sdp for iOS and macOS: the WebAssembly build of the library
// (assembly/, an AssemblyScript port of src/) running on the WasmKit interpreter.
import PackageDescription

let package = Package(
    name: "SimpleSdp",
    // WasmKit 0.4 requires iOS 18 / macOS 15
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "SimpleSdp", targets: ["SimpleSdp"]),
    ],
    dependencies: [
        .package(url: "https://github.com/swiftwasm/WasmKit.git", .upToNextMinor(from: "0.4.2")),
    ],
    targets: [
        .target(
            name: "SimpleSdp",
            dependencies: [.product(name: "WasmKit", package: "WasmKit")],
            path: "platforms/apple/Sources/SimpleSdp",
            resources: [.copy("Resources/simple-sdp.wasm")]
        ),
        .testTarget(
            name: "SimpleSdpTests",
            dependencies: ["SimpleSdp"],
            path: "platforms/apple/Tests/SimpleSdpTests"
        ),
    ]
)

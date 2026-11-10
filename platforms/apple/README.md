# simple-sdp for Swift (iOS / macOS)

Parse, write and validate SDP (RFC 8866) on iOS 18+ and macOS 15+. The package runs the
WebAssembly build of [simple-sdp](../../readme.md) (an AssemblyScript port of the TypeScript
package, `assembly/`) on [WasmKit](https://github.com/swiftwasm/WasmKit), a wasm interpreter
written in Swift: no JIT, App Store compatible.

```swift
// Package.swift
.package(url: "https://github.com/irbisadm/simple-sdp.git", from: "1.4.0")
// target dependency: .product(name: "SimpleSdp", package: "simple-sdp")
```

```swift
import SimpleSdp

let sdp = try SimpleSdp()                   // load once, reuse; thread-safe

let json = try sdp.parseJSON(offer)         // Data: JSON of the TypeScript `Sdp` model
let issues = try sdp.validate(json: json, type: .offer)
let text = try sdp.write(json: json)        // lossless: every line of `offer` is kept

let model = try sdp.parse(offer)            // [String: Any], for quick reads and edits

do {
    _ = try sdp.parse(text)
} catch let error as SdpParseError {
    print(error.lineNumber, error.line, error.reason)
}
```

- `parseJSON(_:) -> Data`, `parse(_:) -> [String: Any]`, `isValid(_:)`
- Swift dictionaries do not keep key order, so a model that went through `[String: Any]`
  may be written with fmtp parameters, ssrc attributes and candidate extensions in another
  order. Work on the JSON (`parseJSON` → your editor of choice → `write(json:)`) when the
  output must keep every line as it was.
- `write(_:)`, `write(json:)` — throws `SdpModelError`
- `validate(_:type:)`, `validate(model:type:)`, `validate(json:type:)` → `[SdpIssue]`
- `parseLenientJSON(_:) -> (sdp: Data, warnings: [SdpParseWarning])`, `parseLenient(_:) -> (sdp: [String: Any], warnings: [SdpParseWarning])`
  — never throw `SdpParseError`; see "Lenient parsing" in the [main README](../../readme.md#lenient-parsing)
- `validateLenient(_:type:)` → `[SdpIssue]`, with `lenient:<code>` issues for the parse warnings
- `resolve(_:)`, `resolve(json:)` → `[String: Any]` (the shape of `SdpResolved`);
  `negotiate(offer:answer:)`, `negotiate(offerJSON:answerJSON:)` → `[String: Any]` (the shape of
  `SdpNegotiation`) — throw `SdpModelError`; see "Resolve and negotiate" in the
  [main README](../../readme.md#resolve-and-negotiate)

## Build

```sh
swift test -c release   # from the repository root; tests use test/fixtures
```

`Sources/SimpleSdp/Resources/simple-sdp.wasm` is produced by `yarn asbuild` in the
repository root.

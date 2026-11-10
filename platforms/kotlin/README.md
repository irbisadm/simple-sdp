# simple-sdp for Kotlin (JVM / Android)

Parse, write and validate SDP (RFC 8866) on the JVM and on Android. The library runs the
WebAssembly build of [simple-sdp](../../readme.md) (an AssemblyScript port of the TypeScript
package, `assembly/`) with [Chicory](https://chicory.dev). The module is compiled to JVM
bytecode when the library is built (`compileWasm` task), so Android needs neither native
code nor run-time code generation. Runtime dependencies: `chicory:runtime` and
`kotlinx-serialization-json`.

```kotlin
// settings.gradle.kts: dependencyResolutionManagement { repositories { maven("https://jitpack.io") } }
implementation("com.github.irbisadm:simple-sdp:v1.5.0")
```

```kotlin
val sdp = SimpleSdp()                       // load once, reuse; thread-safe

val model = sdp.parse(offer)                // JsonObject, shape of the TypeScript `Sdp`
val issues = sdp.validate(model, SdpType.OFFER)
val text = sdp.write(model)

try {
    sdp.parse(text)
} catch (e: SdpParseException) {
    e.lineNumber; e.line; e.reason
}
```

- `parse(sdp): JsonObject`, `parseToJson(sdp): String`, `isValid(sdp)`
- `write(model: JsonObject)`, `write(modelJson: String)` — throws `SdpModelException`
- `validate(sdp: String, type)`, `validate(model: JsonObject, type)`, `validateModel(json, type)` → `List<SdpIssue>`
- `parseLenient(sdp): SdpLenientResult` (`sdp: JsonObject`, `warnings: List<SdpParseWarning>`) — never throws
  `SdpParseException`; see "Lenient parsing" in the [main README](../../readme.md#lenient-parsing)
- `validateLenient(sdp: String, type)` → `List<SdpIssue>`, with `lenient:<code>` issues for the parse warnings
- `resolve(model: JsonObject)`, `resolve(modelJson: String)` → `JsonObject` (the shape of `SdpResolved`);
  `negotiate(offer, answer)` with `JsonObject`s or JSON strings → `JsonObject` (the shape of `SdpNegotiation`)
  — throw `SdpModelException`; see "Resolve and negotiate" in the [main README](../../readme.md#resolve-and-negotiate)

## Build

```sh
./gradlew test        # tests use ../../test/fixtures
```

`src/main/wasm/simple-sdp.wasm` is produced by `yarn asbuild` in the repository root.
`SimpleSdp(wasmBytes)` runs another build of the module on the Chicory interpreter.

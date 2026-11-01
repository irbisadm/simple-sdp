# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project
follows [Semantic Versioning](https://semver.org/).

## [1.2.1-rc.1] — 2026-11-01

### Changed
- Releases are published to npm by CI (`release.yml`) with npm trusted publishing, so
  every version from now on carries an npm provenance attestation.

## [1.2.0] — 2026-11-01

### Added
- `@irbisadm/simple-sdp/wasm`: the same API and types as the main entry point, run by the
  WebAssembly module (ESM with top-level await; works in Node.js and with bundlers that
  handle `new URL(…, import.meta.url)`, checked with Vite 6). The module itself is
  exported as `@irbisadm/simple-sdp/wasm/simple-sdp.wasm`.
- Kotlin library on JitPack: `com.github.irbisadm:simple-sdp:v1.2.0` (`jitpack.yml`).
- GitHub Releases carry `simple-sdp.wasm` for other runtimes (`.github/workflows/release.yml`).

## [1.1.0] — 2026-11-01

### Added
- AssemblyScript port (`assembly/`): the parser, writer and validator compiled to a
  WebAssembly module with no imports (`yarn asbuild`). Results are JSON with the shape of
  the TypeScript model; a C-style interface on UTF-8 buffers (`sdp_parse`, `sdp_write`,
  `sdp_validate`, `sdp_validate_model`, …) serves non-JS hosts. `yarn test:wasm` runs the
  test suites against the module, plus a differential test against the TypeScript code.
- Swift package `SimpleSdp` for iOS 18+ / macOS 15+ (WasmKit), `Package.swift` in the root.
- Kotlin library `dev.irbisadm:simple-sdp` for Android and the JVM (Chicory; the module is
  compiled to bytecode at build time), `platforms/kotlin`.

### Fixed
- Attributes named like `Object.prototype` members (`a=constructor`, `a=toString`,
  `a=__proto__`, …) failed to parse; an ssrc attribute with such a name was dropped, a
  `__proto__` key of fmtp/ssrc/candidate records changed the object prototype, and
  `a=fingerprint:constructor …` got a validator message with "function Object()".

## [1.0.1] — 2026-11-01

### Fixed
- Validator accepted malformed `a=fingerprint` values such as `sha-256 AA:BB`.
  New issue `invalid-fingerprint` (error) checks that `a=fingerprint` is colon-separated
  hex pairs with the digest length of its hash function (md2/md5 16, sha-1 20, sha-224 28,
  sha-256 32, sha-384 48, sha-512 64 bytes); `fingerprint-not-uppercase` (warning).
  RFC 8122 §5.
- `package.json`: `repository` in the normalized object form (no `npm publish` warning).

## [1.0.0] — 2026-11-01

The model of 0.2.0 is now the stable 1.x API. No breaking changes since 0.2.0.

### Added
- `sdpWriter.write(sdp): string`. Lines are written in RFC 8866 §5 order with CRLF;
  attribute order inside a section is normalized (see README, "Writing"). Round-trip
  tests cover every fixture.
- `sdpValidator.validate(sdp | text, {type?}): SdpIssue[]`, plus types `SdpIssue`,
  `SdpIssueCode` and `SdpValidateOptions` (rules: README, "Validation").
- `package.json`: an `exports` map with `types` and `sideEffects: false`.

## [0.2.0] — not published

Parser rewrite: strict RFC 8866, a lossless model, typed WebRTC attributes. **Breaking.**

### Fixed
- Time unit `h` in `r=`/`t=`/`z=` is 3600 s, not 86400 s (RFC 8866 §5.10).
- `a=sendonly`, `a=recvonly` and `a=inactive` were not recognized as directions
  (only `sendrecv` was).
- `r=`: active duration was read from the repeat-interval field, and offsets were dropped
  unless the line had more than three fields.
- `b=`: `bwtype` contained the `b=` prefix (`"b=AS"`).
- `u=` overwrote `i=` instead of being stored as `uri`.
- Media-level `i=`, `b=` and `k=` overwrote the session-level fields.
- `a=rtcp-fb` kept only its first token (`nack pli` → `nack`).
- `a=group` with semantics other than the seven built-in ones was silently dropped.

### Added
- `SdpParseError` (`lineNumber`, `line`, `reason`). It is thrown for malformed lines,
  unknown line types, line order violations (RFC 8866 §5), missing `v=`/`o=`/`s=`/`t=`
  and malformed typed attributes.
- `z=` (time zone adjustments), multiple `b=`/`e=`/`p=` lines, LF-only line endings.
- Typed attributes:
  `a=candidate` (RFC 8839), `a=end-of-candidates` (RFC 8840), `a=ice-lite`,
  `a=ssrc` / `a=ssrc-group` (RFC 5576), `a=msid` (RFC 8830), `a=rid` (RFC 8851),
  `a=simulcast` (RFC 8853), `a=rtcp-mux` (RFC 5761), `a=rtcp-rsize` (RFC 5506),
  `a=extmap-allow-mixed` (RFC 8285), `a=rtcp` (RFC 3605), `a=sctp-port` and
  `a=max-message-size` (RFC 8841). The `a=extmap` direction and extension attributes
  are now kept as well.
- A known attribute outside its scope (e.g. `a=mid` at session level), or `rtpmap`/`fmtp`/`rtcp-fb`
  for a payload type missing from `m=`, is kept in `attributes` instead of being lost.
- Test fixtures: real SDP from Chrome 156, Firefox 159, Chrome (2023) and SIP devices.

### Changed (migration from 0.1.x)

| 0.1.x | 0.2.0 |
|---|---|
| `protocolVersion?`, `origin?`, `sessionName?`, `timing?`, `media?` | required (always present after parsing) |
| `origin.sessVersion: number` | `string` (like `sessId`; 64-bit values exist) |
| `origin.netType: 'IN'`, `addrType: 'IP4' \| 'IP6'` (others became `undefined`) | `string`, kept verbatim |
| `repeat[]` (session level) | `timing[i].repeat[]` (belongs to its `t=`) |
| `emailAddress`, `phoneNumber` | `emailAddresses[]`, `phoneNumbers[]` |
| `encryptionKeys[]` | `encryptionKey` (at most one per level) |
| `bandwidthInformation` | `bandwidths[]` |
| `ice.ufrag` / `ice.pwd` / `ice.options` | `iceUfrag` / `icePwd` / `iceOptions` |
| `dtls.algorithm` + `dtls.fingerprint` | `fingerprints[]: {hashFunction, fingerprint}` |
| `dtls.setup` (defaulted to `actpass` when absent) | `setup` (absent when absent) |
| `group[].token` | `group[].semantics` |
| `media[].ports: number[]` | `port`, `numberOfPorts?` |
| `media[].fmt[]` (`contentType: 'opus/48000/2'`, `formatParameters`) | `codecs[]` (`encodingName`, `clockRate`, `encodingParameters`, `parameters`, `rtcpFeedback`) |
| fmtp parameter without value → `'unknown'` | `null` |
| `media[].fmtp[]` / `media[].description` (non-RTP) | `formats[]` |
| `extmap: Record<number, string>` | `extmap: SdpExtmap[]` |
| `msid?: {streamId, trackId}` | `msid?: SdpMsid[]` |
| `attributes: Record<string, string \| true \| string[]>` | `attributes: {name, value?}[]` in original order |
| types `SdpAVMediaSection`, `SdpAppMediaSection`, `SdpOtherMediaSection` | `SdpMediaSection` |
| types `SdpAttribute`, `SdpIceAttributes`, `SdpDtlsAttribute` | `SdpGenericAttribute`, flat fields |
| invalid input sometimes produced `NaN` or partial objects | `SdpParseError` |

## [0.1.1] — 2023-03-20

- Initial public release: `sdpReader.parse`, `sdpReader.isValid`.

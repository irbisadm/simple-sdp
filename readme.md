![license MIT](https://badgen.net/npm/license/@irbisadm/simple-sdp)
![npm version](https://badgen.net/npm/v/@irbisadm/simple-sdp)
![npm types](https://badgen.net/npm/types/@irbisadm/simple-sdp)
![bundlephobia min-zip size](https://badgen.net/bundlephobia/minzip/@irbisadm/simple-sdp)
![bundlephobia dependency count](https://badgen.net/bundlephobia/dependency-count/@irbisadm/simple-sdp)
![CI](https://github.com/irbisadm/simple-sdp/actions/workflows/ci.yml/badge.svg)

# simple-sdp

Parse, modify, write and validate Session Description Protocol
([RFC 8866](https://www.rfc-editor.org/rfc/rfc8866)) messages for WebRTC and SIP.
TypeScript, no runtime dependencies, works in Node.js and browsers.

- **`sdpReader.parse`**: strict. Line order and mandatory lines are checked against
  RFC 8866 §5. Every error is an `SdpParseError` with a line number.
- **Lossless model**: each line maps to a typed field or, for attributes the library
  does not interpret, to an ordered `attributes` entry with the exact original value.
- **`sdpWriter.write`**: serializes the model back to RFC 8866 text (CRLF).
  `write(parse(x))` keeps every line of `x`; attribute order and time units are
  normalized (see [Writing](#writing)).
- **`sdpValidator.validate`**: reports RFC and WebRTC rule violations as a list of issues.
- **Typed WebRTC attributes**: ICE, DTLS, BUNDLE, codecs, simulcast, SSRCs (see below).

```sh
npm install @irbisadm/simple-sdp
```

## Usage

### Parse → modify → write

```ts
import {sdpReader, sdpWriter, sdpValidator} from '@irbisadm/simple-sdp';

const sdp = sdpReader.parse(offer.sdp);

// Keep only Opus and ask for stereo
for (const m of sdp.media.filter(m => m.type === 'audio')) {
  m.codecs = m.codecs?.filter(c => c.encodingName === 'opus');
  m.codecs?.forEach(c => c.parameters = {...c.parameters, stereo: '1'});
}
sdp.origin.sessVersion = String(BigInt(sdp.origin.sessVersion) + 1n);

sdpValidator.validate(sdp, {type: 'offer'}); // [] — no issues
await pc.setLocalDescription({type: 'offer', sdp: sdpWriter.write(sdp)});
```

The `m=` payload type list is derived from `codecs`, so removing a codec also removes
its `rtpmap`, `fmtp` and `rtcp-fb` lines.

### Read

```ts
import {sdpReader, SdpParseError} from '@irbisadm/simple-sdp';

const sdp = sdpReader.parse(pc.localDescription.sdp);

sdp.group;                    // [{semantics: 'BUNDLE', mids: ['0', '1']}]
const [audio] = sdp.media;
audio.mid;                    // '0'
audio.direction;              // 'sendrecv'
audio.codecs?.[0];            // {payloadType: 111, encodingName: 'opus', clockRate: 48000,
                              //  encodingParameters: 2, parameters: {minptime: '10', useinbandfec: '1'},
                              //  rtcpFeedback: ['transport-cc']}
audio.candidates?.[0].type;   // 'host'

try {
  sdpReader.parse('v=0\r\ns=-\r\no=- 1 1 IN IP4 127.0.0.1\r\nt=0 0\r\n');
} catch (e) {
  if (e instanceof SdpParseError) {
    e.lineNumber; // 3
    e.reason;     // 'line is out of order (session order: v o s i u e p c b t r z k a)'
  }
}
```

`sdpReader.isValid(text)` returns `true` if `parse` accepts the text.

## Supported lines and attributes

All line types of RFC 8866 §5 are supported: `v o s i u e p c b t r z k a m`, at session
and media level. `r=`/`z=` time units (`d h m s`) are converted to seconds.

| Attribute | Field | Spec |
|---|---|---|
| `sendrecv` `sendonly` `recvonly` `inactive` | `direction` | RFC 8866 §6.7 |
| `group` | `group[]` | RFC 5888, RFC 9143 |
| `mid` | `mid` | RFC 5888 |
| `rtpmap` `fmtp` `rtcp-fb` | `codecs[]` (per payload type), `rtcpFeedbackWildcard` | RFC 8866, RFC 4585 |
| `extmap` `extmap-allow-mixed` | `extmap[]`, `extmapAllowMixed` | RFC 8285 |
| `ice-ufrag` `ice-pwd` `ice-options` `ice-lite` | `iceUfrag` `icePwd` `iceOptions` `iceLite` | RFC 8839 |
| `candidate` | `candidates[]` | RFC 8839, RFC 6544 (`tcptype`) |
| `end-of-candidates` | `endOfCandidates` | RFC 8840 |
| `fingerprint` | `fingerprints[]` | RFC 8122 |
| `setup` | `setup` | RFC 4145 |
| `msid` | `msid[]` | RFC 8830 |
| `ssrc` `ssrc-group` | `ssrcs[]` `ssrcGroups[]` | RFC 5576 |
| `rid` | `rids[]` | RFC 8851 |
| `simulcast` | `simulcast` | RFC 8853 |
| `rtcp` | `rtcp` | RFC 3605 |
| `rtcp-mux` `rtcp-rsize` | `rtcpMux` `rtcpRsize` | RFC 5761, RFC 5506 |
| `sctp-port` `max-message-size` | `sctpPort` `maxMessageSize` | RFC 8841 |

Other attributes go to `attributes: {name, value?}[]` in their original order.
So do known attributes outside their scope (e.g. `a=mid` at session level) and
`rtpmap`/`fmtp`/`rtcp-fb` for a payload type that is not in the `m=` line.

## Writing

`sdpWriter.write(sdp)` emits lines in RFC 8866 §5 order, each terminated by CRLF.
It throws if `origin` or `timing` is missing, or if a media section has neither `codecs`
nor `formats`.

The output carries the same lines as the input, but the order of attributes inside a
section is normalized. Session level: `group`, `ice-lite`, ICE, DTLS, `extmap`, direction,
`end-of-candidates`, then generic attributes. Media level: `rtcp`, ICE, DTLS, `mid`,
`extmap`, direction, `msid`, `rtcp-mux`, `rtcp-rsize`, per codec `rtpmap` → `rtcp-fb` → `fmtp`,
`sctp-port`, `max-message-size`, `rid`, `simulcast`, `ssrc-group`, `ssrc`, `candidate`,
`end-of-candidates`, then generic attributes in their original order.
Other normalizations:

- `r=`/`z=` times are written in seconds (`7d` → `604800`);
- whitespace around `;` and empty parameters (a trailing `;`) in `a=fmtp` are dropped;
- `a=ssrc` lines are grouped by SSRC; `a=simulcast` lists `send` before `recv`.

The round-trip test checks every fixture: the lines of each section are the same as in
the input, non-attribute lines keep their order, and `parse(write(parse(x)))` deep-equals
`parse(x)`.

## Validation

`sdpValidator.validate(sdp | text, {type?: 'offer' | 'answer', lenient?: boolean})` returns
`SdpIssue[]` (`{severity, code, message, mediaIndex?, lineNumber?}`). Text is parsed first.
A parse failure is reported as one `parse-error` issue, so the RFC 8866 §5 order rules
are covered as well.

| Code | Severity | Rule |
|---|---|---|
| `parse-error` | error | `sdpReader.parse` failed |
| `lenient:<code>` | warning | with `{lenient: true}`: a warning of `sdpReader.parseLenient` (see [Lenient parsing](#lenient-parsing)) |
| `invalid-version`, `missing-origin`, `missing-session-name`, `missing-timing` | error | mandatory `v=`/`o=`/`s=`/`t=` (for hand-built objects) |
| `empty-session-name` | warning | `s=` must not be empty (RFC 8866 §5.3) |
| `missing-connection` | error | `c=` at session level or in every media description (RFC 8866 §5.7) |
| `duplicate-mid`, `group-unknown-mid`, `bundle-missing-mid` | error | unique `mid`s; group members exist; every media has `mid` with BUNDLE (RFC 5888, RFC 9143) |
| `missing-rtpmap` | error | payload types above 34 need `a=rtpmap` (RFC 8866 §6.6, RFC 3551) |
| `unknown-payload-type` | warning | `rtpmap`/`fmtp`/`rtcp-fb` for a payload type not in `m=` |
| `missing-fingerprint`, `missing-setup` | error | DTLS transports (`UDP/TLS/RTP/SAVPF`, `UDP/DTLS/SCTP`, …) (RFC 8842 §5.2, §5.3) |
| `setup-actpass-in-answer` | error | with `type: 'answer'` (RFC 5763 §5) |
| `invalid-fingerprint` | error | colon-separated hex pairs; digest length matches the hash (`sha-256` → 32 bytes, …) (RFC 8122 §5) |
| `fingerprint-not-uppercase` | warning | hex digits must be upper case (RFC 8122 §5) |
| `missing-ice-ufrag`, `missing-ice-pwd` | error | if ICE is used, every active media has credentials (RFC 8839 §5.4) |
| `ice-ufrag-length`, `ice-pwd-length` | error | 4–256 / 22–256 characters (RFC 8839 §5.4) |
| `extmap-invalid-id`, `extmap-duplicate-id` | error | ids 1–14 or 16–255, unique per section (RFC 8285) |
| `simulcast-unknown-rid`, `rid-unknown-payload-type` | error | `a=simulcast` rids exist with the same direction; `pt=` values are in `m=` (RFC 8851, RFC 8853) |
| `ssrc-group-unknown-ssrc` | warning | `a=ssrc-group` members have `a=ssrc` lines (RFC 5576) |

Media sections with port 0 (rejected or bundle-only) are skipped by the ICE and DTLS checks.

## Parsing rules

`sdpReader.parse` throws `SdpParseError` when:

- a line is not `<type>=<value>`, is empty, or has an unknown type;
- lines are out of the RFC 8866 §5 order (session `v o s i u e p c b t r z k a`, media `m i c b k a`)
  or a single-occurrence line repeats;
- `v=`, `o=`, `s=` or `t=` is missing, or `v` is not `0`;
- a typed line or attribute is malformed (e.g. `a=candidate` without `typ`, `a=setup:client`);
- a single-occurrence attribute repeats (`a=mid`, `a=ice-ufrag`, two directions, …).

Accepted deviations: LF-only line endings (RFC 8866 §5 says parsers SHOULD accept them),
a missing final line terminator, RFC 4566-style `z=` after several `t=` lines.

Known limitation: more than one `c=` line in a media description (layered multicast)
is rejected.

An `m=` line with an empty field (a doubled space, as in `m=audio 9  RTP/AVP 0`) is rejected.

## Lenient parsing

`sdpReader.parse` is strict on purpose. For SDP you only need to read, from peers that do
not follow RFC 8866 to the letter (old SIP phones, gateways, SBCs, captures), use
`sdpReader.parseLenient`: it never throws, keeps everything the text allows, and reports
each deviation as a warning.

```ts
import {sdpReader, sdpWriter} from '@irbisadm/simple-sdp';

const {sdp, warnings} = sdpReader.parseLenient(
  'v=0\r\no=- 1 1 IN IP4 192.0.2.1\r\ns=-\r\nt=0 0\r\n' +
  'm=audio 49170 RTP/AVP 0\r\na=sendrecv\r\nc=IN IP4 192.0.2.1\r\na=setup:client\r\n');

sdp.media[0].connectionInformation;  // {netType: 'IN', addrType: 'IP4', connectionAddress: '192.0.2.1'}
sdp.media[0].attributes;             // [{name: 'setup', value: 'client'}]
warnings;
// [{code: 'out-of-order', reason: 'line is out of order (media order: m i c b k a)',
//   lineNumber: 7, line: 'c=IN IP4 192.0.2.1', action: 'kept'},
//  {code: 'malformed-attribute', reason: 'a=setup must be one of active, passive, actpass, holdconn',
//   lineNumber: 8, line: 'a=setup:client', action: 'generic-attribute'}]

if (sdpReader.isComplete(sdp)) {     // narrows SdpLenient to Sdp
  sdpWriter.write(sdp);              // RFC 8866 line order: c= before a=
}
```

The model is `SdpLenient`: the same as `Sdp`, except that `protocolVersion`, `origin`,
`sessionName` and `timing` are undefined when their line is missing or unreadable, and a
media section's `port` and `proto` are undefined when the `m=` line has no readable value
for them. Nothing is invented: a missing `s=` stays undefined, an unreadable port is never
reported as `0` (port 0 means a rejected stream). A description that `parse` accepts gives
`warnings: []` and the same model as `parse`.

Each warning is `{code, reason, lineNumber, line, action}`. `reason` is the text `parse`
throws for the same problem; for a description that `parse` rejects, the first warning has
the same `lineNumber` and `reason` as the `SdpParseError`. `lineNumber` is 0 for a missing
line, and `line` is the offending line as it appears in the input. Warnings are in line
order; those with `lineNumber` 0 come last (`v`, `o`, `s`, `t`). Each line gets at most one
warning.

| Code | What lenient mode does | `action` |
|---|---|---|
| `empty-line`, `malformed-line` | skips the line (a line of only spaces/tabs is empty) | `skipped` |
| `unknown-line-type` | skips an unknown `x=` line | `skipped` |
| `missing-version`, `version-not-first` | the description does not start with `v=` (there is no `v=` before the first `m=` / it comes later); the line is parsed normally | `kept` (`skipped` for an unknown type) |
| `unsupported-version` | `v=1`: `protocolVersion` is `1` | `kept` |
| `wrong-scope` | skips a session-only line inside a media description (e.g. `s=` after `m=`) | `skipped` |
| `out-of-order` | accepts the line into the current scope as if it were in order; `r=`/`z=` attach to the last `t=` | `kept`, `first-kept` for a repeat, `skipped` without any `t=` |
| `duplicate-line` | keeps the first of a repeated single-occurrence line (`o=`, `s=`, `c=` in one media, …) | `first-kept` |
| `malformed-value` | malformed `v=`/`o=`/`c=`/`t=`/`b=`/`k=`/`r=`/`z=`: keeps what can be read (an `o=` with six fields keeps them as text, e.g. a non-numeric `sess-id`), otherwise skips | `kept` / `skipped` |
| `malformed-media` | malformed `m=`: keeps the section so that later lines attach to it; doubled spaces do not shift the fields; an unreadable port is undefined (`m=video 0 RTP/AVP` keeps its port 0, it is a rejected stream); for RTP, unreadable payload types go to `formats` as text (they are not written back) | `kept` |
| `malformed-attribute` | keeps a malformed typed attribute (`a=setup:client`, a broken `a=candidate`, …) as a generic attribute | `generic-attribute` |
| `duplicate-attribute` | keeps the first of a repeated single-occurrence attribute (`a=mid`, two directions, …); the rest become generic attributes | `generic-attribute` |
| `missing-mandatory-line` | `o=`, `s=` or `t=` is missing at the end: the field stays undefined | `skipped` |
| `trailing-whitespace` | removes trailing spaces and tabs (not from the free-text lines `s=`, `i=`, `u=`, `e=`, `p=`, which keep them) | `repaired` |

Lines may also end with a lone CR. A line with trailing whitespace and another problem
reports only the other problem.

`sdpReader.isComplete` is true when the mandatory lines exist and every media section has a
port, a proto and at least one format, so `write` accepts the result.

`sdpWriter.write` accepts the lenient model with the usual rules: it throws without
`origin` or `timing`, and for a media section without `port`, `proto` or formats. Lenient parsing
plus writing repairs structure: if every warning is `empty-line`, `malformed-line`,
`unknown-line-type`, `out-of-order`, `wrong-scope`, `duplicate-line` or
`trailing-whitespace`, and the mandatory lines exist, `parse(write(parseLenient(x).sdp))`
succeeds. Other warnings keep values as they were (`v=1`, a non-numeric `sess-id`,
`a=setup:client` as a generic attribute), so the written text is rejected by `parse` again,
by design.

`sdpValidator.validate(text, {lenient: true})` parses leniently, reports each warning as an
issue with severity `warning` and code `lenient:<code>` (e.g. `lenient:out-of-order`, with
`lineNumber`), then runs the other checks on the model.

## Checked against public SDP sets

The automated tests use the fixtures in this repository. `yarn check:external`
([`scripts/check-external-sdp`](scripts/check-external-sdp/run.mjs)) also runs the library over
public collections and captures. It is **not** part of `yarn test`, CI or the release process.
It downloads the data into `.cache/` at pinned commits; nothing from these sets is in this
repository, as much of it has a license that does not fit here or none at all. Problems found
this way are fixed and pinned with hand-made fixtures. Bodies are read from captures with
`tshark`.

The sets: `.sdp` files of [sdp-transform](https://github.com/clux/sdp-transform),
[libwebrtc's SDP corpus](https://webrtc.googlesource.com/src/+/main/test/fuzzers/corpora/README)
(through the [webrtc-sdk](https://github.com/webrtc-sdk/webrtc) mirror) and
[webrtc-sdp](https://github.com/mozilla/webrtc-sdp); SDP inside the tests of
[pjproject](https://github.com/pjsip/pjproject), [rtpengine](https://github.com/sipwise/rtpengine)
and [semantic-sdp-js](https://github.com/medooze/semantic-sdp-js); captures of
[Wireshark SampleCaptures](https://wiki.wireshark.org/SampleCaptures) (SIP section),
[goffinet/sip_captures](https://github.com/goffinet/sip_captures),
[sngrep](https://github.com/irontec/sngrep/tree/master/tests),
[Wireshark `test/captures`](https://github.com/wireshark/wireshark/tree/master/test/captures) and
`SIP.pcap` of [Malcolm-Test-Artifacts](https://github.com/idaholab/Malcolm-Test-Artifacts).

Run of 2026-11-08 on 1.3.0 plus the fixes below: 1837 unique descriptions (8703 with repeats).
Strict mode accepts 1782 and rejects 55. It checks that lenient parsing does not throw and
agrees with strict mode, that `parse(write(parse(x)))` equals `parse(x)`, that the repair
property holds, and that the TypeScript and wasm builds give the same results: no violations.

| Problem found in 1.3.0 | Seen as |
|---|---|
| Strict mode accepted an empty `<proto>` or non-RTP format in `m=`, and lost the codecs | `m=audio 9  RTP/AVP 0` (constructed from the case below) |
| Lenient mode shifted the fields of `m=` after a doubled space, or kept `''` in `formats` | `m=audio 29156 RTP/AVP 18  0` in a capture |
| `isComplete` was true for a section `write` refuses | `m=video 0 RTP/AVP` in captures |

What the run does not show: the 55 rejections were read by reason and sample rather than one
by one; they break RFC 8866 (line order, missing `t=`, comments in the file, no clock rate in
`a=rtpmap`, …). A pass over the descriptions with `sdp-transform` as an independent parser was
done once outside the script and covers only the main fields. Not checked: 25 files of Wireshark
`test/captures` on which `tshark` did not finish in 60 s (`*_coverage` files of other protocols),
and one broken link of the wiki. Most of the collections are test data, not captures of devices.

`write` changed one kind of line in this run: `a=fmtp`, where spaces around `;` and a trailing
`;` are dropped (`a=fmtp:111 a=1; b=2;` becomes `a=1;b=2`). The parameters stay the same.

## Compatibility

Tested on real session descriptions (see [`test/fixtures`](test/fixtures/README.md)).
Every fixture parses, round-trips through the writer and validates without issues:

| Source | Fixtures |
|---|---|
| Chrome 156 | audio+video, audio-only, datachannel, simulcast (`rid` + `simulcast`): offer and answer |
| Firefox 159 | audio+video, audio-only, datachannel, simulcast: offer and answer |
| Chrome (2023) | audio+video, datachannel, a perfect-negotiation sequence of 7 descriptions |
| SIP, RFC 4566 style, no ICE/DTLS | Polycom SoundPoint IP 330 offer, FreeSWITCH 1.0.4 answer, LG IP phone answer, carrier gateway offer with static payload types and no `rtpmap` |

Safari is not covered by fixtures yet.

## WebAssembly, iOS and Android

[`assembly/`](assembly) is a port of the library to [AssemblyScript](https://www.assemblyscript.org/).
It compiles to a WebAssembly module (≈90 KB, ≈32 KB gzipped) with no imports, so the same
parser, writer and validator run in any wasm runtime: browsers and Node.js, iOS through a
wasm interpreter (no JIT, as the App Store requires), Android and the JVM as bytecode
compiled from the module at build time.

The port behaves exactly like the TypeScript code. `yarn test:wasm` runs the test suites of
this package against the wasm build, plus a differential test that compares both
implementations on all fixtures and on thousands of mutations of them: same model, same
written text, same issues, same error messages.

| Platform | Get it | Runtime |
|---|---|---|
| iOS 18+, macOS 15+ | SwiftPM: `.package(url: "https://github.com/irbisadm/simple-sdp.git", from: "1.3.0")`, product `SimpleSdp` ([`platforms/apple`](platforms/apple)) | [WasmKit](https://github.com/swiftwasm/WasmKit) interpreter |
| Android, JVM 11+ | JitPack: `maven("https://jitpack.io")`, `implementation("com.github.irbisadm:simple-sdp:v1.3.0")` ([`platforms/kotlin`](platforms/kotlin)) | [Chicory](https://chicory.dev), compiled to bytecode at build time |
| Browser, Node.js | npm: `import {sdpReader} from '@irbisadm/simple-sdp/wasm'` — the API of the main entry point | the JS engine |
| Other wasm hosts | `simple-sdp.wasm` from [GitHub Releases](https://github.com/irbisadm/simple-sdp/releases) or `@irbisadm/simple-sdp/wasm/simple-sdp.wasm` | any |

For JavaScript the TypeScript build is the faster choice (see the timings below); the
`/wasm` entry point exists for parity checks and for environments that prefer one shared
implementation. It is an ES module with top-level await that loads `simple-sdp.wasm` through
`new URL("simple-sdp.wasm", import.meta.url)`: Node.js 17+ and Vite handle it as is.

The model crosses the wasm boundary as JSON with the shape of the TypeScript `Sdp` interface.

```swift
let sdp = try SimpleSdp()
let json = try sdp.parseJSON(offer)                  // Data: the model, key order kept
let issues = try sdp.validate(json: json, type: .offer)
let text = try sdp.write(json: json)
let model = try sdp.parse(offer)                     // [String: Any] (does not keep key order)
let (lenient, warnings) = try sdp.parseLenient(capture) // never throws SdpParseError
```

```kotlin
val sdp = SimpleSdp()
val model = sdp.parse(offer)                         // kotlinx.serialization JsonObject
val issues = sdp.validate(model, SdpType.OFFER)
val text = sdp.write(model)
val (lenient, warnings) = sdp.parseLenient(capture)  // never throws SdpParseException
```

### Module interface

The module exports a C-style interface on UTF-8 buffers for hosts without AssemblyScript
bindings:

| Export | |
|---|---|
| `sdp_alloc(len) → ptr` | allocate an input buffer; write the UTF-8 bytes at `ptr` |
| `sdp_parse(ptr, len) → res` | `{"sdp": model}` or `{"error": {message, reason, lineNumber, line}}` |
| `sdp_write(ptr, len) → res` | model JSON in; `{"sdp": "text"}` or `{"error": {message}}` |
| `sdp_validate(ptr, len, type) → res` | SDP text in, `type` 0 = none, 1 = offer, 2 = answer; `{"issues": [...]}` |
| `sdp_validate_model(ptr, len, type) → res` | model JSON in; `{"issues": [...]}` or `{"error": {message}}` |
| `sdp_parse_lenient(ptr, len) → res` | `{"sdp": model, "warnings": [{code, reason, lineNumber, line, action}]}`; never an error |
| `sdp_validate_lenient(ptr, len, type) → res` | like `sdp_validate`, with the text parsed leniently |
| `sdp_version() → res` | version string |
| `sdp_len(res) → len` | byte length of a buffer |
| `sdp_free(ptr)` | release an input buffer or a result |

A module instance is single-threaded; the Swift and Kotlin wrappers serialize calls.
The module uses the minimal AssemblyScript runtime: memory is reclaimed at the end of every
call, so a result stays valid until the next call on the same instance.

Approximate time to parse / write an 18 KB Chrome offer on x86-64, JSON transfer included:
wasm in Node.js 1.3 / 1.2 ms (the TypeScript build: 0.35 / 0.25 ms), JVM with the compiled
module 6 / 9 ms, WasmKit (release build) ≈10 ms each.

The generated ESM bindings (`wasm/build/simple-sdp.js`, published as
`wasm/dist/simple-sdp.mjs`) take strings: `parse(text)`, `parseLenient(text)`, `write(json)`,
`validate(text, type)`, `validateLenient(text, type)`, `validateModel(json, type)`.

Build: `yarn asbuild` compiles the module and copies it into `platforms/` (the copies are
committed so that SwiftPM and Gradle builds do not need Node.js).

## License

MIT

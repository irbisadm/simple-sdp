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
  `write(parse(x))` keeps every line of `x` (see [Writing](#writing)).
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
- whitespace around `;` in `a=fmtp` is dropped;
- `a=ssrc` lines are grouped by SSRC; `a=simulcast` lists `send` before `recv`.

The round-trip test checks every fixture: the lines of each section are the same as in
the input, non-attribute lines keep their order, and `parse(write(parse(x)))` deep-equals
`parse(x)`.

## Validation

`sdpValidator.validate(sdp | text, {type?: 'offer' | 'answer'})` returns
`SdpIssue[]` (`{severity, code, message, mediaIndex?, lineNumber?}`). Text is parsed first.
A parse failure is reported as one `parse-error` issue, so the RFC 8866 §5 order rules
are covered as well.

| Code | Severity | Rule |
|---|---|---|
| `parse-error` | error | `sdpReader.parse` failed |
| `invalid-version`, `missing-origin`, `missing-session-name`, `missing-timing` | error | mandatory `v=`/`o=`/`s=`/`t=` (for hand-built objects) |
| `empty-session-name` | warning | `s=` must not be empty (RFC 8866 §5.3) |
| `missing-connection` | error | `c=` at session level or in every media description (RFC 8866 §5.7) |
| `duplicate-mid`, `group-unknown-mid`, `bundle-missing-mid` | error | unique `mid`s; group members exist; every media has `mid` with BUNDLE (RFC 5888, RFC 9143) |
| `missing-rtpmap` | error | payload types above 34 need `a=rtpmap` (RFC 8866 §6.6, RFC 3551) |
| `unknown-payload-type` | warning | `rtpmap`/`fmtp`/`rtcp-fb` for a payload type not in `m=` |
| `missing-fingerprint`, `missing-setup` | error | DTLS transports (`UDP/TLS/RTP/SAVPF`, `UDP/DTLS/SCTP`, …) (RFC 8842 §5.2, §5.3) |
| `setup-actpass-in-answer` | error | with `type: 'answer'` (RFC 5763 §5) |
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

## License

MIT

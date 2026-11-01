![license MIT](https://badgen.net/npm/license/@irbisadm/simple-sdp)
![npm version](https://badgen.net/npm/v/@irbisadm/simple-sdp)
![npm types](https://badgen.net/npm/types/@irbisadm/simple-sdp)
![bundlephobia min-zip size](https://badgen.net/bundlephobia/minzip/@irbisadm/simple-sdp)
![bundlephobia dependency count](https://badgen.net/bundlephobia/dependency-count/@irbisadm/simple-sdp)
![CI](https://github.com/irbisadm/simple-sdp/actions/workflows/ci.yml/badge.svg)

# simple-sdp

A strict, typed parser for the Session Description Protocol
([RFC 8866](https://www.rfc-editor.org/rfc/rfc8866)), for WebRTC and SIP.
TypeScript, no runtime dependencies, works in Node.js and browsers.

- **Strict**: line order and mandatory lines are checked against RFC 8866 §5. Every
  error is an `SdpParseError` with a line number.
- **Lossless**: each line maps to a typed field or, for attributes the library does not
  interpret, to an ordered `attributes` entry with the exact original value.
- **Typed WebRTC attributes**: ICE, DTLS, BUNDLE, codecs, simulcast, SSRCs (see below).

```sh
npm install @irbisadm/simple-sdp
```

## Usage

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

Tested on real session descriptions (see [`test/fixtures`](test/fixtures/README.md)):

| Source | Fixtures |
|---|---|
| Chrome 156 | audio+video, audio-only, datachannel, simulcast (`rid` + `simulcast`): offer and answer |
| Firefox 159 | audio+video, audio-only, datachannel, simulcast: offer and answer |
| Chrome (2023) | audio+video, datachannel, a perfect-negotiation sequence of 7 descriptions |
| SIP, RFC 4566 style, no ICE/DTLS | Polycom SoundPoint IP 330 offer, FreeSWITCH 1.0.4 answer, LG IP phone answer, carrier gateway offer with static payload types and no `rtpmap` |

Safari is not covered by fixtures yet.

## License

MIT

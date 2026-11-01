# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project
follows [Semantic Versioning](https://semver.org/).

## [0.2.0] — unreleased

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

# SDP fixtures

Every file here is an SDP produced by a real implementation. Nothing is
hand-written or edited. Line endings are kept exactly as the source emitted them (CRLF).

| Files | Source | How it was obtained |
|---|---|---|
| `chrome-{audio-video,audio-only,datachannel,simulcast}-{offer,answer}.sdp` | Chrome 156 (headless, Linux) | `scripts/capture-browser-sdp/capture.mjs chrome …`, 2026-11-01 |
| `firefox-{audio-video,audio-only,datachannel,simulcast}-{offer,answer}.sdp` | Firefox 159 (headless, Linux) | `scripts/capture-browser-sdp/capture.mjs firefox …`, 2026-11-01 |
| `chrome-2023-*.sdp` | Chrome (2023) | Captured by the author in 2023, previously kept in `assets/testSdp.ts` |
| `sip-polycom-soundpoint-offer.sdp` | Polycom SoundPoint IP 330, UA 3.1.2.0392 | INVITE body from the sipXecs regression traces¹ |
| `sip-freeswitch-answer.sdp` | FreeSWITCH-mod_sofia 1.0.4 | 200 OK body from the sipXecs regression traces¹ |
| `sip-lg-ipphone-answer.sdp` | LG-Ericsson IP phone (`o=LGEIPP`) | 200 OK body from the sipXecs regression traces¹ |
| `sip-itsp-gateway-offer.sdp` | Carrier (ITSP) media gateway | INVITE body from the sipXecs regression traces¹ |

¹ [sipXecs](https://github.com/sipXcom/sipxecs), `sipXbridge/regression/*/merged.xml`.
These are SIP traces captured in a test lab in 2010. Each extracted body matches the
`Content-Length` of its SIP message byte for byte.

Notes:

* The browser captures use `RTCPeerConnection` with canvas/WebAudio tracks and no
  STUN/TURN servers. Host candidates are mDNS-obfuscated (`*.local`).
* The `*-simulcast-answer.sdp` files come from a second browser `RTCPeerConnection`.
  Browsers do not accept simulcast as answerers in P2P, so these answers carry no
  `a=simulcast:recv`. SFU-style `recv` simulcast is covered by unit tests built on the
  RFC 8853 examples.
* **Safari is not covered yet.** To add it, run
  `node scripts/capture-browser-sdp/capture.mjs safari --serve` on a Mac and open
  the printed URL in Safari. The capture page writes `safari-*.sdp` here.

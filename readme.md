![license MIT](https://badgen.net/npm/license/@irbisadm/simple-sdp)
![npm version](https://badgen.net/npm/v/@irbisadm/simple-sdp)
![npm types](https://badgen.net/npm/types/@irbisadm/simple-sdp)
![bundlephobia min-zip size](https://badgen.net/bundlephobia/minzip/@irbisadm/simple-sdp)
![bundlephobia dependency count](https://badgen.net/bundlephobia/dependency-count/@irbisadm/simple-sdp)
![bundlephobia tree-shaking](https://badgen.net/bundlephobia/tree-shaking/@irbisadm/simple-sdp)
# Simple SDP tools
This project is a TypeScript library that provides a comprehensive set of tools for working with Session Description Protocol (SDP) messages in WebRTC applications. SDP is a text-based format that describes the multimedia communication sessions between peers. 
With this library, you can:
- Parse and generate SDP messages from and to TypeScript objects
- Manipulate SDP data by adding, removing, or modifying media streams, codecs, candidates, and other attributes
- Validate SDP messages according to the [RFC 8866](https://www.rfc-editor.org/rfc/rfc8866) specification and WebRTC best practices
- Track and verify the SDP history for a single PeerConnection instance

This project aims to help WebRTC beginners learn the SDP format and its components, as well as provide a clear and easy-to-use TypeScript API for advanced users. This project was inspired by the [pjsip](https://github.com/pjsip/pjproject) library written in C++.

You can use the library with Node.js as well in any modern web browser.

## SIP disclaimer
Probably this library can be used for parsing and creating SDP for SIP. 
I can see a theoretical problems here because some SIP devices are complained only with older SDP RFC: [RFC 4566](https://www.rfc-editor.org/rfc/rfc4566.html) or [RFC 2327](https://www.rfc-editor.org/rfc/rfc2327).

I'm not an expert in SIP and have no test environment to check compatibility with that standards. If you can help with tests or expertise with SIP, please send me a message to [i@irbisadm.dev](mailto:i@irbisadm.dev)

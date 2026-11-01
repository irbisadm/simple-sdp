import {sdpWriter} from "./index";
import {sdpReader} from "../sdp-reader";
import {Sdp} from "../../interfaces/Sdp";

const lines = (...l: string[]) => l.join('\r\n') + '\r\n';

describe('sdpWriter', () => {
  test('minimal session', () => {
    const sdp: Sdp = {
      protocolVersion: 0,
      origin: {username: '-', sessId: '1', sessVersion: '1', netType: 'IN', addrType: 'IP4', unicastAddress: '127.0.0.1'},
      sessionName: '-',
      timing: [{startTime: 0, stopTime: 0}],
      media: [],
    };
    expect(sdpWriter.write(sdp)).toBe(lines('v=0', 'o=- 1 1 IN IP4 127.0.0.1', 's=-', 't=0 0'));
  });

  test('typed times are written in seconds (normalization)', () => {
    const input = lines('v=0', 'o=- 1 1 IN IP4 h', 's=-', 't=3724394400 3754123200', 'r=7d 1h 0 25h', 'z=3730928400 -1h 3749680800 0');
    expect(sdpWriter.write(sdpReader.parse(input))).toBe(
      lines('v=0', 'o=- 1 1 IN IP4 h', 's=-', 't=3724394400 3754123200', 'r=604800 3600 0 90000', 'z=3730928400 -3600 3749680800 0'));
  });

  test('every typed field, in RFC 8866 order', () => {
    const input = lines(
      'v=0', 'o=jdoe 3724394400 3724394405 IN IP4 198.51.100.1', 's=Call', 'i=info', 'u=http://example.com',
      'e=a@example.com', 'e=b@example.com', 'p=+1 617 555-6011', 'c=IN IP4 198.51.100.1', 'b=CT:128',
      't=0 0', 'k=prompt',
      'a=group:BUNDLE 0', 'a=ice-lite', 'a=ice-ufrag:u', 'a=ice-pwd:p', 'a=ice-options:trickle ice2',
      'a=fingerprint:sha-256 AA:BB', 'a=fingerprint:sha-1 CC:DD', 'a=setup:passive', 'a=extmap-allow-mixed',
      'a=inactive', 'a=x-session',
      'm=video 49170/2 UDP/TLS/RTP/SAVPF 96 97', 'i=title', 'c=IN IP4 0.0.0.0', 'b=AS:500', 'b=TIAS:500000', 'k=clear:x',
      'a=rtcp:9 IN IP4 0.0.0.0', 'a=mid:0', 'a=extmap:3/sendonly urn:x attr1 attr2', 'a=sendonly', 'a=msid:- t',
      'a=rtcp-mux', 'a=rtcp-rsize',
      'a=rtpmap:96 VP8/90000', 'a=rtcp-fb:96 nack pli', 'a=fmtp:96 max-fs=12288;flag',
      'a=rtpmap:97 rtx/90000', 'a=fmtp:97 apt=96', 'a=rtcp-fb:* ccm fir',
      'a=rid:1 send pt=96;max-width=1280', 'a=rid:2 recv max-fps=30', 'a=simulcast:send 1;~3,4 recv 2',
      'a=ssrc-group:FID 1 2', 'a=ssrc:1 cname:c', 'a=ssrc:1 x-flag', 'a=ssrc:2 cname:c',
      'a=candidate:1 1 UDP 1694498815 192.0.2.3 45664 typ srflx raddr 203.0.113.141 rport 8998 generation 0',
      'a=end-of-candidates', 'a=x-media:1',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'a=mid:1', 'a=sctp-port:5000', 'a=max-message-size:262144',
    );
    expect(sdpWriter.write(sdpReader.parse(input))).toBe(input);
  });

  test('throws without origin or timing', () => {
    expect(() => sdpWriter.write({} as Sdp)).toThrow('origin');
    const noTiming = sdpReader.parse(lines('v=0', 'o=- 1 1 IN IP4 h', 's=-', 't=0 0'));
    noTiming.timing = [];
    expect(() => sdpWriter.write(noTiming)).toThrow('timing');
  });

  test('throws for a media section without formats', () => {
    const sdp = sdpReader.parse(lines('v=0', 'o=- 1 1 IN IP4 h', 's=-', 't=0 0', 'm=audio 9 RTP/AVP 0'));
    sdp.media[0].codecs = [];
    expect(() => sdpWriter.write(sdp)).toThrow('neither codecs nor formats');
  });

  test('readme: keep only opus and bump the session version', () => {
    const offer = lines(
      'v=0', 'o=- 4215775240449105457 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111 9 0', 'c=IN IP4 0.0.0.0', 'a=mid:0',
      'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1', 'a=rtpmap:9 G722/8000', 'a=rtpmap:0 PCMU/8000',
    );
    const sdp = sdpReader.parse(offer);
    for (const m of sdp.media) {
      m.codecs = m.codecs?.filter(c => c.encodingName === 'opus');
      for (const c of m.codecs ?? []) {
        c.parameters = {...c.parameters, stereo: '1'};
      }
    }
    sdp.origin.sessVersion = String(BigInt(sdp.origin.sessVersion) + BigInt(1));
    expect(sdpWriter.write(sdp)).toBe(lines(
      'v=0', 'o=- 4215775240449105457 3 IN IP4 127.0.0.1', 's=-', 't=0 0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'c=IN IP4 0.0.0.0', 'a=mid:0',
      'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1;stereo=1',
    ));
  });
});

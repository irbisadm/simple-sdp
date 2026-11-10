import {sdpReader, sdpResolver} from '../src';

const lines = (...l: string[]) => l.join('\r\n') + '\r\n';
const HEAD = ['v=0', 'o=- 1 1 IN IP4 127.0.0.1', 's=-', 't=0 0'];
const resolve = (text: string) => sdpResolver.resolve(sdpReader.parseLenient(text).sdp);

const WEBRTC_OFFER = lines(
  ...HEAD, 'a=group:BUNDLE 0 1',
  'm=audio 49170 UDP/TLS/RTP/SAVPF 111 0', 'c=IN IP4 0.0.0.0', 'a=mid:0', 'a=sendrecv',
  'a=ice-ufrag:aaaa', 'a=ice-pwd:bbbbbbbbbbbbbbbbbbbbbb', 'a=fingerprint:sha-256 AA:BB', 'a=setup:actpass',
  'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level',
  'm=video 49172 UDP/TLS/RTP/SAVPF 96', 'a=mid:1', 'a=sendrecv', 'a=rtpmap:96 VP8/90000',
);

const SIP_AUDIO = lines(
  'v=0', 'o=alice 2890844526 2890844526 IN IP4 192.0.2.10', 's=-', 'c=IN IP4 192.0.2.10', 't=0 0',
  'm=audio 49170 RTP/AVP 0 8 18 101', 'a=rtpmap:101 telephone-event/8000', 'a=fmtp:101 0-16', 'a=fmtp:18 annexb=no',
);

describe('sdpResolver.resolve', () => {
  test('WebRTC offer', () => {
    expect(resolve(WEBRTC_OFFER)).toEqual({
      bundle: ['0', '1'],
      hold: false,
      media: [{
        index: 0, mid: '0', type: 'audio', port: 49170, rejected: false, proto: 'UDP/TLS/RTP/SAVPF',
        direction: 'sendrecv',
        codecs: [
          {payloadType: 111, encodingName: 'opus', clockRate: 48000, encodingParameters: 2, parameters: {minptime: '10', useinbandfec: '1'}},
          {payloadType: 0, encodingName: 'PCMU', clockRate: 8000, static: true},
        ],
        extmap: [{id: 1, uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level'}],
        iceUfrag: 'aaaa', icePwd: 'bbbbbbbbbbbbbbbbbbbbbb', setup: 'actpass',
        fingerprints: [{hashFunction: 'sha-256', fingerprint: 'AA:BB'}],
      }, {
        index: 1, mid: '1', type: 'video', port: 49172, rejected: false, proto: 'UDP/TLS/RTP/SAVPF',
        direction: 'sendrecv',
        codecs: [{payloadType: 96, encodingName: 'VP8', clockRate: 90000}],
        extmap: [], fingerprints: [],
      }],
    });
  });

  test('SIP audio: static payload types in m= order, no mid', () => {
    const [m] = resolve(SIP_AUDIO).media;
    expect(m.mid).toBeUndefined();
    expect(m.codecs).toEqual([
      {payloadType: 0, encodingName: 'PCMU', clockRate: 8000, static: true},
      {payloadType: 8, encodingName: 'PCMA', clockRate: 8000, static: true},
      {payloadType: 18, encodingName: 'G729', clockRate: 8000, parameters: {annexb: 'no'}, static: true},
      {payloadType: 101, encodingName: 'telephone-event', clockRate: 8000, parameters: {'0-16': null}},
    ]);
  });

  test('static payload type with a=rtpmap is not marked static', () => {
    const [m] = resolve(lines(...HEAD, 'm=audio 4000 RTP/AVP 0', 'a=rtpmap:0 PCMU/8000')).media;
    expect(m.codecs).toEqual([{payloadType: 0, encodingName: 'PCMU', clockRate: 8000}]);
  });

  test('static payload type with channels; unassigned payload type stays unnamed', () => {
    const [m] = resolve(lines(...HEAD, 'm=audio 4000 RTP/AVP 10 20 96')).media;
    expect(m.codecs).toEqual([
      {payloadType: 10, encodingName: 'L16', clockRate: 44100, encodingParameters: 2, static: true},
      {payloadType: 20},
      {payloadType: 96},
    ]);
  });

  test('session-level values apply to media sections without their own', () => {
    const r = resolve(lines(
      ...HEAD, 'a=ice-ufrag:sess', 'a=ice-pwd:sesspwdsesspwdsesspwd00', 'a=fingerprint:sha-256 AA:BB', 'a=setup:actpass',
      'a=sendonly', 'a=extmap:1 urn:a', 'a=extmap:2 urn:b',
      'm=audio 4000 RTP/AVP 0',
      'm=audio 4002 RTP/AVP 0', 'a=ice-ufrag:own', 'a=setup:passive', 'a=recvonly', 'a=fingerprint:sha-1 CC:DD',
      'a=extmap:2 urn:c',
    ));
    const [inherit, own] = r.media;
    expect(inherit).toMatchObject({
      iceUfrag: 'sess', icePwd: 'sesspwdsesspwdsesspwd00', setup: 'actpass', direction: 'sendonly',
      fingerprints: [{hashFunction: 'sha-256', fingerprint: 'AA:BB'}],
      extmap: [{id: 1, uri: 'urn:a'}, {id: 2, uri: 'urn:b'}],
    });
    expect(own).toMatchObject({
      iceUfrag: 'own', icePwd: 'sesspwdsesspwdsesspwd00', setup: 'passive', direction: 'recvonly',
      fingerprints: [{hashFunction: 'sha-1', fingerprint: 'CC:DD'}],
      extmap: [{id: 2, uri: 'urn:c'}, {id: 1, uri: 'urn:a'}],
    });
  });

  test('a=rtcp-fb:* is added to every codec', () => {
    const [m] = resolve(lines(
      ...HEAD, 'm=video 4000 RTP/AVPF 96 97', 'a=rtpmap:96 VP8/90000', 'a=rtpmap:97 VP9/90000',
      'a=rtcp-fb:96 nack', 'a=rtcp-fb:96 ccm fir', 'a=rtcp-fb:* nack', 'a=rtcp-fb:* transport-cc',
    )).media;
    expect(m.codecs.map(c => c.rtcpFeedback)).toEqual([
      ['nack', 'ccm fir', 'transport-cc'],
      ['nack', 'transport-cc'],
    ]);
  });

  test('RFC 6904 encrypted header extension', () => {
    const [m] = resolve(lines(
      ...HEAD, 'm=audio 4000 RTP/SAVP 0',
      'a=extmap:1/sendonly urn:ietf:params:rtp-hdrext:encrypt urn:ietf:params:rtp-hdrext:ssrc-audio-level vad=on',
      'a=extmap:2 urn:ietf:params:rtp-hdrext:encrypt urn:ietf:params:rtp-hdrext:toffset',
    )).media;
    expect(m.extmap).toEqual([
      {id: 1, direction: 'sendonly', uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level', attributes: 'vad=on', encrypted: true},
      {id: 2, uri: 'urn:ietf:params:rtp-hdrext:toffset', encrypted: true},
    ]);
  });

  test('bundle: the first BUNDLE group', () => {
    const r = resolve(lines(...HEAD, 'a=group:LS 0 1', 'a=group:BUNDLE 1', 'a=group:BUNDLE 0'));
    expect(r.bundle).toEqual(['1']);
    expect(resolve(lines(...HEAD)).bundle).toEqual([]);
  });

  test('rejected section and hold', () => {
    const r = resolve(lines(...HEAD, 'm=audio 4000 RTP/AVP 0', 'm=video 0 RTP/AVP 96', 'a=inactive'));
    expect(r.media.map(m => [m.rejected, m.direction])).toEqual([[false, 'sendrecv'], [true, 'inactive']]);
    expect(r.hold).toBe(false);
    expect(resolve(SIP_AUDIO.replace('a=rtpmap', 'a=sendonly\r\na=rtpmap')).hold).toBe(true);
  });

  test('accepts the strict model and does not modify it', () => {
    const sdp = sdpReader.parse(WEBRTC_OFFER);
    const before = JSON.stringify(sdp);
    expect(sdpResolver.resolve(sdp)).toEqual(resolve(WEBRTC_OFFER));
    expect(JSON.stringify(sdp)).toEqual(before);
  });

  test('non-RTP media section has no codecs', () => {
    const [m] = resolve(lines(...HEAD, 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'a=sctp-port:5000')).media;
    expect(m.codecs).toEqual([]);
  });

  describe('lenient model', () => {
    const BASE = lines(...HEAD, 'm=audio 4000 RTP/AVP 0 96', 'a=rtpmap:96 telephone-event/8000');

    test('a=rtpmap without a clock rate still names the codec', () => {
      const [m] = resolve(BASE.replace('telephone-event/8000', 'telephone-event')).media;
      expect(m.codecs[1]).toEqual({payloadType: 96, encodingName: 'telephone-event'});
    });

    test('a=setup with a value outside RFC 4145 is reported as written', () => {
      const [m] = resolve(BASE + lines('a=setup:client')).media;
      expect(m.setup).toBe('client');
    });

    test('m= with an unreadable port: no port, not rejected', () => {
      const [m] = resolve(BASE.replace('m=audio 4000', 'm=audio abc') + lines('a=sendonly')).media;
      expect(m).toMatchObject({rejected: false, direction: 'sendonly'});
      expect(m.port).toBeUndefined();
    });

    test('text that is not SDP', () => {
      expect(resolve('hello world\nthis is not sdp')).toEqual({bundle: [], hold: false, media: []});
    });
  });
});

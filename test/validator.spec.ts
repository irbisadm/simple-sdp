import {sdpReader, sdpValidator, Sdp} from '../src';
import {fixtureNames, loadFixture} from './fixtures';

const lines = (...l: string[]) => l.join('\r\n') + '\r\n';
const codes = (input: Sdp | string, type?: 'offer' | 'answer') => sdpValidator.validate(input, {type}).map(i => i.code);

// A real-length sha-256 fingerprint (32 bytes)
const FP = '15:A8:92:10:AA:AB:95:C0:EB:A0:19:3F:D0:6F:CE:23:A3:49:D2:1E:89:CF:8A:09:2A:70:77:2F:AA:D8:55:AC';

const HEAD = ['v=0', 'o=- 1 1 IN IP4 127.0.0.1', 's=-', 't=0 0'];
const WEBRTC_AUDIO = [
  'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:abcd', 'a=ice-pwd:0123456789012345678901', `a=fingerprint:sha-256 ${FP}`, 'a=setup:actpass',
  'a=mid:0', 'a=rtpmap:111 opus/48000/2',
];

describe('real fixtures have no issues', () => {
  test.each(fixtureNames())('%s', (name) => {
    const type = name.includes('answer') ? 'answer' : 'offer';
    expect(sdpValidator.validate(loadFixture(name), {type})).toEqual([]);
  });
});

describe('sdpValidator.validate', () => {
  test('valid minimal WebRTC offer', () => {
    expect(codes(lines(...HEAD, 'a=group:BUNDLE 0', ...WEBRTC_AUDIO))).toEqual([]);
  });

  test('parse errors are reported as a single issue', () => {
    expect(sdpValidator.validate(lines('v=0', 's=-', 'o=- 1 1 IN IP4 h', 't=0 0'))).toEqual([{
      severity: 'error', code: 'parse-error', lineNumber: 3,
      message: 'SDP line 3 "o=- 1 1 IN IP4 h": line is out of order (session order: v o s i u e p c b t r z k a)',
    }]);
  });

  test('mandatory fields of a hand-built object', () => {
    expect(codes({media: []} as unknown as Sdp)).toEqual(['invalid-version', 'missing-origin', 'missing-session-name', 'missing-timing']);
  });

  test('empty s=', () => {
    expect(sdpValidator.validate(lines('v=0', 'o=- 1 1 IN IP4 h', 's=', 't=0 0'))).toEqual([
      expect.objectContaining({severity: 'warning', code: 'empty-session-name'}),
    ]);
  });

  test('c= missing at session and media level', () => {
    expect(sdpValidator.validate(lines(...HEAD, 'm=audio 9 RTP/AVP 0'))).toEqual([
      expect.objectContaining({code: 'missing-connection', mediaIndex: 0}),
    ]);
    expect(codes(lines('v=0', 'o=- 1 1 IN IP4 h', 's=-', 'c=IN IP4 192.0.2.1', 't=0 0', 'm=audio 9 RTP/AVP 0'))).toEqual([]);
  });

  test('BUNDLE: missing mid, unknown mid, duplicate mid', () => {
    const noMid = WEBRTC_AUDIO.filter(l => !l.startsWith('a=mid'));
    expect(codes(lines(...HEAD, 'a=group:BUNDLE 0', ...noMid))).toEqual(['group-unknown-mid', 'bundle-missing-mid']);
    expect(codes(lines(...HEAD, ...WEBRTC_AUDIO, ...WEBRTC_AUDIO))).toEqual(['duplicate-mid']);
  });

  test('dynamic payload type without rtpmap; static ones are fine', () => {
    expect(codes(lines(...HEAD, 'm=audio 9 RTP/AVP 0 18 96', 'c=IN IP4 0.0.0.0'))).toEqual(['missing-rtpmap']);
  });

  test('rtpmap for a payload type that is not in m=', () => {
    expect(sdpValidator.validate(lines(...HEAD, 'm=audio 9 RTP/AVP 0', 'c=IN IP4 0.0.0.0', 'a=rtpmap:96 opus/48000/2'))).toEqual([
      expect.objectContaining({severity: 'warning', code: 'unknown-payload-type'}),
    ]);
  });

  test('DTLS: fingerprint and setup', () => {
    const without = (prefix: string) => WEBRTC_AUDIO.filter(l => !l.startsWith(prefix));
    expect(codes(lines(...HEAD, ...without('a=fingerprint')))).toEqual(['missing-fingerprint']);
    expect(codes(lines(...HEAD, ...without('a=setup')))).toEqual(['missing-setup']);
    expect(codes(lines(...HEAD, ...WEBRTC_AUDIO), 'answer')).toEqual(['setup-actpass-in-answer']);
    expect(codes(lines(...HEAD, ...WEBRTC_AUDIO), 'offer')).toEqual([]);
  });

  test('DTLS: session-level fingerprint/setup count (Firefox style)', () => {
    const media = WEBRTC_AUDIO.filter(l => !l.startsWith('a=fingerprint') && !l.startsWith('a=setup'));
    expect(codes(lines(...HEAD, `a=fingerprint:sha-256 ${FP}`, 'a=setup:actpass', ...media))).toEqual([]);
  });

  test('fingerprint format and digest length', () => {
    const withFp = (value: string) => lines(...HEAD, ...WEBRTC_AUDIO.map(l => l.startsWith('a=fingerprint') ? `a=fingerprint:${value}` : l));
    expect(codes(withFp('sha-256 AA:BB'))).toEqual(['invalid-fingerprint']);
    expect(sdpValidator.validate(withFp('sha-256 AA:BB'))[0].message).toBe('a=fingerprint:sha-256 has 2 bytes, expected 32 (RFC 8122 §5)');
    expect(codes(withFp('sha-256 ' + FP.slice(0, -1) + 'Z'))).toEqual(['invalid-fingerprint']);
    expect(codes(withFp('sha-256 ' + FP.replace(/:/g, '')))).toEqual(['invalid-fingerprint']);
    expect(codes(withFp('sha-256 ' + FP.toLowerCase()))).toEqual(['fingerprint-not-uppercase']);
    expect(codes(withFp('SHA-256 ' + FP))).toEqual([]);
    expect(codes(withFp('sha-1 ' + FP.split(':').slice(0, 20).join(':')))).toEqual([]);
    expect(codes(withFp('x-custom AA:BB'))).toEqual([]); // unknown hash: format only
  });

  test('session-level fingerprint is checked too', () => {
    const media = WEBRTC_AUDIO.filter(l => !l.startsWith('a=fingerprint'));
    expect(sdpValidator.validate(lines(...HEAD, 'a=fingerprint:sha-256 AA:BB', ...media))).toEqual([
      {severity: 'error', code: 'invalid-fingerprint', message: 'a=fingerprint:sha-256 has 2 bytes, expected 32 (RFC 8122 §5)'},
    ]);
  });

  test('ICE: missing and malformed credentials', () => {
    expect(codes(lines(...HEAD, ...WEBRTC_AUDIO.filter(l => !l.startsWith('a=ice-pwd'))))).toEqual(['missing-ice-pwd']);
    expect(codes(lines(...HEAD, ...WEBRTC_AUDIO.filter(l => !l.startsWith('a=ice-ufrag'))))).toEqual(['missing-ice-ufrag']);
    const shortCreds = WEBRTC_AUDIO.map(l => l.startsWith('a=ice-ufrag') ? 'a=ice-ufrag:abc' : l.startsWith('a=ice-pwd') ? 'a=ice-pwd:short' : l);
    expect(codes(lines(...HEAD, ...shortCreds))).toEqual(['ice-ufrag-length', 'ice-pwd-length']);
  });

  test('rejected media (port 0) skip ICE/DTLS checks', () => {
    expect(codes(lines(...HEAD, ...WEBRTC_AUDIO, 'm=video 0 UDP/TLS/RTP/SAVPF 96', 'c=IN IP4 0.0.0.0', 'a=mid:1', 'a=rtpmap:96 VP8/90000'))).toEqual([]);
  });

  test('extmap ids', () => {
    expect(codes(lines(...HEAD, ...WEBRTC_AUDIO, 'a=extmap:15 urn:a', 'a=extmap:3 urn:b', 'a=extmap:3 urn:c'))).toEqual(['extmap-invalid-id', 'extmap-duplicate-id']);
  });

  test('simulcast and rid consistency', () => {
    const video = ['m=video 9 UDP/TLS/RTP/SAVPF 96', 'c=IN IP4 0.0.0.0', 'a=ice-ufrag:abcd', 'a=ice-pwd:0123456789012345678901',
      `a=fingerprint:sha-256 ${FP}`, 'a=setup:actpass', 'a=mid:0', 'a=rtpmap:96 VP8/90000'];
    expect(codes(lines(...HEAD, ...video, 'a=rid:q send', 'a=rid:h send pt=97', 'a=simulcast:send q;h;f'))).toEqual(['simulcast-unknown-rid', 'rid-unknown-payload-type']);
    expect(codes(lines(...HEAD, ...video, 'a=rid:q recv', 'a=simulcast:send q'))).toEqual(['simulcast-unknown-rid']);
  });

  test('ssrc-group referencing an unknown ssrc', () => {
    expect(codes(lines(...HEAD, ...WEBRTC_AUDIO, 'a=ssrc-group:FID 1 2', 'a=ssrc:1 cname:x'))).toEqual(['ssrc-group-unknown-ssrc']);
  });

  test('accepts a parsed object', () => {
    const sdp = sdpReader.parse(loadFixture('chrome-audio-video-offer'));
    sdp.media[1].mid = undefined;
    expect(codes(sdp)).toEqual(['group-unknown-mid', 'bundle-missing-mid']);
  });
});

test('fingerprint with a hash name of an Object.prototype member is an unknown hash', () => {
  const media = WEBRTC_AUDIO.map(l => l.startsWith('a=fingerprint') ? 'a=fingerprint:constructor AA:BB' : l);
  expect(codes(lines(...HEAD, ...media))).toEqual([]);
});

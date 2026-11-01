import {sdpReader, Sdp, SdpMediaSection} from '../src';
import {fixtureNames, loadFixture} from './fixtures';

const parseFixture = (name: string): Sdp => sdpReader.parse(loadFixture(name));
const codec = (m: SdpMediaSection, pt: number) => m.codecs?.find(c => c.payloadType === pt);
const attr = (m: { attributes?: { name: string, value?: string }[] }, name: string) =>
  m.attributes?.filter(a => a.name === name).map(a => a.value);

describe('all fixtures', () => {
  test('fixture files use CRLF line endings', () => {
    for (const name of fixtureNames()) {
      expect(loadFixture(name).split('\n').every(l => l === '' || l.endsWith('\r'))).toBe(true);
    }
  });
  test.each(fixtureNames())('%s parses', (name) => {
    const sdp = parseFixture(name);
    expect(sdp.protocolVersion).toBe(0);
    expect(sdp.timing.length).toBeGreaterThan(0);
    expect(sdp.media.length).toBeGreaterThan(0);
  });
});

describe('Chrome 156 audio+video offer', () => {
  const sdp = parseFixture('chrome-audio-video-offer');
  const [audio, video] = sdp.media;

  test('session level', () => {
    expect(sdp.origin).toEqual({
      username: '-', sessId: '2195665150871314175', sessVersion: '2',
      netType: 'IN', addrType: 'IP4', unicastAddress: '127.0.0.1',
    });
    expect(sdp.sessionName).toBe('-');
    expect(sdp.timing).toEqual([{startTime: 0, stopTime: 0}]);
    expect(sdp.group).toEqual([{semantics: 'BUNDLE', mids: ['0', '1']}]);
    expect(attr(sdp, 'msid-semantic')).toEqual([' WMS 0837a242-61de-426f-8765-e2e827180900']);
  });
  test('media sections', () => {
    expect(sdp.media.map(m => [m.type, m.port, m.proto, m.mid, m.direction])).toEqual([
      ['audio', 9, 'UDP/TLS/RTP/SAVPF', '0', 'sendrecv'],
      ['video', 9, 'UDP/TLS/RTP/SAVPF', '1', 'sendrecv'],
    ]);
    expect(audio.connectionInformation).toEqual({netType: 'IN', addrType: 'IP4', connectionAddress: '0.0.0.0'});
    expect(audio.codecs?.map(c => c.payloadType)).toEqual([111, 63, 9, 0, 8, 13, 110, 126]);
  });
  test('codecs: rtpmap, fmtp, rtcp-fb', () => {
    expect(codec(audio, 111)).toEqual({
      payloadType: 111, encodingName: 'opus', clockRate: 48000, encodingParameters: 2,
      parameters: {minptime: '10', useinbandfec: '1'},
      rtcpFeedback: ['transport-cc'],
    });
    expect(codec(audio, 63)?.parameters).toEqual({'111/111': null});
    expect(codec(video, 96)).toEqual({
      payloadType: 96, encodingName: 'VP8', clockRate: 90000,
      rtcpFeedback: ['goog-remb', 'transport-cc', 'ccm fir', 'nack', 'nack pli'],
    });
    expect(codec(video, 97)).toMatchObject({encodingName: 'rtx', parameters: {apt: '96'}});
  });
  test('extmap', () => {
    expect(audio.extmap?.[3]).toEqual({id: 4, uri: 'urn:ietf:params:rtp-hdrext:sdes:mid'});
    expect(video.extmap?.map(e => e.id)).toEqual([14, 2, 13, 3, 5, 6, 7, 8, 4, 10, 11]);
  });
  test('ICE / DTLS', () => {
    for (const m of sdp.media) {
      expect(m.iceUfrag).toBe('PF3x');
      expect(m.icePwd).toBe('tr1PeKMqXzRm+7ZpGO3uPAwJ');
      expect(m.iceOptions).toEqual(['trickle']);
      expect(m.setup).toBe('actpass');
      expect(m.fingerprints).toEqual([{
        hashFunction: 'sha-256',
        fingerprint: '15:A8:92:10:AA:AB:95:C0:EB:A0:19:3F:D0:6F:CE:23:A3:49:D2:1E:89:CF:8A:09:2A:70:77:2F:AA:D8:55:AC',
      }]);
    }
  });
});

describe('Firefox 159 audio+video offer', () => {
  const sdp = parseFixture('firefox-audio-video-offer');
  const [audio, video] = sdp.media;

  test('session-level attributes', () => {
    expect(sdp.origin.username).toBe('mozilla...THIS_IS_SDPARTA-99.0');
    expect(sdp.origin.sessVersion).toBe('0');
    expect(sdp.direction).toBe('sendrecv');
    expect(sdp.fingerprints?.[0].hashFunction).toBe('sha-256');
    expect(sdp.iceOptions).toEqual(['trickle']);
    expect(sdp.group).toEqual([{semantics: 'BUNDLE', mids: ['0', '1']}]);
  });
  test('extmap with direction', () => {
    expect(audio.extmap?.[1]).toEqual({id: 2, direction: 'recvonly', uri: 'urn:ietf:params:rtp-hdrext:csrc-audio-level'});
  });
  test('codecs declared before their rtpmap', () => {
    expect(codec(audio, 109)).toEqual({
      payloadType: 109, encodingName: 'opus', clockRate: 48000, encodingParameters: 2,
      parameters: {maxplaybackrate: '48000', stereo: '1', useinbandfec: '1'},
      rtcpFeedback: ['transport-cc'],
    });
    expect(codec(audio, 9)).toMatchObject({encodingName: 'G722', clockRate: 8000, encodingParameters: 1});
    expect(codec(audio, 101)?.parameters).toEqual({'0-15': null});
    expect(codec(video, 120)?.rtcpFeedback).toEqual(['nack', 'nack pli', 'ccm fir', 'goog-remb', 'transport-cc']);
  });
  test('ICE / DTLS per media', () => {
    expect(audio).toMatchObject({iceUfrag: '3dfbeaa4', icePwd: 'e29d8e1cc0b16ab8e7ddba91afb7c8e3', setup: 'actpass'});
  });
});

describe('datachannel', () => {
  test.each(['chrome-datachannel-offer', 'firefox-datachannel-answer'])('%s', (name) => {
    const [m] = parseFixture(name).media;
    expect(m.type).toBe('application');
    expect(m.proto).toBe('UDP/DTLS/SCTP');
    expect(m.formats).toEqual(['webrtc-datachannel']);
    expect(m.codecs).toBeUndefined();
  });
});

describe('SIP devices (RFC 4566 style, no ICE/DTLS)', () => {
  test('Polycom SoundPoint offer', () => {
    const sdp = parseFixture('sip-polycom-soundpoint-offer');
    expect(sdp.sessionName).toBe('Polycom IP Phone');
    expect(sdp.connectionInformation).toEqual({netType: 'IN', addrType: 'IP4', connectionAddress: '192.168.5.243'});
    expect(sdp.direction).toBe('sendrecv');
    const [m] = sdp.media;
    expect(m).toMatchObject({type: 'audio', port: 2222, proto: 'RTP/AVP'});
    expect(m.codecs).toEqual([
      {payloadType: 0, encodingName: 'PCMU', clockRate: 8000},
      {payloadType: 8, encodingName: 'PCMA', clockRate: 8000},
      {payloadType: 18, encodingName: 'G729', clockRate: 8000, parameters: {annexb: 'no'}},
      {payloadType: 127, encodingName: 'telephone-event', clockRate: 8000},
    ]);
    expect(m.iceUfrag).toBeUndefined();
    expect(m.fingerprints).toBeUndefined();
  });
  test('FreeSWITCH answer keeps unknown attributes', () => {
    const [m] = parseFixture('sip-freeswitch-answer').media;
    expect(m.attributes).toEqual([
      {name: 'silenceSupp', value: 'off - - - -'},
      {name: 'ptime', value: '20'},
    ]);
    expect(m.codecs?.[1]).toEqual({payloadType: 101, encodingName: 'telephone-event', clockRate: 8000, parameters: {'0-16': null}});
  });
  test('static payload types without rtpmap', () => {
    const [m] = parseFixture('sip-itsp-gateway-offer').media;
    expect(m.codecs?.map(c => [c.payloadType, c.encodingName])).toEqual([[0, undefined], [18, undefined], [101, 'telephone-event']]);
  });
});

describe('optional session fields', () => {
  test('i= u= e= p= b= k=, media-level i= b= k=', () => {
    const sdp = sdpReader.parse([
      'v=0', 'o=jdoe 3724394400 3724394405 IN IP4 198.51.100.1', 's=Call to John Smith',
      'i=SDP Offer #1', 'u=http://www.jdoe.example.com/home.html',
      'e=Jane Doe <jane@jdoe.example.com>', 'e=jdoe@example.com', 'p=+1 617 555-6011',
      'c=IN IP4 198.51.100.1', 'b=CT:128', 't=0 0', 'k=prompt',
      'm=audio 49170 RTP/AVP 0', 'i=voice', 'b=AS:64', 'b=TIAS:64000', 'k=clear:secret', '',
    ].join('\r\n'));
    expect(sdp).toMatchObject({
      sessionInformation: 'SDP Offer #1',
      uri: 'http://www.jdoe.example.com/home.html',
      emailAddresses: ['Jane Doe <jane@jdoe.example.com>', 'jdoe@example.com'],
      phoneNumbers: ['+1 617 555-6011'],
      bandwidths: [{bwtype: 'CT', bandwidth: 128}],
      encryptionKey: {method: 'prompt'},
    });
    expect(sdp.media[0]).toMatchObject({
      information: 'voice',
      bandwidths: [{bwtype: 'AS', bandwidth: 64}, {bwtype: 'TIAS', bandwidth: 64000}],
      encryptionKey: {method: 'clear', encryptionKey: 'secret'},
    });
  });
  test('RFC 8866 §5.10/5.11 time description', () => {
    const sdp = sdpReader.parse([
      'v=0', 'o=- 1 1 IN IP4 h', 's=-', 't=3724394400 3754123200', 'r=7d 1h 0 25h', 'z=3730928400 -1h 3749680800 0', '',
    ].join('\r\n'));
    expect(sdp.timing).toEqual([{
      startTime: 3724394400, stopTime: 3754123200,
      repeat: [{repeatInterval: 604800, activeDuration: 3600, offsets: [0, 90000]}],
      zoneAdjustments: [{adjustmentTime: 3730928400, offset: -3600}, {adjustmentTime: 3749680800, offset: 0}],
    }]);
  });
});

describe('ICE candidates in fixtures', () => {
  test('Firefox: candidates and end-of-candidates', () => {
    const [audio] = parseFixture('firefox-audio-video-offer').media;
    expect(audio.endOfCandidates).toBe(true);
    expect(audio.candidates?.length).toBeGreaterThan(0);
    for (const c of audio.candidates!) {
      expect(c.address).toMatch(/\.local$/);
      expect(['UDP', 'TCP']).toContain(c.transport);
    }
    expect(audio.attributes?.some(a => a.name === 'candidate')).toBeFalsy();
  });
  test('Chrome 2023: candidates with extensions', () => {
    const sdp = parseFixture('chrome-2023-renegotiation-2-offer');
    const candidates = sdp.media.flatMap(m => m.candidates ?? []);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].extensions).toMatchObject({generation: '0'});
  });
});

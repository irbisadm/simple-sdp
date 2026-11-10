import {sdpReader, sdpWriter, sdpValidator, sdpResolver, sdpNegotiator, SdpParseError} from '../src';
import {loadFixture} from './fixtures';

// Keeps the examples in readme.md honest.
describe('readme examples', () => {
  test('parse', () => {
    const sdp = sdpReader.parse(loadFixture('chrome-audio-video-offer'));
    expect(sdp.group).toEqual([{semantics: 'BUNDLE', mids: ['0', '1']}]);
    const [audio] = sdp.media;
    expect(audio.mid).toBe('0');
    expect(audio.direction).toBe('sendrecv');
    expect(audio.codecs?.[0]).toEqual({
      payloadType: 111, encodingName: 'opus', clockRate: 48000, encodingParameters: 2,
      parameters: {minptime: '10', useinbandfec: '1'}, rtcpFeedback: ['transport-cc'],
    });
    expect(audio.candidates?.[0].type).toBe('host');
  });
  test('SdpParseError', () => {
    expect.assertions(3);
    try {
      sdpReader.parse('v=0\r\ns=-\r\no=- 1 1 IN IP4 127.0.0.1\r\nt=0 0\r\n');
    } catch (e) {
      expect(e).toBeInstanceOf(SdpParseError);
      expect((e as SdpParseError).lineNumber).toBe(3);
      expect((e as SdpParseError).reason).toBe('line is out of order (session order: v o s i u e p c b t r z k a)');
    }
  });
});

describe('readme: parse → modify → write', () => {
  test('keep only Opus, add stereo, bump version', () => {
    const sdp = sdpReader.parse(loadFixture('chrome-audio-video-offer'));

    for (const m of sdp.media.filter(m => m.type === 'audio')) {
      m.codecs = m.codecs?.filter(c => c.encodingName === 'opus');
      m.codecs?.forEach(c => c.parameters = {...c.parameters, stereo: '1'});
    }
    sdp.origin.sessVersion = String(BigInt(sdp.origin.sessVersion) + BigInt(1));

    expect(sdpValidator.validate(sdp, {type: 'offer'})).toEqual([]);
    const text: string = sdpWriter.write(sdp);
    expect(text).toContain('\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n');
    expect(text).toContain('\r\na=fmtp:111 minptime=10;useinbandfec=1;stereo=1\r\n');
    expect(text).not.toContain('a=rtpmap:0 PCMU/8000');
    expect(text).toContain('o=- 2195665150871314175 3 IN IP4 127.0.0.1');
  });
});

describe('readme: lenient parsing', () => {
  test('example', () => {
    const {sdp, warnings} = sdpReader.parseLenient(
      'v=0\r\no=- 1 1 IN IP4 192.0.2.1\r\ns=-\r\nt=0 0\r\n' +
      'm=audio 49170 RTP/AVP 0\r\na=sendrecv\r\nc=IN IP4 192.0.2.1\r\na=setup:client\r\n');
    expect(sdp.media[0].connectionInformation).toEqual({netType: 'IN', addrType: 'IP4', connectionAddress: '192.0.2.1'});
    expect(sdp.media[0].attributes).toEqual([{name: 'setup', value: 'client'}]);
    expect(warnings).toEqual([
      {code: 'out-of-order', reason: 'line is out of order (media order: m i c b k a)', lineNumber: 7, line: 'c=IN IP4 192.0.2.1', action: 'kept'},
      {code: 'malformed-attribute', reason: 'a=setup must be one of active, passive, actpass, holdconn', lineNumber: 8, line: 'a=setup:client', action: 'generic-attribute'},
    ]);
    expect(sdpReader.isComplete(sdp)).toBe(true);
    if (sdpReader.isComplete(sdp)) {
      const text = sdpWriter.write(sdp);
      expect(text).toContain('m=audio 49170 RTP/AVP 0\r\nc=IN IP4 192.0.2.1\r\na=sendrecv\r\na=setup:client\r\n');
    }
  });
});

describe('readme: resolve and negotiate', () => {
  test('Polycom offer, FreeSWITCH answer', () => {
    const offer = sdpReader.parseLenient(loadFixture('sip-polycom-soundpoint-offer')).sdp;
    const answer = sdpReader.parseLenient(loadFixture('sip-freeswitch-answer')).sdp;
    const [audio] = sdpResolver.resolve(offer).media;
    expect(audio.direction).toBe('sendrecv');
    expect(offer.media[0].direction).toBeUndefined();
    expect(audio.codecs[2]).toEqual({payloadType: 18, encodingName: 'G729', clockRate: 8000, parameters: {annexb: 'no'}});
    const [agreed] = sdpNegotiator.negotiate(offer, answer).media;
    expect(agreed.codecs.map(c => `${c.payloadType} ${c.encodingName}`)).toEqual(['0 PCMU', '101 telephone-event']);
    expect(agreed.hold).toBe(false);
  });
});

import {sdpReader, SdpParseError} from '../src';
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

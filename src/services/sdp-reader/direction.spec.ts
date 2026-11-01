import {sdpReader} from "./index";

const DIRECTIONS = ['sendrecv', 'sendonly', 'recvonly', 'inactive'] as const;

const sdpWith = (sessionDirection: string, mediaDirection: string) => [
  'v=0',
  'o=- 1 1 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  `a=${sessionDirection}`,
  'm=audio 9 RTP/AVP 0',
  'c=IN IP4 0.0.0.0',
  `a=${mediaDirection}`,
  '',
].join('\r\n');

describe('media direction (RFC 8866 §6.7)', () => {
  test.each(DIRECTIONS)('session-level a=%s', (direction) => {
    const sdp = sdpReader.parse(sdpWith(direction, 'sendrecv'));
    expect(sdp.direction).toBe(direction);
    expect(sdp.attributes?.[direction]).toBeUndefined();
  });
  test.each(DIRECTIONS)('media-level a=%s', (direction) => {
    const sdp = sdpReader.parse(sdpWith('sendrecv', direction));
    expect(sdp.media?.[0].direction).toBe(direction);
    expect(sdp.media?.[0].attributes?.[direction]).toBeUndefined();
  });
});

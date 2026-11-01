import {sdpReader, SdpParseError} from '../src';

const HEAD = ['v=0', 'o=- 1 1 IN IP4 127.0.0.1', 's=-', 't=0 0'];
const sdp = (...lines: string[]) => lines.join('\r\n') + '\r\n';

const parseError = (text: string): SdpParseError => {
  try {
    sdpReader.parse(text);
  } catch (e) {
    expect(e).toBeInstanceOf(SdpParseError);
    return e as SdpParseError;
  }
  throw new Error('expected parse to throw');
};

describe('malformed lines', () => {
  test.each([
    ['line without "="', sdp(...HEAD, 'garbage'), 5, 'expected "<type>=<value>"'],
    ['empty line in the middle', sdp('v=0', '', ...HEAD.slice(1)), 2, 'empty line'],
    ['unknown line type', sdp(...HEAD, 'x=1'), 5, 'unknown line type "x"'],
    ['wrong first line', sdp('o=- 1 1 IN IP4 127.0.0.1', 'v=0'), 1, 'must start with "v="'],
    ['unsupported version', sdp('v=1', ...HEAD.slice(1)), 1, 'unsupported protocol version "1"'],
    ['o= with 5 fields', sdp('v=0', 'o=- 1 1 IN IP4', 's=-', 't=0 0'), 2, 'expected "<username>'],
    ['o= non-numeric sess-id', sdp('v=0', 'o=- abc 1 IN IP4 h', 's=-', 't=0 0'), 2, 'sess-id "abc" is not numeric'],
    ['t= with letters', sdp('v=0', 'o=- 1 1 IN IP4 h', 's=-', 't=0 now'), 4, 'stop time "now"'],
    ['r= with unknown unit', sdp(...HEAD, 'r=7w 1h 0'), 5, 'time "7w"'],
    ['z= odd number of fields', sdp(...HEAD, 'r=7d 1h 0', 'z=3730928400'), 6, 'pairs'],
    ['m= without formats', sdp(...HEAD, 'm=audio 9 RTP/AVP'), 5, 'expected "<media> <port> <proto> <fmt> ..."'],
    ['m= with bad port', sdp(...HEAD, 'm=audio x RTP/AVP 0'), 5, 'port "x"'],
    ['RTP payload type out of range', sdp(...HEAD, 'm=audio 9 RTP/AVP 200'), 5, 'out of range'],
    ['b= without type', sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 'b=64'), 6, 'expected "<bwtype>:<bandwidth>"'],
    ['c= with 2 fields', sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 'c=IN IP4'), 6, 'expected "<nettype>'],
    ['malformed rtpmap', sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 'a=rtpmap:0 PCMU'), 6, 'clock rate'],
    ['invalid setup', sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 'a=setup:client'), 6, 'a=setup must be one of'],
    ['fingerprint without value', sdp(...HEAD, 'a=fingerprint:sha-256'), 5, 'a=fingerprint'],
    ['ice-ufrag without value', sdp(...HEAD, 'a=ice-ufrag'), 5, 'expected a value'],
    ['duplicate mid', sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 'a=mid:0', 'a=mid:1'), 7, 'duplicate a=mid'],
    ['two directions', sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 'a=sendrecv', 'a=inactive'), 7, 'duplicate a=inactive'],
    ['empty attribute name', sdp(...HEAD, 'a=:x'), 5, 'empty attribute name'],
  ])('%s', (_, text, lineNumber, reason) => {
    const error = parseError(text);
    expect(error.lineNumber).toBe(lineNumber);
    expect(error.reason).toContain(reason);
    expect(error.message).toContain(`SDP line ${lineNumber}`);
  });
});

describe('line order (RFC 8866 §5)', () => {
  test.each([
    ['s= before o=', sdp('v=0', 's=-', 'o=- 1 1 IN IP4 h', 't=0 0'), 3, 'out of order'],
    ['duplicate s=', sdp('v=0', 'o=- 1 1 IN IP4 h', 's=-', 's=-', 't=0 0'), 4, 'duplicate "s="'],
    ['c= after t=', sdp(...HEAD, 'c=IN IP4 0.0.0.0'), 5, 'out of order'],
    ['a= before t=', sdp('v=0', 'o=- 1 1 IN IP4 h', 's=-', 'a=sendrecv', 't=0 0'), 5, '"t=" must precede'],
    ['r= without t=', sdp('v=0', 'o=- 1 1 IN IP4 h', 's=-', 'r=7d 1h 0', 't=0 0'), 4, '"r=" must follow'],
    ['two z= in one time description', sdp(...HEAD, 'r=7d 1h 0', 'z=1 -1h', 'z=2 0'), 7, '"z=" must follow'],
    ['session-only line in media', sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 't=0 0'), 6, 'not allowed in a media description'],
    ['c= after a= in media', sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 'a=sendrecv', 'c=IN IP4 0.0.0.0'), 7, 'media order: m i c b k a'],
    ['two c= in media', sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 'c=IN IP4 a', 'c=IN IP4 b'), 7, 'multiple "c=" lines'],
  ])('%s', (_, text, lineNumber, reason) => {
    const error = parseError(text);
    expect(error.lineNumber).toBe(lineNumber);
    expect(error.reason).toContain(reason);
  });
});

describe('missing mandatory lines', () => {
  test.each([
    ['o=', sdp('v=0', 's=-', 't=0 0')],
    ['s=', sdp('v=0', 'o=- 1 1 IN IP4 h', 't=0 0')],
    ['t=', sdp('v=0', 'o=- 1 1 IN IP4 h', 's=-')],
    ['t=', sdp('v=0', 'o=- 1 1 IN IP4 h', 's=-', 'm=audio 9 RTP/AVP 0')],
  ])('missing %s', (letter, text) => {
    const error = parseError(text);
    expect(error.lineNumber).toBe(0);
    expect(error.reason).toBe(`missing mandatory "${letter}" line`);
  });
  test('empty input', () => {
    expect(parseError('').reason).toBe('missing mandatory "v=" line');
  });
});

describe('accepted deviations', () => {
  test('LF line endings (RFC 8866 §5: parsers SHOULD accept)', () => {
    expect(sdpReader.parse(HEAD.join('\n')).sessionName).toBe('-');
  });
  test('missing final line terminator', () => {
    expect(sdpReader.parse(HEAD.join('\r\n')).timing).toEqual([{startTime: 0, stopTime: 0}]);
  });
  test('RFC 4566-style z= after several t= lines', () => {
    const parsed = sdpReader.parse(sdp('v=0', 'o=- 1 1 IN IP4 h', 's=-', 't=1 2', 't=3 4', 'z=2882844526 -1h 2898848070 0'));
    expect(parsed.timing[1].zoneAdjustments).toEqual([
      {adjustmentTime: 2882844526, offset: -3600},
      {adjustmentTime: 2898848070, offset: 0},
    ]);
  });
  test('known attributes outside their scope are kept as generic attributes', () => {
    const parsed = sdpReader.parse(sdp(...HEAD, 'a=mid:0', 'm=audio 9 RTP/AVP 0', 'a=group:BUNDLE 0'));
    expect(parsed.attributes).toEqual([{name: 'mid', value: '0'}]);
    expect(parsed.media[0].attributes).toEqual([{name: 'group', value: 'BUNDLE 0'}]);
  });
  test('rtpmap/fmtp/rtcp-fb for a payload type not in m= are kept as generic attributes', () => {
    const [m] = sdpReader.parse(sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 'a=rtpmap:96 opus/48000/2', 'a=fmtp:96 x=1', 'a=rtcp-fb:96 nack')).media;
    expect(m.codecs).toEqual([{payloadType: 0}]);
    expect(m.attributes?.map(a => a.name)).toEqual(['rtpmap', 'fmtp', 'rtcp-fb']);
  });
});

describe('isValid', () => {
  test('true / false', () => {
    expect(sdpReader.isValid(sdp(...HEAD))).toBe(true);
    expect(sdpReader.isValid(sdp(...HEAD, 'x=1'))).toBe(false);
  });
});

import {msidParser, ssrcGroupParser, ssrcParser} from "./ssrc.parser";
import {SdpMediaSection} from "../../../../interfaces/Sdp";

describe('ssrcParser (RFC 5576 §4.1)', () => {
  test('lines of one SSRC are merged in order', () => {
    const m: SdpMediaSection = {type: 'video', port: 9, proto: 'RTP/AVP', codecs: []};
    expect(ssrcParser(m, '2967690126 cname:Qma7+xZ2EJoypHO7')).toBe(true);
    expect(ssrcParser(m, '2967690126 msid:stream track')).toBe(true);
    expect(ssrcParser(m, '4091562670 cname:Qma7+xZ2EJoypHO7')).toBe(true);
    expect(ssrcParser(m, '4091562670 x-flag')).toBe(true);
    expect(m.ssrcs).toEqual([
      {id: 2967690126, attributes: {cname: 'Qma7+xZ2EJoypHO7', msid: 'stream track'}},
      {id: 4091562670, attributes: {cname: 'Qma7+xZ2EJoypHO7', 'x-flag': null}},
    ]);
    expect(ssrcParser(m, '2967690126 cname:other')).toBe(false);
  });
  test.each(['2967690126', 'abc cname:x', '4294967296 cname:x'])('malformed: %s', (value) => {
    expect(() => ssrcParser({type: 'audio', port: 9, proto: 'RTP/AVP'}, value)).toThrow();
  });
});

describe('ssrcGroupParser (RFC 5576 §4.2)', () => {
  test('FID', () => {
    expect(ssrcGroupParser('FID 2967690126 4091562670')).toEqual({semantics: 'FID', ssrcs: [2967690126, 4091562670]});
  });
  test('malformed', () => {
    expect(() => ssrcGroupParser('FID 1 x')).toThrow();
  });
});

describe('msidParser (RFC 8830 §2)', () => {
  test('stream and track', () => {
    expect(msidParser('{1eefa43d} {0f97a290}')).toEqual({streamId: '{1eefa43d}', trackId: '{0f97a290}'});
  });
  test('no stream', () => {
    expect(msidParser('- c8211a22')).toEqual({streamId: '-', trackId: 'c8211a22'});
  });
  test('stream only', () => {
    expect(msidParser('stream')).toEqual({streamId: 'stream'});
  });
  test.each(['', 'a b c', 'a '])('malformed: "%s"', (value) => {
    expect(() => msidParser(value)).toThrow();
  });
});

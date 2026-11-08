import {Sdp, sdpReader, SdpParseError, SdpParseWarning, sdpValidator, sdpWriter} from '../src';
import {entryText, reasonMap} from './lenient-reason-map';
import {fixtureNames, loadFixture} from './fixtures';
import {lenientFixtureNames, loadLenientFixture} from './fixtures-lenient';
import {garbageInputs} from './lenient-garbage';

const O = 'o=- 1 1 IN IP4 h';
const HEAD = ['v=0', O, 's=-', 't=0 0'];
const M = 'm=audio 9 RTP/AVP 0 96';
const sdp = (...lines: string[]) => lines.join('\r\n') + '\r\n';
const lenient = (...lines: string[]) => sdpReader.parseLenient(sdp(...lines));
const strictError = (text: string): SdpParseError => {
  try {
    sdpReader.parse(text);
  } catch (e) {
    return e as SdpParseError;
  }
  throw new Error('expected parse to throw');
};
/** Warnings without the fields that are the same for every case */
const short = (warnings: SdpParseWarning[]) => warnings.map(w => [w.lineNumber, w.code, w.action]);

describe('reason map: every strict failure has a lenient rule', () => {
  test.each(reasonMap.map(e => [e.name, e] as const))('%s', (_, entry) => {
    const text = entryText(entry);
    const error = strictError(text);
    expect(error).toBeInstanceOf(SdpParseError);
    expect(error.reason).toBe(entry.reason);
    expect(error.lineNumber).toBe(entry.lineNumber);

    const {warnings} = sdpReader.parseLenient(text);
    const [first] = warnings.filter(w => w.action !== 'repaired');
    expect(first).toEqual({
      code: entry.code,
      reason: entry.reason,
      lineNumber: entry.lineNumber,
      line: error.line,
      action: entry.action,
    });
  });
});

describe('clean input', () => {
  test.each(fixtureNames())('%s', name => {
    const text = loadFixture(name);
    const {sdp: model, warnings} = sdpReader.parseLenient(text);
    expect(warnings).toEqual([]);
    expect(model).toEqual(sdpReader.parse(text));
  });
  test('LF endings, missing final terminator, RFC 4566 z= after several t=', () => {
    for (const text of [
      HEAD.join('\n'),
      HEAD.join('\r\n'),
      sdp('v=0', O, 's=-', 't=1 2', 't=3 4', 'z=2882844526 -1h 2898848070 0'),
      sdp('v=0', O, 's=-', 't=1 2', 'r=7d 1h 0', 'z=1 -1h', 't=3 4', 'r=1d 1h 0', 'z=2 0'),
    ]) {
      expect(sdpReader.parseLenient(text)).toEqual({sdp: sdpReader.parse(text), warnings: []});
    }
  });
  test('free-text lines keep their trailing whitespace without a warning', () => {
    const text = sdp('v=0', O, 's=name ', 'i=info\t', 'u=http://x ', 'e=a@b ', 'p=+1 ', 't=0 0', M, 'i=title ');
    const {sdp: model, warnings} = sdpReader.parseLenient(text);
    expect(warnings).toEqual([]);
    expect(model).toEqual(sdpReader.parse(text));
    expect(model.sessionName).toBe('name ');
    expect(model.media[0].information).toBe('title ');
  });
});

describe('lenient fixtures (hand-made, see test/fixtures-lenient/README.md)', () => {
  const expected: Record<string, (string | number)[][]> = {
    'cr-only-line-endings': [],
    'duplicate-direction': [[8, 'duplicate-attribute', 'generic-attribute']],
    'duplicate-s-line': [[4, 'duplicate-line', 'first-kept']],
    'empty-line-before-media': [[6, 'empty-line', 'skipped']],
    'malformed-m-port': [[6, 'malformed-media', 'kept']],
    'm-line-double-spaces': [[6, 'malformed-media', 'kept']],
    'm-line-rejected-no-formats': [[6, 'malformed-media', 'kept']],
    'missing-s-line': [[0, 'missing-mandatory-line', 'skipped']],
    'o-line-first': [[1, 'version-not-first', 'kept']],
    'out-of-order-c-after-a': [[10, 'out-of-order', 'kept']],
    'out-of-order-session-c-after-t': [[5, 'out-of-order', 'kept']],
    'setup-client': [[7, 'malformed-attribute', 'generic-attribute']],
    'trailing-whitespace': [1, 2, 4, 5, 6, 7, 8].map(n => [n, 'trailing-whitespace', 'repaired']),
    'unknown-line-type': [[6, 'unknown-line-type', 'skipped']],
  };
  test('every fixture has an expectation', () => {
    expect(lenientFixtureNames()).toEqual(Object.keys(expected).sort());
  });
  test.each(lenientFixtureNames())('%s', name => {
    const {sdp: model, warnings} = sdpReader.parseLenient(loadLenientFixture(name));
    expect(short(warnings)).toEqual(expected[name]);
    expect(model.media).toHaveLength(1);
  });
});

describe('recovery rules', () => {
  test('1 empty line: skipped', () => {
    const {sdp: model, warnings} = lenient('v=0', '', O, 's=-', 't=0 0');
    expect(short(warnings)).toEqual([[2, 'empty-line', 'skipped']]);
    expect(model).toEqual(sdpReader.parse(sdp(...HEAD)));
  });
  test('2 malformed line: skipped', () => {
    const {sdp: model, warnings} = lenient(...HEAD, 'garbage', M);
    expect(short(warnings)).toEqual([[5, 'malformed-line', 'skipped']]);
    expect(model.media).toHaveLength(1);
  });
  test('3 first line is not v=: parsed normally', () => {
    const {sdp: model, warnings} = lenient(O, 's=-', 't=0 0');
    expect(short(warnings)).toEqual([[1, 'missing-version', 'kept']]);
    expect(model.protocolVersion).toBeUndefined();
    expect(model.origin?.unicastAddress).toBe('h');
  });
  test('4 unknown line type: skipped', () => {
    const {sdp: model, warnings} = lenient(...HEAD, 'x=1', M, 'y=2');
    expect(short(warnings)).toEqual([[5, 'unknown-line-type', 'skipped'], [7, 'unknown-line-type', 'skipped']]);
    expect(model.media).toHaveLength(1);
  });
  test('5 session line in a media description: skipped', () => {
    const {sdp: model, warnings} = lenient(...HEAD, M, 's=other', 'a=sendrecv');
    expect(short(warnings)).toEqual([[6, 'wrong-scope', 'skipped']]);
    expect(model.sessionName).toBe('-');
    expect(model.media[0].direction).toBe('sendrecv');
  });
  test('6 out of order: accepted into the current scope', () => {
    const {sdp: model, warnings} = lenient(...HEAD, M, 'a=sendrecv', 'c=IN IP4 10.0.0.1', 'a=mid:0');
    expect(short(warnings)).toEqual([[7, 'out-of-order', 'kept']]);
    expect(model.media[0].connectionInformation).toEqual({netType: 'IN', addrType: 'IP4', connectionAddress: '10.0.0.1'});
    expect(model.media[0].mid).toBe('0');
    expect(model.connectionInformation).toBeUndefined();
  });
  test('6 out of order t=: the time description is kept', () => {
    const {sdp: model, warnings} = lenient('v=0', O, 's=-', 'a=sendrecv', 't=1 2');
    expect(short(warnings)).toEqual([[5, 'out-of-order', 'kept']]);
    expect(model.timing).toEqual([{startTime: 1, stopTime: 2}]);
  });
  test('7 duplicate single-occurrence line: the first is kept', () => {
    const {sdp: model, warnings} = lenient('v=0', O, 's=first', 's=second', 't=0 0');
    expect(short(warnings)).toEqual([[4, 'duplicate-line', 'first-kept']]);
    expect(model.sessionName).toBe('first');
  });
  test('8 r= without t=: skipped; r= after a=: attached to the last t=', () => {
    expect(short(lenient('v=0', O, 's=-', 'r=7d 1h 0', 't=0 0').warnings)).toEqual([[4, 'out-of-order', 'skipped']]);
    const {sdp: model, warnings} = lenient(...HEAD, 'a=sendrecv', 'r=7d 1h 0');
    expect(short(warnings)).toEqual([[6, 'out-of-order', 'kept']]);
    expect(model.timing?.[0].repeat).toEqual([{repeatInterval: 604800, activeDuration: 3600, offsets: [0]}]);
  });
  test('8 z=: set if the last t= has none, otherwise the first is kept', () => {
    const late = lenient(...HEAD, 'a=sendrecv', 'z=1 -1h');
    expect(short(late.warnings)).toEqual([[6, 'out-of-order', 'kept']]);
    expect(late.sdp.timing?.[0].zoneAdjustments).toEqual([{adjustmentTime: 1, offset: -3600}]);
    const twice = lenient(...HEAD, 'r=7d 1h 0', 'z=1 -1h', 'z=2 0');
    expect(short(twice.warnings)).toEqual([[7, 'out-of-order', 'first-kept']]);
    expect(twice.sdp.timing?.[0].zoneAdjustments).toEqual([{adjustmentTime: 1, offset: -3600}]);
  });
  test('9 v= other than 0: the number is kept', () => {
    const {sdp: model, warnings} = lenient('v=1', O, 's=-', 't=0 0');
    expect(short(warnings)).toEqual([[1, 'unsupported-version', 'kept']]);
    expect(model.protocolVersion).toBe(1);
  });
  test('10 v= not a number: undefined', () => {
    const {sdp: model, warnings} = lenient('v=abc', O, 's=-', 't=0 0');
    expect(short(warnings)).toEqual([[1, 'malformed-value', 'skipped']]);
    expect(model.protocolVersion).toBeUndefined();
  });
  test('11 malformed o=: fields kept as text when there are six', () => {
    const kept = lenient('v=0', 'o=- abc 1 IN IP4 h', 's=-', 't=0 0');
    expect(short(kept.warnings)).toEqual([[2, 'malformed-value', 'kept']]);
    expect(kept.sdp.origin).toEqual({username: '-', sessId: 'abc', sessVersion: '1', netType: 'IN', addrType: 'IP4', unicastAddress: 'h'});
    const skipped = lenient('v=0', 'o=- 1 1 IN IP4', 's=-', 't=0 0');
    expect(short(skipped.warnings)).toEqual([[2, 'malformed-value', 'skipped'], [0, 'missing-mandatory-line', 'skipped']]);
    expect(skipped.sdp.origin).toBeUndefined();
  });
  test('11 malformed c= / t= / b= / k= / r= / z=: skipped', () => {
    const {sdp: model, warnings} = lenient('v=0', O, 's=-', 'c=IN IP4', 'b=64', 't=0 0', 't=x 0', 'r=7w 1h 0', 'z=1', 'k=',
      M, 'c=IN', 'b=AS:x', 'k=:x');
    expect(short(warnings)).toEqual([
      [4, 'malformed-value', 'skipped'], [5, 'malformed-value', 'skipped'], [7, 'malformed-value', 'skipped'],
      [8, 'malformed-value', 'skipped'], [9, 'malformed-value', 'skipped'], [10, 'malformed-value', 'skipped'],
      [12, 'malformed-value', 'skipped'], [13, 'malformed-value', 'skipped'], [14, 'malformed-value', 'skipped'],
    ]);
    expect(model.connectionInformation).toBeUndefined();
    expect(model.bandwidths).toBeUndefined();
    expect(model.timing).toEqual([{startTime: 0, stopTime: 0}]);
    expect(model.encryptionKey).toBeUndefined();
    expect(model.media[0]).toEqual({type: 'audio', port: 9, proto: 'RTP/AVP', codecs: [{payloadType: 0}, {payloadType: 96}]});
  });
  test('12 malformed m=: the section is kept, later a= lines attach to it', () => {
    const {sdp: model, warnings} = lenient(...HEAD, 'm=audio x RTP/AVP 0 x 200', 'a=rtpmap:0 PCMU/8000', 'a=sendonly');
    expect(short(warnings)).toEqual([[5, 'malformed-media', 'kept']]);
    expect(model.media[0]).toEqual({
      type: 'audio',
      proto: 'RTP/AVP',
      codecs: [{payloadType: 0, encodingName: 'PCMU', clockRate: 8000}],
      formats: ['x', '200'],
      direction: 'sendonly',
    });
    expect(model.media[0].port).toBeUndefined();
  });
  test('12 malformed m=: what can be read is kept', () => {
    const media = (line: string) => lenient(...HEAD, line).sdp.media[0];
    expect(media('m=audio 9 RTP/AVP')).toEqual({type: 'audio', port: 9, proto: 'RTP/AVP', codecs: []});
    expect(media('m=audio 9/x RTP/AVP 0')).toEqual({type: 'audio', port: 9, proto: 'RTP/AVP', codecs: [{payloadType: 0}]});
    expect(media('m=audio 9/2/2 RTP/AVP 0')).toEqual({type: 'audio', proto: 'RTP/AVP', codecs: [{payloadType: 0}]});
    expect(media('m=application 9')).toEqual({type: 'application', port: 9});
    expect(media('m=audio')).toEqual({type: 'audio'});
  });
  test('12 doubled spaces in m=: the fields stay in place', () => {
    const media = (line: string) => lenient(...HEAD, line).sdp.media[0];
    const audio = {type: 'audio', port: 9, proto: 'RTP/AVP', codecs: [{payloadType: 18}, {payloadType: 0}]};
    expect(media('m=audio 9 RTP/AVP 18  0')).toEqual(audio);
    expect(media('m=audio  9 RTP/AVP 18 0')).toEqual(audio);
    expect(media('m=audio 9  RTP/AVP 18 0')).toEqual(audio);
    expect(media('m=application  9 UDP/DTLS/SCTP  webrtc-datachannel')).toEqual({
      type: 'application', port: 9, proto: 'UDP/DTLS/SCTP', formats: ['webrtc-datachannel'],
    });
    expect(media('m=')).toEqual({type: ''});
  });
  test('12 rejected stream without formats: port 0 is what the line says', () => {
    const {sdp: model, warnings} = lenient(...HEAD, 'm=video 0 RTP/AVP');
    expect(short(warnings)).toEqual([[5, 'malformed-media', 'kept']]);
    expect(model.media[0]).toEqual({type: 'video', port: 0, proto: 'RTP/AVP', codecs: []});
    expect(sdpReader.isComplete(model)).toBe(false);
    expect(() => sdpWriter.write(model)).toThrow('media section "video" has neither codecs nor formats');
  });
  test('13 malformed typed attribute: generic attribute with the original value', () => {
    const {sdp: model, warnings} = lenient(...HEAD, M, 'a=setup:client', 'a=setup:active');
    expect(short(warnings)).toEqual([[6, 'malformed-attribute', 'generic-attribute']]);
    expect(model.media[0].setup).toBe('active');
    expect(model.media[0].attributes).toEqual([{name: 'setup', value: 'client'}]);
  });
  test('14 repeated single-occurrence attribute: the first is kept, the rest are generic', () => {
    const {sdp: model, warnings} = lenient(...HEAD, M, 'a=sendrecv', 'a=inactive', 'a=mid:0', 'a=mid:1');
    expect(short(warnings)).toEqual([[7, 'duplicate-attribute', 'generic-attribute'], [9, 'duplicate-attribute', 'generic-attribute']]);
    expect(model.media[0].direction).toBe('sendrecv');
    expect(model.media[0].mid).toBe('0');
    expect(model.media[0].attributes).toEqual([{name: 'inactive'}, {name: 'mid', value: '1'}]);
  });
  test('15 missing o= / s= / t=: undefined, warnings at the end in the order o, s, t', () => {
    const {sdp: model, warnings} = lenient('v=0', M);
    expect(warnings).toEqual(['o', 's', 't'].map(letter => ({
      code: 'missing-mandatory-line', reason: `missing mandatory "${letter}=" line`, lineNumber: 0, line: '', action: 'skipped',
    })));
    expect(model.origin).toBeUndefined();
    expect(model.sessionName).toBeUndefined();
    expect(model.timing).toBeUndefined();
    expect(model.media).toHaveLength(1);
  });
});

describe('one warning per offending line', () => {
  test('v o s t c b: each misplaced line is reported', () => {
    const {sdp: model, warnings} = lenient(...HEAD, 'c=IN IP4 h', 'b=AS:64');
    expect(short(warnings)).toEqual([[5, 'out-of-order', 'kept'], [6, 'out-of-order', 'kept']]);
    expect(model.connectionInformation?.connectionAddress).toBe('h');
    expect(model.bandwidths).toEqual([{bwtype: 'AS', bandwidth: 64}]);
  });
  test('v o s c t c: a repeat with t= in between is out of order, the first is kept', () => {
    const {sdp: model, warnings} = lenient('v=0', O, 's=-', 'c=IN IP4 first', 't=0 0', 'c=IN IP4 second');
    expect(warnings).toEqual([{
      code: 'out-of-order',
      reason: 'line is out of order (session order: v o s i u e p c b t r z k a)',
      lineNumber: 6,
      line: 'c=IN IP4 second',
      action: 'first-kept',
    }]);
    expect(model.connectionInformation?.connectionAddress).toBe('first');
  });
  test('media m c c: duplicate-line', () => {
    const {sdp: model, warnings} = lenient(...HEAD, M, 'c=IN IP4 a', 'c=IN IP4 b');
    expect(warnings).toEqual([{
      code: 'duplicate-line',
      reason: 'multiple "c=" lines in one media description are not supported',
      lineNumber: 7,
      line: 'c=IN IP4 b',
      action: 'first-kept',
    }]);
    expect(model.media[0].connectionInformation?.connectionAddress).toBe('a');
  });
  test('the rank never goes down after an out-of-order line', () => {
    const {warnings} = lenient(...HEAD, 'a=x', 'c=IN IP4 h', 'b=AS:1', 'a=y');
    expect(short(warnings)).toEqual([[6, 'out-of-order', 'kept'], [7, 'out-of-order', 'kept']]);
  });
  test('the duplicate set is per media section', () => {
    const {warnings} = lenient(...HEAD, M, 'c=IN IP4 a', M, 'c=IN IP4 b');
    expect(warnings).toEqual([]);
  });
});

describe('version line', () => {
  test.each([
    ['o= first, no v=', [O, 's=-', 't=0 0'], [[1, 'missing-version', 'kept']], undefined],
    ['o= first, v=0 on line 2', [O, 'v=0', 's=-', 't=0 0'], [[1, 'version-not-first', 'kept']], 0],
    ['v=0 again on line N > 2', ['v=0', O, 's=-', 'v=0', 't=0 0'], [[4, 'out-of-order', 'first-kept']], 0],
    ['v=0 on lines 1 and 2', ['v=0', 'v=0', O, 's=-', 't=0 0'], [[2, 'duplicate-line', 'first-kept']], 0],
    ['garbage on line 1, v=0 on line 2', ['garbage', 'v=0', O, 's=-', 't=0 0'], [[1, 'malformed-line', 'skipped']], 0],
    ['empty line 1, v=0 on line 2', ['', 'v=0', O, 's=-', 't=0 0'], [[1, 'empty-line', 'skipped']], 0],
    ['x=1 on line 1, v=0 on line 2', ['x=1', 'v=0', O, 's=-', 't=0 0'], [[1, 'version-not-first', 'skipped']], 0],
    ['v=0, o=, v=1', ['v=0', O, 'v=1', 's=-', 't=0 0'], [[3, 'out-of-order', 'first-kept']], 0],
    ['v=0 with a trailing space', ['v=0 ', O, 's=-', 't=0 0'], [[1, 'trailing-whitespace', 'repaired']], 0],
    ['v=1', ['v=1', O, 's=-', 't=0 0'], [[1, 'unsupported-version', 'kept']], 1],
    ['v=abc', ['v=abc', O, 's=-', 't=0 0'], [[1, 'malformed-value', 'skipped']], undefined],
    ['v= only after the first m=', [O, 's=-', 't=0 0', M, 'v=0'], [[1, 'missing-version', 'kept'], [5, 'wrong-scope', 'skipped']], undefined],
    ['m= on line 1', [M, 'v=0'], [[1, 'missing-version', 'kept'], [2, 'wrong-scope', 'skipped'],
      [0, 'missing-mandatory-line', 'skipped'], [0, 'missing-mandatory-line', 'skipped'], [0, 'missing-mandatory-line', 'skipped']], undefined],
  ] as const)('%s', (_, lines, expected, version) => {
    const {sdp: model, warnings} = lenient(...lines);
    expect(short(warnings)).toEqual(expected);
    expect(model.protocolVersion).toBe(version);
  });
  test('version warning on a line that has another problem: the version warning wins', () => {
    const {sdp: model, warnings} = lenient('o=- abc 1 IN IP4 h', 'v=0', 's=-', 't=0 0');
    expect(warnings).toEqual([{
      code: 'version-not-first', reason: 'a session description must start with "v="', lineNumber: 1, line: 'o=- abc 1 IN IP4 h', action: 'kept',
    }]);
    expect(model.origin?.sessId).toBe('abc');
  });
  test('every line skipped: missing-version with lineNumber 0', () => {
    expect(sdpReader.parseLenient('garbage\r\n\r\n').warnings).toEqual([
      {code: 'malformed-line', reason: 'expected "<type>=<value>"', lineNumber: 1, line: 'garbage', action: 'skipped'},
      {code: 'empty-line', reason: 'empty line', lineNumber: 2, line: '', action: 'skipped'},
      {code: 'missing-version', reason: 'missing mandatory "v=" line', lineNumber: 0, line: '', action: 'skipped'},
      {code: 'missing-mandatory-line', reason: 'missing mandatory "o=" line', lineNumber: 0, line: '', action: 'skipped'},
      {code: 'missing-mandatory-line', reason: 'missing mandatory "s=" line', lineNumber: 0, line: '', action: 'skipped'},
      {code: 'missing-mandatory-line', reason: 'missing mandatory "t=" line', lineNumber: 0, line: '', action: 'skipped'},
    ]);
  });
  test('empty input: empty model', () => {
    const {sdp: model, warnings} = sdpReader.parseLenient('');
    expect(model).toEqual({media: []});
    expect(warnings.map(w => w.reason)).toEqual(['v', 'o', 's', 't'].map(l => `missing mandatory "${l}=" line`));
    expect(warnings[0].code).toBe('missing-version');
  });
});

describe('line endings and trailing whitespace', () => {
  test('CR-only and mixed line endings, no warning', () => {
    const expected = sdpReader.parse(sdp(...HEAD, M));
    expect(sdpReader.parseLenient([...HEAD, M].join('\r') + '\r')).toEqual({sdp: expected, warnings: []});
    expect(sdpReader.parseLenient('v=0\r' + O + '\n' + 's=-\r\nt=0 0\r' + M)).toEqual({sdp: expected, warnings: []});
  });
  test('trailing spaces and tabs are removed from typed lines', () => {
    const {sdp: model, warnings} = lenient('v=0', O + ' ', 's=-', 't=0 0\t', 'm=audio 9 RTP/AVP 0 ', 'a=rtpmap:0 PCMU/8000 \t', 'a=sendrecv ');
    expect(warnings).toEqual([2, 4, 5, 6, 7].map(n => expect.objectContaining({
      code: 'trailing-whitespace', reason: 'trailing whitespace removed', lineNumber: n, action: 'repaired',
    })));
    expect(warnings[0].line).toBe(O + ' ');
    expect(model).toEqual(sdpReader.parse(sdp(...HEAD, 'm=audio 9 RTP/AVP 0', 'a=rtpmap:0 PCMU/8000', 'a=sendrecv')));
  });
  test('a=sendrecv with a trailing space: strict keeps a generic attribute, lenient repairs the direction', () => {
    const text = sdp(...HEAD, M, 'a=sendrecv ');
    expect(sdpReader.parse(text).media[0]).toMatchObject({attributes: [{name: 'sendrecv '}]});
    expect(sdpReader.parse(text).media[0].direction).toBeUndefined();
    const {sdp: model, warnings} = sdpReader.parseLenient(text);
    expect(model.media[0].direction).toBe('sendrecv');
    expect(model.media[0].attributes).toBeUndefined();
    expect(short(warnings)).toEqual([[6, 'trailing-whitespace', 'repaired']]);
  });
  test('a line with trailing whitespace and another problem reports only the other problem', () => {
    const {sdp: model, warnings} = lenient(...HEAD, M, 'a=setup:client ');
    expect(warnings).toEqual([{
      code: 'malformed-attribute',
      reason: 'a=setup must be one of active, passive, actpass, holdconn',
      lineNumber: 6,
      line: 'a=setup:client ',
      action: 'generic-attribute',
    }]);
    expect(model.media[0].attributes).toEqual([{name: 'setup', value: 'client'}]);
  });
  test('whitespace-only lines are empty lines, also as the last line', () => {
    const {warnings} = sdpReader.parseLenient(['v=0', ' \t', O, 's=-', 't=0 0', '  '].join('\r\n'));
    expect(warnings).toEqual([
      {code: 'empty-line', reason: 'empty line', lineNumber: 2, line: ' \t', action: 'skipped'},
      {code: 'empty-line', reason: 'empty line', lineNumber: 6, line: '  ', action: 'skipped'},
    ]);
  });
  test('only space and tab are trimmed', () => {
    const {sdp: model, warnings} = lenient(...HEAD, M, 'a=mid:0 ');
    expect(warnings).toEqual([]);
    expect(model.media[0].mid).toBe('0 ');
  });
});

describe('atomic reads: a malformed or repeated attribute only adds a generic attribute', () => {
  const attributeEntries = reasonMap.filter(e => e.action === 'generic-attribute');
  test.each(attributeEntries.map(e => [e.name, e] as const))('%s', (_, entry) => {
    const offending = entry.lines[entry.lineNumber - 1];
    expect(entry.lineNumber).toBe(entry.lines.length); // the offending line is the last one
    const before = sdpReader.parseLenient(sdp(...entry.lines.slice(0, -1))).sdp;
    const after = sdpReader.parseLenient(entryText(entry)).sdp;
    const section: {attributes?: unknown[]} = before.media.length ? before.media[before.media.length - 1] : before;
    const value = offending.slice(2);
    const idx = value.indexOf(':');
    (section.attributes ??= []).push(idx === -1 ? {name: value} : {name: value.slice(0, idx), value: value.slice(idx + 1)});
    expect(after).toEqual(before);
  });
});

describe('writer', () => {
  test('formats next to codecs: lost on write, by design', () => {
    const {sdp: model} = lenient(...HEAD, 'm=audio 9 RTP/AVP 0 x 200');
    expect(model.media[0]).toMatchObject({codecs: [{payloadType: 0}], formats: ['x', '200']});
    expect(sdpWriter.write(model)).toContain('m=audio 9 RTP/AVP 0\r\n');
  });
  test('throws on a media section without port or proto', () => {
    expect(() => sdpWriter.write(lenient(...HEAD, 'm=audio x RTP/AVP 0').sdp)).toThrow('media section "audio" has no port');
    expect(() => sdpWriter.write(lenient(...HEAD, 'm=audio 9').sdp)).toThrow('media section "audio" has no proto');
  });
  test('throws without origin or timing, as for a strict model', () => {
    expect(() => sdpWriter.write(lenient('v=0', 's=-', 't=0 0').sdp)).toThrow('origin (o=) is required');
    expect(() => sdpWriter.write(lenient('v=0', O, 's=-').sdp)).toThrow('at least one timing (t=) entry is required');
  });
});

describe('repair property: structural warnings only → write produces strict SDP', () => {
  const STRUCTURAL = new Set(['empty-line', 'malformed-line', 'unknown-line-type', 'out-of-order', 'wrong-scope', 'duplicate-line', 'trailing-whitespace']);
  const inputs: string[] = [
    ...lenientFixtureNames().map(loadLenientFixture),
    ...reasonMap.map(entryText),
    sdp('v=0', 's=-', O, 'c=IN IP4 h', 't=0 0', 'b=AS:1', M, 'a=sendrecv', 'c=IN IP4 h', 'x=1', 'b=AS:2'),
    sdp('', 'v=0 ', O, 's=-', 't=0 0', 'a=x', 'r=7d 1h 0', 'z=1 -1h', 'z=2 0', 'garbage', M, 't=1 2', 'a=mid:0 '),
  ];
  test('every candidate input either qualifies and round-trips, or is excluded', () => {
    let checked = 0;
    for (const text of inputs) {
      const {sdp: model, warnings} = sdpReader.parseLenient(text);
      if (!warnings.every(w => STRUCTURAL.has(w.code)) || !sdpReader.isComplete(model)) {
        continue;
      }
      checked++;
      expect(() => sdpReader.parse(sdpWriter.write(model))).not.toThrow();
    }
    expect(checked).toBeGreaterThan(15);
  });
});

describe('isComplete', () => {
  test('narrows to Sdp only when every mandatory field is present', () => {
    expect(sdpReader.isComplete(lenient(...HEAD, M).sdp)).toBe(true);
    expect(sdpReader.isComplete(lenient(O, 's=-', 't=0 0').sdp)).toBe(false);
    expect(sdpReader.isComplete(lenient('v=0', 's=-', 't=0 0').sdp)).toBe(false);
    expect(sdpReader.isComplete(lenient(...HEAD, 'm=audio x RTP/AVP 0').sdp)).toBe(false);
    expect(sdpReader.isComplete(lenient(...HEAD, 'm=audio 9 RTP/AVP').sdp)).toBe(false);
    const {sdp: model} = lenient(...HEAD);
    if (sdpReader.isComplete(model)) {
      const strict: Sdp = model;
      expect(strict.origin.sessId).toBe('1');
    }
  });
});

describe('validator', () => {
  test('lenient: warnings become lenient:* issues, then the model is checked', () => {
    const issues = sdpValidator.validate(sdp('v=0', 's=-', O, 't=0 0', 'm=audio 9 RTP/AVP 96', 'a=sendrecv', 'a=inactive'), {lenient: true});
    expect(issues).toEqual([
      {
        severity: 'warning', code: 'lenient:out-of-order', lineNumber: 3,
        message: 'SDP line 3 "o=- 1 1 IN IP4 h": line is out of order (session order: v o s i u e p c b t r z k a)',
      },
      {severity: 'warning', code: 'lenient:duplicate-attribute', lineNumber: 7, message: 'SDP line 7 "a=inactive": duplicate a=inactive'},
      {severity: 'error', code: 'missing-connection', message: 'c= is required at session level or in every media description (RFC 8866 §5.7)', mediaIndex: 0},
      {severity: 'error', code: 'missing-rtpmap', message: 'payload type 96 is dynamic and needs a=rtpmap (RFC 8866 §6.6)', mediaIndex: 0},
    ]);
  });
  test('lenient: a model without origin, timing or port does not crash the checks', () => {
    const issues = sdpValidator.validate(sdp('s=-', 'm=audio x UDP/TLS/RTP/SAVPF 0', 'a=ice-ufrag:abcd'), {lenient: true});
    expect(issues.map(i => i.code)).toEqual([
      'lenient:missing-version', 'lenient:malformed-media', 'lenient:missing-mandatory-line', 'lenient:missing-mandatory-line',
      'invalid-version', 'missing-origin', 'missing-timing', 'missing-connection',
      'missing-ice-pwd', 'missing-fingerprint', 'missing-setup',
    ]);
    expect(issues[2]).toMatchObject({lineNumber: 0, message: 'SDP: missing mandatory "o=" line'});
  });
  test('without the option: one parse-error issue, as before', () => {
    expect(sdpValidator.validate(sdp('v=0', 's=-', O, 't=0 0'))).toEqual([
      expect.objectContaining({severity: 'error', code: 'parse-error', lineNumber: 3}),
    ]);
  });
  test('lenient on clean input: same issues as strict', () => {
    for (const name of fixtureNames()) {
      const text = loadFixture(name);
      expect(sdpValidator.validate(text, {lenient: true})).toEqual(sdpValidator.validate(text));
    }
  });
});

describe('never throws', () => {
  const inputs = garbageInputs();

  test(`${inputs.length} generated inputs: no exception, well-formed warnings`, () => {
    for (const text of inputs) {
      const {sdp: model, warnings} = sdpReader.parseLenient(text);
      expect(Array.isArray(model.media)).toBe(true);
      let last = 1;
      for (const w of warnings) {
        expect(w.lineNumber === 0 || w.lineNumber >= last).toBe(true);
        if (w.lineNumber === 0) {
          last = Infinity;
          expect(w.line).toBe('');
        } else {
          last = w.lineNumber;
        }
      }
      // A clean result means strict accepts the text and agrees (strict does not split on a lone CR)
      if (warnings.length === 0 && !/\r(?!\n)/.test(text)) {
        expect(sdpReader.parse(text)).toEqual(model);
      }
    }
  });
});

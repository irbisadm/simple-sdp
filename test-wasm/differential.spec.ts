// Differential test: the WebAssembly build must behave exactly like the TypeScript
// implementation — same model, same error messages, same written text, same issues —
// on the fixtures and on deterministic mutations of them.
import * as ts from '../src/index'; // not '../src': jest maps that to the adapter
import * as wasm from './adapter';
import {fixtureNames, loadFixture} from '../test/fixtures';
import {lenientFixtureNames, loadLenientFixture} from '../test/fixtures-lenient';
import {entryText, reasonMap} from '../test/lenient-reason-map';
import {garbageInputs} from '../test/lenient-garbage';

type Outcome = {ok: true, value: unknown} | {ok: false, error: string};

const run = (fn: () => unknown): Outcome => {
  try {
    return {ok: true, value: JSON.parse(JSON.stringify(fn()))};
  } catch (e) {
    return {ok: false, error: (e as Error).message};
  }
};

/** mulberry32 */
const prng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const TOKENS = [
  '', ' ', ':', '=', '/', ';', ',', '~', '*', '-', 'x', '0', '1', '15', '96', '127', '128', '-1', '1.5', '007',
  '4294967295', '4294967296', '99999999999999999999', 'send', 'recv', 'sendonly', 'actpass', 'typ', 'host', 'raddr',
  'rport', 'tcptype', 'pt=96', 'pt=', 'max-width=1280', 'a', 'b', 'IN', 'IP4', '0.0.0.0', 'sha-256', 'AA:BB', 'ü', '🎉',
  '1d', '2h', '3m', '4s', '-5h', 'opus/48000/2', 'VP8/90000', 'x/y/z/w', 'BUNDLE', 'FID', 'SIM', 'urn:ietf', '\t',
];

const mutate = (text: string, rnd: () => number): string => {
  const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)];
  const lines = text.split('\r\n').filter(l => l.length);
  const ops = 1 + Math.floor(rnd() * 3);
  for (let n = 0; n < ops; n++) {
    const i = Math.floor(rnd() * lines.length);
    const line = lines[i] ?? '';
    switch (Math.floor(rnd() * 9)) {
      case 0: // delete a line
        lines.splice(i, 1);
        break;
      case 1: // duplicate a line
        lines.splice(i, 0, line);
        break;
      case 2: // move a line
        lines.splice(Math.floor(rnd() * lines.length), 0, ...lines.splice(i, 1));
        break;
      case 3: { // replace one space-separated token of the value
        const parts = line.split(' ');
        parts[Math.floor(rnd() * parts.length)] = pick(TOKENS);
        lines[i] = parts.join(' ');
        break;
      }
      case 4: { // replace the attribute value
        const idx = line.indexOf(':');
        lines[i] = idx === -1 ? `${line}:${pick(TOKENS)}` : line.slice(0, idx + 1) + [pick(TOKENS), pick(TOKENS)].join(pick([' ', '/', ';', ',', '']));
        break;
      }
      case 5: // truncate
        lines[i] = line.slice(0, Math.floor(rnd() * line.length));
        break;
      case 6: // insert a known attribute with a random value
        lines.splice(i, 0, `a=${pick(ATTRIBUTES)}${rnd() < 0.2 ? '' : ':' + [pick(TOKENS), pick(TOKENS), pick(TOKENS)].join(pick([' ', ';', '/']))}`);
        break;
      case 7: // change the line type
        lines[i] = pick(['v', 'o', 's', 'i', 'u', 'e', 'p', 'c', 'b', 't', 'r', 'z', 'k', 'a', 'm', 'x', '']) + line.slice(1);
        break;
      default: // remove the attribute value
        lines[i] = line.replace(/:.*$/, '');
    }
  }
  return lines.join(rnd() < 0.1 ? '\n' : '\r\n') + (rnd() < 0.9 ? '\r\n' : '');
};

const ATTRIBUTES = [
  'sendrecv', 'sendonly', 'recvonly', 'inactive', 'ice-ufrag', 'ice-pwd', 'ice-options', 'ice-lite', 'candidate',
  'end-of-candidates', 'fingerprint', 'setup', 'extmap', 'group', 'mid', 'msid', 'ssrc', 'ssrc-group', 'rid', 'simulcast',
  'extmap-allow-mixed', 'rtcp-mux', 'rtcp-rsize', 'rtcp', 'sctp-port', 'max-message-size', 'rtpmap', 'fmtp', 'rtcp-fb',
  'msid-semantic', 'x-unknown',
];

const STATS: Record<string, number> = {};
afterAll(() => { if (process.env.SDP_STATS) console.log(Object.entries(STATS).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n')); });
const compare = (text: string) => {
  const tsParse = run(() => ts.sdpReader.parse(text));
  const key = tsParse.ok ? 'OK' : (tsParse.error.replace(/^SDP line \d+ "[^\n]*?": /, '').replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N'));
  STATS[key] = (STATS[key] ?? 0) + 1;
  expect(run(() => wasm.sdpReader.parse(text))).toEqual(tsParse);
  expect(wasm.sdpReader.isValid(text)).toBe(ts.sdpReader.isValid(text));
  for (const type of [undefined, 'offer', 'answer'] as const) {
    expect(run(() => wasm.sdpValidator.validate(text, {type}))).toEqual(run(() => ts.sdpValidator.validate(text, {type})));
  }
  compareLenient(text);
  if (tsParse.ok) {
    const model = tsParse.value as ts.Sdp;
    expect(run(() => wasm.sdpWriter.write(model))).toEqual(run(() => ts.sdpWriter.write(model)));
    expect(run(() => wasm.sdpValidator.validate(model, {type: 'answer'}))).toEqual(run(() => ts.sdpValidator.validate(model, {type: 'answer'})));
  }
};

/** parseLenient, the lenient validator, and writing the lenient model */
const compareLenient = (text: string) => {
  const tsResult = run(() => ts.sdpReader.parseLenient(text));
  expect(tsResult.ok).toBe(true);
  expect(run(() => wasm.sdpReader.parseLenient(text))).toEqual(tsResult);
  for (const type of [undefined, 'answer'] as const) {
    expect(run(() => wasm.sdpValidator.validate(text, {type, lenient: true})))
      .toEqual(run(() => ts.sdpValidator.validate(text, {type, lenient: true})));
  }
  if (tsResult.ok) {
    const model = (tsResult.value as ts.SdpLenientResult).sdp;
    expect(run(() => wasm.sdpWriter.write(model))).toEqual(run(() => ts.sdpWriter.write(model)));
    expect(run(() => wasm.sdpValidator.validate(model))).toEqual(run(() => ts.sdpValidator.validate(model)));
  }
};

describe('wasm build matches the TypeScript implementation on lenient inputs', () => {
  test.each(lenientFixtureNames())('lenient fixture %s', (name) => {
    compare(loadLenientFixture(name));
  });
  test('reason map entries', () => {
    for (const entry of reasonMap) {
      compare(entryText(entry));
    }
  });
  test('generated garbage (same seed as the never-throws test)', () => {
    // The wasm module receives UTF-8, so lone surrogates arrive as U+FFFD: compare on that text
    const utf8 = (text: string) => new TextDecoder().decode(new TextEncoder().encode(text));
    for (const text of garbageInputs()) {
      compareLenient(utf8(text));
    }
  });
  test('CR-only, mixed endings, trailing whitespace', () => {
    for (const text of [
      'v=0\ro=- 1 1 IN IP4 h\rs=-\rt=0 0\r', 'v=0\r\no=- 1 1 IN IP4 h\ns=- \rt=0 0\t\r\n', ' \t\r\nv=0 \r\n',
      'x=1\nv=0\n', 'm=audio 9\nv=0', 'v=0\no=- 1 1 IN IP4 h\ns=-\nt=0 0\nm=audio 9/2/x RTP/AVP 0 1x 300 \na=sendrecv ',
    ]) {
      compare(text);
    }
  });
});

describe('wasm build matches the TypeScript implementation', () => {
  test.each(fixtureNames())('fixture %s', (name) => {
    compare(loadFixture(name));
  });

  test.each(fixtureNames())('mutations of %s', (name) => {
    const text = loadFixture(name);
    const rnd = prng(name.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
    for (let i = 0; i < 300; i++) {
      compare(mutate(text, rnd));
    }
  });

  test('model edits: removed and changed fields', () => {
    const base = ts.sdpReader.parse(loadFixture('chrome-simulcast-offer'));
    const edits: ((s: any) => void)[] = [
      s => delete s.origin,
      s => s.timing = [],
      s => delete s.sessionName,
      s => s.protocolVersion = 1,
      s => s.media[0].codecs = [],
      s => {
        s.media[0].codecs = undefined;
        s.media[0].formats = ['webrtc-datachannel'];
      },
      s => s.media[1].codecs[0].clockRate = undefined,
      s => s.media[1].codecs[0].parameters = {'1': 'a', b: null, '0': 'c', '01': 'd'},
      s => s.media[1].extmap[0].id = 15,
      s => s.media[1].direction = '',
      s => s.media[1].rids = [{id: 'h', direction: 'send', payloadTypes: [1, 2], restrictions: {}}],
      s => s.media[1].ssrcGroups = [{semantics: 'FID', ssrcs: []}],
      s => s.group = [{semantics: 'BUNDLE', mids: []}],
      s => s.media[0].candidates = [{foundation: 'f', component: 1, transport: 'UDP', priority: 1.5, address: 'h', port: 9, type: 'host', extensions: {'2': 'x', a: 'y'}}],
      s => s.timing[0].repeat = [{repeatInterval: 604800, activeDuration: 3600, offsets: [0, -25200]}],
      s => s.media[0].rtcp = {port: 9, netType: 'IN'},
      s => s.media = [],
    ];
    for (const edit of edits) {
      const model = JSON.parse(JSON.stringify(base));
      edit(model);
      expect(run(() => wasm.sdpWriter.write(model))).toEqual(run(() => ts.sdpWriter.write(model)));
      for (const type of [undefined, 'offer', 'answer'] as const) {
        expect(run(() => wasm.sdpValidator.validate(model, {type}))).toEqual(run(() => ts.sdpValidator.validate(model, {type})));
      }
    }
  });
});

describe('wasm build matches on targeted lines', () => {
  const session = ['v=0', 'o=- 1 1 IN IP4 127.0.0.1', 's=-', 't=0 0'];
  const media = ['m=video 9 UDP/TLS/RTP/SAVPF 96 97 0', 'c=IN IP4 0.0.0.0'];
  const LINES = [
    // m=, c=, b=, k=, t=, r=, z=, o=
    'm=audio 9/2 RTP/AVP 0', 'm=audio 9/2/3 RTP/AVP 0', 'm=audio 9/x RTP/AVP 0', 'm=audio 9 RTP/AVP 128', 'm=audio 9 RTP/AVP',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'm=audio 9 TCP/RTP/AVP 0', 'm=audio 9 RTP 0', 'm=audio 9 XRTP/AVP 0',
    'c=IN IP4', 'c=IN IP4 224.2.1.1/127/3', 'b=AS:x', 'b=:5', 'b=AS', 'b=TIAS:64000', 'k=', 'k=:x', 'k=clear:a:b', 'k=prompt',
    't=1 2 3', 't=x 0', 'r=7d 1h 0 25h', 'r=7d 1h', 'r=1x 1 0', 'r=d 1 0', 'z=2882844526 -1h 2898848070 0', 'z=1 2 3',
    'z=1 --1h', 'z=1 -', 'o=- x 1 IN IP4 h', 'o=- 1 1 IN IP4', 'o=a 99999999999999999999999 1 X Y z',
    // a=
    'a=candidate:1 1 UDP 2122260223 192.0.2.1 54400 typ host', 'a=candidate:1 1 UDP 2122260223 192.0.2.1 54400 typ host generation',
    'a=candidate:1 1 TCP 1 h 9 typ host tcptype active generation 0 raddr 1.2.3.4 rport 5 raddr 5.6.7.8',
    'a=candidate:1 1 UDP 1 h 9 typ srflx raddr  rport 5', 'a=candidate:1 1 UDP 1 h 9 type host', 'a=candidate:1 x UDP 1 h 9 typ host',
    'a=candidate:1 1 UDP 1 h 9 typ host 2 a 1 b', 'a=candidate:1 1 UDP 1 h 9 typ host rport x',
    'a=ssrc:1 cname:a', 'a=ssrc:4294967296 cname:a', 'a=ssrc:1', 'a=ssrc:1 ', 'a=ssrc:x cname:a', 'a=ssrc:1 msid:a b',
    'a=ssrc:1 flag', 'a=ssrc-group:FID 1 2', 'a=ssrc-group:FID', 'a=ssrc-group: 1', 'a=ssrc-group:FID 1  2', 'a=ssrc-group:SIM 4294967296',
    'a=msid:a b', 'a=msid:a', 'a=msid:a b c', 'a=msid: b', 'a=msid:a ', 'a=msid:- t',
    'a=rid:h send', 'a=rid:h recv pt=96,97;max-width=1280;max-fps=30', 'a=rid:h send max-width=1;pt=96', 'a=rid:h send pt',
    'a=rid:h send pt=x', 'a=rid:h sendrecv', 'a=rid:h! send', 'a=rid:h send ', 'a=rid:h', 'a=rid:h send depend=a,b;flag',
    'a=rid:h send pt=96;pt=97', 'a=rid:h send 1=a;0=b',
    'a=simulcast:send h;m;l', 'a=simulcast:send h,~m;~l recv a', 'a=simulcast:send h send m', 'a=simulcast:sendrecv h',
    'a=simulcast:send', 'a=simulcast:send h recv', 'a=simulcast:send h! ', 'a=simulcast:send ~', 'a=simulcast:send h;;m',
    'a=extmap:1 urn:x', 'a=extmap:1/sendonly urn:x attr more', 'a=extmap:1/both urn:x', 'a=extmap:1/sendonly/x urn:x',
    'a=extmap:1', 'a=extmap:1 ', 'a=extmap:x urn:x', 'a=extmap:15 urn:x', 'a=extmap:0 urn:x', 'a=extmap:256 urn:x',
    'a=rtpmap:96 VP8/90000', 'a=rtpmap:96 opus/48000/2', 'a=rtpmap:96 VP8', 'a=rtpmap:96 /90000', 'a=rtpmap:96 a/1/2/3',
    'a=rtpmap:96 VP8/x', 'a=rtpmap:96 VP8/1/x', 'a=rtpmap:96', 'a=rtpmap:x VP8/90000', 'a=rtpmap:98 VP8/90000',
    'a=fmtp:96 a=1; b ;c=;=d;;', 'a=fmtp:96', 'a=fmtp:96 ', 'a=fmtp:x a=1', 'a=fmtp:98 a=1', 'a=fmtp:97 1=x;0=y;a=z;01=w',
    'a=rtcp-fb:96 nack pli', 'a=rtcp-fb:* nack', 'a=rtcp-fb:96', 'a=rtcp-fb:96 ', 'a=rtcp-fb:x nack', 'a=rtcp-fb:98 nack',
    'a=rtcp:9', 'a=rtcp:9 IN IP4 0.0.0.0', 'a=rtcp:9 IN', 'a=rtcp:x',
    'a=sctp-port:5000', 'a=sctp-port:x', 'a=max-message-size:262144', 'a=max-message-size:',
    'a=setup:actpass', 'a=setup:foo', 'a=setup', 'a=fingerprint:sha-256 AA:BB', 'a=fingerprint:sha-256', 'a=fingerprint:sha-256 AA BB',
    'a=fingerprint:sha-256 aa:bb:cc', 'a=fingerprint:SHA-1 ' + Array(20).fill('AB').join(':'), 'a=fingerprint:x-y A:BB',
    'a=ice-ufrag:abc', 'a=ice-pwd:short', 'a=ice-options:trickle renomination', 'a=ice-options:', 'a=ice-lite', 'a=ice-lite:x',
    'a=group:BUNDLE 0 1', 'a=group:BUNDLE', 'a=group:BUNDLE  0', 'a=group:LS a', 'a=mid:', 'a=mid:0', 'a=end-of-candidates',
    'a=end-of-candidates:1', 'a=extmap-allow-mixed', 'a=rtcp-mux', 'a=rtcp-rsize', 'a=sendonly', 'a=sendonly:x',
    'a=fmtp:96 \u00a0a=1;\u3000b\ufeff;\u2028c=2\u2029;\u000bd;\u000ce;\u1680f;\u200bg;\u0085h',
    'a=fingerprint:sha-256 ' + 'ab:'.repeat(31) + 'ab', 'a=fingerprint:\u212Aha-1 AB', 'a=fingerprint:SHA-256 \u0430B:AB',
    'a=:x', 'a=x-unknown', 'a=x-unknown:', 'a=x-unknown: v', 'a=msid-semantic: WMS', 'a=constructor', 'a=toString:x',
  ];
  test.each(LINES)('%s', (line) => {
    const lines = (...l: string[]) => l.join('\r\n') + '\r\n';
    const type = line[0];
    if ('mcbk'.includes(type)) {
      compare(lines(...session, ...(type === 'm' ? [] : media.slice(0, 1)), line, ...(type === 'm' ? ['c=IN IP4 0.0.0.0'] : [])));
      compare(lines('v=0', 'o=- 1 1 IN IP4 127.0.0.1', 's=-', ...(type === 'm' ? [] : [line]), 't=0 0'));
    } else if ('trzo'.includes(type)) {
      compare(lines('v=0', ...(type === 'o' ? [line] : ['o=- 1 1 IN IP4 h']), 's=-', ...(type === 't' ? [line] : ['t=0 0']), ...('rz'.includes(type) ? [line] : [])));
    } else {
      compare(lines(...session, line, ...media));
      compare(lines(...session, ...media, line));
      compare(lines(...session, ...media, line, line));
    }
  });
});

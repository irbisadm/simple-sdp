// Seeded garbage for the "never throws" property of sdpReader.parseLenient: random lines,
// random bytes decoded as UTF-8, truncated fixtures and shuffled fixture lines. Shared by
// test/lenient.spec.ts (run against TS and, through the adapter, wasm) and
// test-wasm/differential.spec.ts (TS vs wasm on the same inputs). No dependency.
import {fixtureNames, loadFixture} from './fixtures';

export const garbageInputs = (seed = 0x5d9): string[] => {
  /** mulberry32 */
  const prng = (seed: number) => () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rnd = prng(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <T>(list: readonly T[]): T => list[int(list.length)];
  const TYPES = 'vosiuepcbtrzkamx= \t'.split('');
  const PIECES = ['0', '1', ' ', ':', '/', 'IN', 'IP4', 'RTP/AVP', 'audio', 'x', '-1', '999', '\t', 'ü', '🎉', 'sendrecv',
    'rtpmap:0 PCMU/8000', 'setup:client', 'mid:0', 'candidate:1 1 UDP 1 h 9 typ host', '7d', '1h', '\uD800', '\uDFFF'];
  const fixtures = fixtureNames().map(loadFixture);

  const inputs: string[] = [];
  for (let n = 0; n < 150; n++) { // random lines
    const lines: string[] = [];
    for (let i = int(30); i > 0; i--) {
      let line = pick(TYPES) + (rnd() < 0.9 ? '=' : '');
      for (let j = int(6); j > 0; j--) {
        line += pick(PIECES);
      }
      lines.push(line);
    }
    inputs.push(lines.join(pick(['\r\n', '\n', '\r'])));
  }
  for (let n = 0; n < 100; n++) { // random bytes decoded as UTF-8
    const bytes = new Uint8Array(int(400));
    bytes.forEach((_, i) => bytes[i] = rnd() < 0.3 ? pick([0x0a, 0x0d, 0x3d, 0x20]) : int(256));
    inputs.push(new TextDecoder().decode(bytes));
  }
  for (let n = 0; n < 100; n++) { // truncated fixtures
    const text = pick(fixtures);
    inputs.push(text.slice(0, int(text.length)));
  }
  for (let n = 0; n < 100; n++) { // shuffled fixture lines
    const lines = pick(fixtures).split('\r\n');
    for (let i = lines.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [lines[i], lines[j]] = [lines[j], lines[i]];
    }
    inputs.push(lines.join('\r\n'));
  }
  return inputs;
};

import {lineTimeParser} from "./line-time.parser";

describe('lineTimeParser tests', () => {
  test('number string', () => {
    const parsedTime = lineTimeParser('67536575765');
    expect(parsedTime).toBe(67536575765);
  })
  test('correct sfx', () => {
    const allowedSfx = {'d': 86400, 'h': 3600, 'm': 60, 's': 1} as const;
    const baseTime = 30;
    for (const sfx in allowedSfx) {
      //@ts-ignore
      const result = allowedSfx[sfx] * baseTime;
      const testTime = `${baseTime}${sfx}`;
      const parsedTime = lineTimeParser(testTime);
      expect(parsedTime).toBe(result);
    }
  })
  test('incorrect sfx', () => {
    expect(() => lineTimeParser('30p')).toThrow();
  })
  test('multiple sfx', () => {
    expect(() => lineTimeParser('30dm')).toThrow();
  })
  test('incorrect string', () => {
    expect(() => lineTimeParser('abc14')).toThrow();
    expect(() => lineTimeParser('14abc')).toThrow();
    expect(() => lineTimeParser('a14bc')).toThrow();
  })
})
describe('lineTimeParser — RFC 8866 §5.10 examples', () => {
  test.each([
    ['7d', 604800],
    ['1h', 3600],
    ['25h', 90000],
    ['0', 0],
    ['90m', 5400],
    ['15s', 15],
  ])('%s -> %i seconds', (input, expected) => {
    expect(lineTimeParser(input)).toBe(expected);
  });
});

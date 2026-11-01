import {sdpReader, sdpWriter} from '../src';
import {fixtureNames, loadFixture} from './fixtures';

/** Splits an SDP into sections (session + each m=) of sorted lines */
const sections = (text: string): string[][] => {
  const result: string[][] = [[]];
  for (const line of text.split('\r\n').filter(Boolean)) {
    if (line.startsWith('m=')) {
      result.push([]);
    }
    result[result.length - 1].push(line);
  }
  return result.map(lines => [...lines].sort());
};

/** Non-attribute lines, in order */
const skeleton = (text: string) => text.split('\r\n').filter(l => l && !l.startsWith('a='));

describe.each(fixtureNames())('round trip: %s', (name) => {
  const input = loadFixture(name);
  const parsed = sdpReader.parse(input);
  const output = sdpWriter.write(parsed);

  test('every line is preserved within its section', () => {
    expect(sections(output)).toEqual(sections(input));
  });
  test('non-attribute lines keep their order', () => {
    expect(skeleton(output)).toEqual(skeleton(input));
  });
  test('parse(write(parse(x))) equals parse(x)', () => {
    expect(sdpReader.parse(output)).toEqual(parsed);
  });
  test('write is idempotent', () => {
    expect(sdpWriter.write(sdpReader.parse(output))).toBe(output);
  });
  test('CRLF terminated', () => {
    expect(output.endsWith('\r\n')).toBe(true);
    expect(output.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });
});

import {rLineParser} from "./r-line.parser";

describe('rLineParser — RFC 8866 §5.10', () => {
  const expected = {repeatInterval: 604800, activeDuration: 3600, offsets: [0, 90000]};
  test('seconds form', () => {
    expect(rLineParser('604800 3600 0 90000')).toEqual(expected);
  });
  test('compact form with units', () => {
    expect(rLineParser('7d 1h 0 25h')).toEqual(expected);
  });
  test('single offset', () => {
    expect(rLineParser('7d 1h 0')).toEqual({repeatInterval: 604800, activeDuration: 3600, offsets: [0]});
  });
  test('malformed', () => {
    expect(() => rLineParser('7d')).toThrow();
    expect(() => rLineParser('7d 1h')).toThrow();
    expect(() => rLineParser('7x 1h 0')).toThrow();
  });
});

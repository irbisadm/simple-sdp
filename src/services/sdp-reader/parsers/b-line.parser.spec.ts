import {bLineParser} from "./b-line.parser";

describe('bLineParser', () => {
  test('b=AS', () => {
    expect(bLineParser('b=AS:30')).toEqual({bwtype: 'AS', bandwidth: 30});
  });
  test('b=TIAS', () => {
    expect(bLineParser('b=TIAS:128000')).toEqual({bwtype: 'TIAS', bandwidth: 128000});
  });
});

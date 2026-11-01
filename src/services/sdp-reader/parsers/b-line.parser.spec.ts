import {bLineParser} from "./b-line.parser";

describe('bLineParser', () => {
  test('AS', () => {
    expect(bLineParser('AS:30')).toEqual({bwtype: 'AS', bandwidth: 30});
  });
  test('TIAS', () => {
    expect(bLineParser('TIAS:128000')).toEqual({bwtype: 'TIAS', bandwidth: 128000});
  });
});

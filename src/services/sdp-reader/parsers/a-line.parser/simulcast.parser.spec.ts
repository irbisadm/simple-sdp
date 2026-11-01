import {ridParser, simulcastParser} from "./simulcast.parser";

describe('ridParser (RFC 8851)', () => {
  test('Chrome / Firefox style', () => {
    expect(ridParser('q send')).toEqual({id: 'q', direction: 'send'});
  });
  test('pt list and restrictions (RFC 8851 §11.1 example)', () => {
    expect(ridParser('5 send pt=99,102;max-br=64000;max-width=1280;max-height=720;max-fps=30')).toEqual({
      id: '5', direction: 'send', payloadTypes: [99, 102],
      restrictions: {'max-br': '64000', 'max-width': '1280', 'max-height': '720', 'max-fps': '30'},
    });
  });
  test('restrictions only, depend', () => {
    expect(ridParser('2 recv max-width=640;depend=1')).toEqual({
      id: '2', direction: 'recv', restrictions: {'max-width': '640', depend: '1'},
    });
  });
  test.each(['q', 'q sideways', 'q send ', 'q send max-fps=30;pt=96', 'q.1 send', 'q send pt=x'])('malformed: "%s"', (value) => {
    expect(() => ridParser(value)).toThrow();
  });
});

describe('simulcastParser (RFC 8853 §5.1)', () => {
  test('send only', () => {
    expect(simulcastParser('send q;h;f')).toEqual({send: [[{rid: 'q'}], [{rid: 'h'}], [{rid: 'f'}]]});
  });
  test('alternatives, paused, both directions', () => {
    expect(simulcastParser('send 1;~4;2,3 recv c')).toEqual({
      send: [[{rid: '1'}], [{rid: '4', paused: true}], [{rid: '2'}, {rid: '3'}]],
      recv: [[{rid: 'c'}]],
    });
  });
  test('SFU answer: recv', () => {
    expect(simulcastParser('recv q;h;f')).toEqual({recv: [[{rid: 'q'}], [{rid: 'h'}], [{rid: 'f'}]]});
  });
  test.each(['', 'send', 'send a recv', 'send a send b', 'both a', 'send a;;b', 'send rid=a;b'])('malformed: "%s"', (value) => {
    expect(() => simulcastParser(value)).toThrow();
  });
});

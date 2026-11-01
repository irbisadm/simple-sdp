import {candidateParser} from "./candidate.parser";

describe('candidateParser (RFC 8839 §5.1)', () => {
  test('host UDP candidate with Chrome extensions', () => {
    expect(candidateParser('982367225 1 udp 2122260223 172.28.144.1 55351 typ host generation 0 network-id 1')).toEqual({
      foundation: '982367225', component: 1, transport: 'udp', priority: 2122260223,
      address: '172.28.144.1', port: 55351, type: 'host',
      extensions: {generation: '0', 'network-id': '1'},
    });
  });
  test('TCP candidate (RFC 6544)', () => {
    expect(candidateParser('3 1 TCP 2105524479 437e5878-f022-4407-acef-3e428035a480.local 9 typ host tcptype active')).toEqual({
      foundation: '3', component: 1, transport: 'TCP', priority: 2105524479,
      address: '437e5878-f022-4407-acef-3e428035a480.local', port: 9, type: 'host', tcpType: 'active',
    });
  });
  test('relay candidate with raddr/rport (RFC 8839 §5.1 example)', () => {
    expect(candidateParser('2 1 UDP 1694498815 192.0.2.3 45664 typ srflx raddr 203.0.113.141 rport 8998')).toEqual({
      foundation: '2', component: 1, transport: 'UDP', priority: 1694498815,
      address: '192.0.2.3', port: 45664, type: 'srflx', relatedAddress: '203.0.113.141', relatedPort: 8998,
    });
  });
  test.each([
    '1 1 UDP 1 192.0.2.3 45664 host',
    '1 1 UDP 1 192.0.2.3 45664 typ',
    '1 1 UDP 1 192.0.2.3 45664 typ host raddr',
    '1 x UDP 1 192.0.2.3 45664 typ host',
    '1 1 UDP 1 192.0.2.3 port typ host',
  ])('malformed: %s', (value) => {
    expect(() => candidateParser(value)).toThrow();
  });
});

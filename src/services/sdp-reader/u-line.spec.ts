import {sdpReader} from "./index";

test('u= is stored as uri, not as session information', () => {
  const sdp = sdpReader.parse('v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\ni=info\r\nu=https://example.com/s\r\nt=0 0\r\n');
  expect(sdp.uri).toBe('https://example.com/s');
  expect(sdp.sessionInformation).toBe('info');
});

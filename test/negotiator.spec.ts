import {sdpNegotiator, sdpReader} from '../src';

const lines = (...l: string[]) => l.join('\r\n') + '\r\n';
const HEAD = ['v=0', 'o=- 1 1 IN IP4 127.0.0.1', 's=-', 't=0 0'];
const model = (text: string) => sdpReader.parseLenient(text).sdp;
const negotiate = (offer: string, answer: string) => sdpNegotiator.negotiate(model(offer), model(answer));

const OFFER = lines(
  ...HEAD, 'a=group:BUNDLE 0 1',
  'm=audio 49170 UDP/TLS/RTP/SAVPF 111 0', 'c=IN IP4 0.0.0.0', 'a=mid:0', 'a=sendrecv',
  'a=ice-ufrag:aaaa', 'a=ice-pwd:bbbbbbbbbbbbbbbbbbbbbb', 'a=fingerprint:sha-256 AA:BB', 'a=setup:actpass',
  'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level',
  'm=video 49172 UDP/TLS/RTP/SAVPF 96', 'a=mid:1', 'a=sendrecv', 'a=rtpmap:96 VP8/90000',
);

const ANSWER = lines(
  ...HEAD, 'a=group:BUNDLE 0 1',
  'm=audio 49180 UDP/TLS/RTP/SAVPF 111', 'c=IN IP4 0.0.0.0', 'a=mid:0', 'a=sendrecv',
  'a=setup:active', 'a=rtpmap:111 opus/48000/2',
  'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level',
  'm=video 0 UDP/TLS/RTP/SAVPF 96', 'a=mid:1', 'a=rtpmap:96 VP8/90000',
);

const SIP_AUDIO = lines(
  'v=0', 'o=alice 2890844526 2890844526 IN IP4 192.0.2.10', 's=-', 'c=IN IP4 192.0.2.10', 't=0 0',
  'm=audio 49170 RTP/AVP 0 8 18 101', 'a=rtpmap:101 telephone-event/8000', 'a=fmtp:101 0-16', 'a=fmtp:18 annexb=no',
);

describe('sdpNegotiator.negotiate', () => {
  test('agreed codecs and extensions, rejected video', () => {
    expect(negotiate(OFFER, ANSWER)).toEqual({
      bundle: ['0', '1'],
      hold: false,
      media: [{
        index: 0, offerIndex: 0, mid: '0', type: 'audio', rejected: false,
        codecs: [{payloadType: 111, encodingName: 'opus', clockRate: 48000, encodingParameters: 2}],
        extmap: [{id: 1, uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level'}],
        offerDirection: 'sendrecv', answerDirection: 'sendrecv', hold: false,
      }, {
        index: 1, offerIndex: 1, mid: '1', type: 'video', rejected: true,
        codecs: [], extmap: [],
        offerDirection: 'sendrecv', answerDirection: 'sendrecv', hold: false,
      }],
    });
  });

  test('accepts strict models', () => {
    expect(sdpNegotiator.negotiate(sdpReader.parse(OFFER), sdpReader.parse(ANSWER))).toEqual(negotiate(OFFER, ANSWER));
  });

  test('hold when either side stops a direction', () => {
    const answerHold = negotiate(OFFER, ANSWER.replace('a=sendrecv', 'a=sendonly'));
    expect(answerHold.media[0]).toMatchObject({answerDirection: 'sendonly', hold: true});
    expect(answerHold.hold).toBe(true);
    const offerHold = negotiate(OFFER.replace('a=sendrecv', 'a=inactive'), ANSWER);
    expect(offerHold.media[0]).toMatchObject({offerDirection: 'inactive', hold: true});
    expect(offerHold.hold).toBe(true);
  });

  test('a rejected section is not on hold', () => {
    const n = negotiate(OFFER, ANSWER.replace('a=mid:1', 'a=mid:1\r\na=inactive'));
    expect(n.media[1]).toMatchObject({rejected: true, answerDirection: 'inactive', hold: false});
    expect(n.hold).toBe(false);
  });

  test('codecs match by name, clock rate and channels, not by payload type', () => {
    const answer = SIP_AUDIO
      .replace('RTP/AVP 0 8 18 101', 'RTP/AVP 8 96')
      .replace('a=rtpmap:101', 'a=rtpmap:96')
      .replace('a=fmtp:101', 'a=fmtp:96');
    const [m] = negotiate(SIP_AUDIO, answer).media;
    expect(m.codecs.map(c => `${c.payloadType} ${c.encodingName}`)).toEqual(['8 PCMA', '96 telephone-event']);
  });

  test('codec names compare case-insensitively; channels default to 1', () => {
    const offer = lines(...HEAD, 'm=audio 4000 RTP/AVP 96 97', 'a=rtpmap:96 OPUS/48000/2', 'a=rtpmap:97 PCMU/8000/1');
    const answer = lines(...HEAD, 'm=audio 4000 RTP/AVP 96 0', 'a=rtpmap:96 opus/48000/2');
    expect(negotiate(offer, answer).media[0].codecs.map(c => c.payloadType)).toEqual([96, 0]);
  });

  test('unnamed payload types match by number', () => {
    const offer = lines(...HEAD, 'm=audio 4000 RTP/AVP 20 21');
    const answer = lines(...HEAD, 'm=audio 4000 RTP/AVP 21 22');
    expect(negotiate(offer, answer).media[0].codecs).toEqual([{payloadType: 21}]);
  });

  test('media sections match by mid, else by position', () => {
    const offer = lines(...HEAD, 'm=audio 4000 RTP/AVP 0', 'a=mid:a', 'm=audio 4002 RTP/AVP 8', 'a=mid:b');
    const byMid = negotiate(offer, lines(...HEAD, 'm=audio 5000 RTP/AVP 8', 'a=mid:b'));
    expect(byMid.media[0]).toMatchObject({index: 0, offerIndex: 1, mid: 'b'});
    expect(byMid.media[0].codecs.map(c => c.encodingName)).toEqual(['PCMA']);
    const byPosition = negotiate(SIP_AUDIO, lines(...HEAD, 'm=audio 5000 RTP/AVP 0'));
    expect(byPosition.media[0]).toMatchObject({index: 0, offerIndex: 0});
    expect(byPosition.media[0].mid).toBeUndefined();
  });

  test('answer section without an offer section', () => {
    const [, extra] = negotiate(SIP_AUDIO, lines(...HEAD, 'm=audio 5000 RTP/AVP 0', 'm=video 5002 RTP/AVP 96', 'a=sendonly')).media;
    expect(extra.offerIndex).toBeUndefined();
    expect(extra).toMatchObject({codecs: [], offerDirection: 'sendrecv', answerDirection: 'sendonly', hold: true});
  });

  test('extensions match by URI and encryption', () => {
    const offer = lines(...HEAD, 'm=audio 4000 RTP/SAVP 0', 'a=extmap:1 urn:a',
      'a=extmap:2 urn:ietf:params:rtp-hdrext:encrypt urn:b');
    const answer = lines(...HEAD, 'm=audio 4000 RTP/SAVP 0', 'a=extmap:3 urn:a', 'a=extmap:4 urn:b');
    expect(negotiate(offer, answer).media[0].extmap).toEqual([{id: 3, uri: 'urn:a'}]);
  });

  test('bundle comes from the answer only', () => {
    expect(negotiate(OFFER, ANSWER.replace('a=group:BUNDLE 0 1\r\n', '')).bundle).toEqual([]);
  });
});

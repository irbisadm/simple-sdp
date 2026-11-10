import {Sdp, SdpCommonAttributes, SdpExtmap, SdpLenient, SdpLenientMediaSection} from "../../interfaces/Sdp";
import {SdpResolved, SdpResolvedCodec, SdpResolvedExtmap, SdpResolvedMediaSection} from "../../interfaces/Resolved";

interface StaticPayloadType {
  encodingName: string;
  clockRate: number;
  encodingParameters?: number;
}

/** Statically assigned payload types — RFC 3551 §6, tables 4 and 5 */
const STATIC_PAYLOAD_TYPES: Record<number, StaticPayloadType> = {
  0: {encodingName: 'PCMU', clockRate: 8000},
  3: {encodingName: 'GSM', clockRate: 8000},
  4: {encodingName: 'G723', clockRate: 8000},
  5: {encodingName: 'DVI4', clockRate: 8000},
  6: {encodingName: 'DVI4', clockRate: 16000},
  7: {encodingName: 'LPC', clockRate: 8000},
  8: {encodingName: 'PCMA', clockRate: 8000},
  9: {encodingName: 'G722', clockRate: 8000},
  10: {encodingName: 'L16', clockRate: 44100, encodingParameters: 2},
  11: {encodingName: 'L16', clockRate: 44100},
  12: {encodingName: 'QCELP', clockRate: 8000},
  13: {encodingName: 'CN', clockRate: 8000},
  14: {encodingName: 'MPA', clockRate: 90000},
  15: {encodingName: 'G728', clockRate: 8000},
  16: {encodingName: 'DVI4', clockRate: 11025},
  17: {encodingName: 'DVI4', clockRate: 22050},
  18: {encodingName: 'G729', clockRate: 8000},
  25: {encodingName: 'CelB', clockRate: 90000},
  26: {encodingName: 'JPEG', clockRate: 90000},
  28: {encodingName: 'nv', clockRate: 90000},
  31: {encodingName: 'H261', clockRate: 90000},
  32: {encodingName: 'MPV', clockRate: 90000},
  33: {encodingName: 'MP2T', clockRate: 90000},
  34: {encodingName: 'H263', clockRate: 90000},
};

const ENCRYPT_URI = 'urn:ietf:params:rtp-hdrext:encrypt';

const isDigits = (s: string | undefined): s is string => s !== undefined && /^\d+$/.test(s);

const genericValue = (s: SdpCommonAttributes, name: string): string | undefined =>
  s.attributes?.find(a => a.name === name)?.value;

/**
 * `a=rtpmap` lines that lenient parsing kept as generic attributes, where the payload
 * type and the encoding name are still readable: `a=rtpmap:101 telephone-event` (no clock
 * rate) is seen in real traffic. The first line of each payload type wins.
 */
const looseRtpmaps = (m: SdpLenientMediaSection): Map<number, StaticPayloadType | {encodingName: string}> => {
  const out = new Map<number, StaticPayloadType | {encodingName: string}>();
  for (const a of m.attributes ?? []) {
    if (a.name !== 'rtpmap' || a.value === undefined) {
      continue;
    }
    const [pt, encoding] = a.value.split(' ').filter(part => part.length > 0);
    const [encodingName, clockRate, encodingParameters] = (encoding ?? '').split('/');
    if (!isDigits(pt) || !encodingName || out.has(Number(pt))) {
      continue;
    }
    const codec: {encodingName: string, clockRate?: number, encodingParameters?: number} = {encodingName};
    if (isDigits(clockRate)) {
      codec.clockRate = Number(clockRate);
      if (isDigits(encodingParameters)) {
        codec.encodingParameters = Number(encodingParameters);
      }
    }
    out.set(Number(pt), codec);
  }
  return out;
}

const resolveCodecs = (m: SdpLenientMediaSection): SdpResolvedCodec[] => {
  const loose = looseRtpmaps(m);
  const wildcard = m.rtcpFeedbackWildcard ?? [];
  return (m.codecs ?? []).map(c => {
    const codec: SdpResolvedCodec = {...c};
    if (codec.encodingName === undefined) {
      const known = loose.get(c.payloadType) ?? STATIC_PAYLOAD_TYPES[c.payloadType];
      if (known !== undefined) {
        Object.assign(codec, known);
        if (!loose.has(c.payloadType)) {
          codec.static = true;
        }
      }
    }
    const feedback = [...(c.rtcpFeedback ?? [])];
    for (const fb of wildcard) {
      if (!feedback.includes(fb)) {
        feedback.push(fb);
      }
    }
    if (feedback.length) {
      codec.rtcpFeedback = feedback;
    }
    return codec;
  });
}

const resolveExtmap = (e: SdpExtmap): SdpResolvedExtmap => {
  if (e.uri !== ENCRYPT_URI || e.attributes === undefined) {
    return {...e};
  }
  const [uri, ...rest] = e.attributes.split(' ');
  const out: SdpResolvedExtmap = {id: e.id, uri, encrypted: true};
  if (e.direction !== undefined) {
    out.direction = e.direction;
  }
  if (rest.length) {
    out.attributes = rest.join(' ');
  }
  return out;
}

const resolveExtmaps = (media: SdpExtmap[] | undefined, session: SdpExtmap[] | undefined): SdpResolvedExtmap[] => {
  const own = (media ?? []).map(resolveExtmap);
  const ids = new Set(own.map(e => e.id));
  return [...own, ...(session ?? []).filter(e => !ids.has(e.id)).map(resolveExtmap)];
}

/** Typed `a=setup`, or one that lenient parsing kept as a generic attribute because its value is not in RFC 4145 */
const setupOf = (s: SdpCommonAttributes): string | undefined => s.setup ?? genericValue(s, 'setup');

const resolveMedia = (m: SdpLenientMediaSection, index: number, session: SdpLenient): SdpResolvedMediaSection => {
  const out: SdpResolvedMediaSection = {
    index,
    type: m.type,
    rejected: m.port === 0,
    direction: m.direction ?? session.direction ?? 'sendrecv',
    codecs: resolveCodecs(m),
    extmap: resolveExtmaps(m.extmap, session.extmap),
    fingerprints: (m.fingerprints ?? session.fingerprints ?? []).map(f => ({...f})),
  };
  // optional fields stay absent rather than undefined, as in the parsed model
  const iceUfrag = m.iceUfrag ?? session.iceUfrag;
  const icePwd = m.icePwd ?? session.icePwd;
  const setup = setupOf(m) ?? setupOf(session);
  if (m.mid !== undefined) out.mid = m.mid;
  if (m.port !== undefined) out.port = m.port;
  if (m.proto !== undefined) out.proto = m.proto;
  if (iceUfrag !== undefined) out.iceUfrag = iceUfrag;
  if (icePwd !== undefined) out.icePwd = icePwd;
  if (setup !== undefined) out.setup = setup;
  return out;
}

/**
 * The effective view of a session description: what applies to each media section.
 * Accepts the model of `sdpReader.parse` and of `sdpReader.parseLenient`; does not
 * modify it.
 */
const resolve = (sdp: Sdp | SdpLenient): SdpResolved => {
  const media = sdp.media.map((m, i) => resolveMedia(m, i, sdp));
  const bundle = sdp.group?.find(g => g.semantics === 'BUNDLE');
  return {
    bundle: bundle ? [...bundle.mids] : [],
    hold: media.some(m => !m.rejected && m.direction !== 'sendrecv'),
    media,
  };
}

export const sdpResolver = {resolve};

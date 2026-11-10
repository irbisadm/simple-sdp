import {Sdp, SdpLenient} from "../../interfaces/Sdp";
import {
  SdpNegotiatedMediaSection, SdpNegotiation, SdpResolvedCodec, SdpResolvedExtmap, SdpResolvedMediaSection,
} from "../../interfaces/Resolved";
import {sdpResolver} from "../sdp-resolver";

/** Media subtype names are ASCII case-insensitive (RFC 4855 §3) */
const asciiLower = (s: string): string => s.replace(/[A-Z]/g, c => c.toLowerCase());

/** Codecs match by name, clock rate and channels; a codec without a name matches by payload type */
const codecKey = (c: SdpResolvedCodec): string =>
  c.encodingName === undefined
    ? `#${c.payloadType}`
    : `${asciiLower(c.encodingName)}/${c.clockRate ?? ''}/${c.encodingParameters ?? 1}`;

const extmapKey = (e: SdpResolvedExtmap): string => (e.encrypted ? 'encrypted ' : '') + e.uri;

const negotiateMedia = (
  am: SdpResolvedMediaSection,
  om: SdpResolvedMediaSection | undefined,
): SdpNegotiatedMediaSection => {
  const rejected = am.rejected;
  const offerCodecs = new Set((om?.codecs ?? []).map(codecKey));
  const offerExtmap = new Set((om?.extmap ?? []).map(extmapKey));
  const offerDirection = om?.direction ?? 'sendrecv';
  const out: SdpNegotiatedMediaSection = {
    index: am.index,
    type: am.type,
    rejected,
    codecs: rejected ? [] : am.codecs.filter(c => offerCodecs.has(codecKey(c))),
    extmap: rejected ? [] : am.extmap.filter(e => offerExtmap.has(extmapKey(e))),
    offerDirection,
    answerDirection: am.direction,
    hold: !rejected && (offerDirection !== 'sendrecv' || am.direction !== 'sendrecv'),
  };
  if (om !== undefined) out.offerIndex = om.index;
  if (am.mid !== undefined) out.mid = am.mid;
  return out;
}

/**
 * RFC 3264 offer/answer: what the two sides agreed on, per media section of the answer.
 * Accepts the models of `sdpReader.parse` and of `sdpReader.parseLenient`.
 */
const negotiate = (offer: Sdp | SdpLenient, answer: Sdp | SdpLenient): SdpNegotiation => {
  const o = sdpResolver.resolve(offer);
  const a = sdpResolver.resolve(answer);
  const offerByMid = new Map<string, SdpResolvedMediaSection>();
  for (const m of o.media) {
    if (m.mid !== undefined && !offerByMid.has(m.mid)) {
      offerByMid.set(m.mid, m);
    }
  }
  const media = a.media.map(am =>
    negotiateMedia(am, (am.mid !== undefined ? offerByMid.get(am.mid) : undefined) ?? o.media[am.index]));
  return {
    bundle: a.bundle,
    hold: media.some(m => m.hold),
    media,
  };
}

export const sdpNegotiator = {negotiate};

/**
 * The effective view of a session description (`sdpResolver.resolve`) and the result
 * of RFC 3264 offer/answer (`sdpNegotiator.negotiate`).
 *
 * The parsed model says what is written; these say what applies: session-level values
 * are inherited by every media section that does not set its own, static payload types
 * get their RFC 3551 names, and lines that lenient parsing kept as generic attributes
 * are read where their meaning is still clear.
 */
import {SdpCodec, SdpDirection, SdpExtmap, SdpFingerprint} from './Sdp';

/** A payload type with everything that applies to it */
interface SdpResolvedCodec extends SdpCodec {
  /**
   * The `m=` line lists the payload type without `a=rtpmap`; `encodingName`, `clockRate`
   * and `encodingParameters` come from the RFC 3551 §6 table. Absent when the payload
   * type has `a=rtpmap`, or is not in the table (it then has no `encodingName`).
   */
  static?: true;
}

/** `a=extmap`, with RFC 6904 encryption unwrapped */
interface SdpResolvedExtmap extends SdpExtmap {
  /**
   * The line was `a=extmap:<id> urn:ietf:params:rtp-hdrext:encrypt <uri> [<attributes>]`
   * (RFC 6904 §4): `uri` and `attributes` are those of the encrypted extension.
   */
  encrypted?: true;
}

interface SdpResolvedMediaSection {
  /** Index in `sdp.media` */
  index: number;
  /** `a=mid` */
  mid?: string;
  type: string;
  /** Undefined when the `m=` line of a lenient model has no readable port */
  port?: number;
  /** Port 0 (RFC 3264 §6) */
  rejected: boolean;
  proto?: string;
  /** Media level, else session level, else `sendrecv` (RFC 8866 §6.7) */
  direction: SdpDirection;
  /**
   * In `m=` order. `a=rtcp-fb:*` values are added to the `rtcpFeedback` of every codec.
   * Empty for non-RTP protocols.
   */
  codecs: SdpResolvedCodec[];
  /** Media-level lines, then session-level lines whose id the media level does not use (RFC 8285 §5) */
  extmap: SdpResolvedExtmap[];
  /** Media level, else session level */
  iceUfrag?: string;
  /** Media level, else session level */
  icePwd?: string;
  /**
   * Media level, else session level. A value outside RFC 4145 (kept by lenient parsing
   * as a generic attribute) is reported as written.
   */
  setup?: string;
  /** Media level, else session level */
  fingerprints: SdpFingerprint[];
}

interface SdpResolved {
  /** Mids of the first `a=group:BUNDLE` line (RFC 9143) */
  bundle: string[];
  /** A media section that is not rejected has a direction other than `sendrecv` */
  hold: boolean;
  media: SdpResolvedMediaSection[];
}

/** Offer/answer result for one media section of the answer */
interface SdpNegotiatedMediaSection {
  /** Index in `answer.media` */
  index: number;
  /**
   * Index in `offer.media` of the matching section: the one with the same `a=mid`, else
   * the one at the same index (RFC 3264 §6). Absent when the offer has no such section.
   */
  offerIndex?: number;
  /** `a=mid` of the answer */
  mid?: string;
  type: string;
  /** The answer rejects the section (port 0) */
  rejected: boolean;
  /** Answer codecs that the offer also lists, compared by name (case-insensitive), clock rate and channels. Empty when rejected. */
  codecs: SdpResolvedCodec[];
  /** Answer extensions that the offer also lists, compared by URI and encryption. Empty when rejected. */
  extmap: SdpResolvedExtmap[];
  offerDirection: SdpDirection;
  answerDirection: SdpDirection;
  /** Not rejected, and either side has a direction other than `sendrecv` */
  hold: boolean;
}

interface SdpNegotiation {
  /** BUNDLE group of the answer; empty when the answer does not accept BUNDLE (RFC 9143 §7.3) */
  bundle: string[];
  /** Some media section is on hold */
  hold: boolean;
  /** One entry per media section of the answer */
  media: SdpNegotiatedMediaSection[];
}

export {
  SdpResolved,
  SdpResolvedCodec,
  SdpResolvedExtmap,
  SdpResolvedMediaSection,
  SdpNegotiation,
  SdpNegotiatedMediaSection,
}

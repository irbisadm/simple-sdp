/**
 * Session description model.
 *
 * The model is lossless: every line of a parsed SDP is represented either by a typed
 * field or, for attributes the library does not interpret, by an entry in `attributes`.
 */

/** RFC 8866 §6.7 */
type SdpDirection = 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive';

/** RFC 4145 §4, used by DTLS-SRTP (RFC 5763) */
type SdpSetup = 'active' | 'passive' | 'actpass' | 'holdconn';

/**
 * An attribute the library does not interpret, kept as-is.
 * `a=<name>` is `{name}`; `a=<name>:<value>` is `{name, value}`. The value is kept
 * verbatim, including leading whitespace (e.g. `a=msid-semantic: WMS`).
 */
interface SdpGenericAttribute {
  name: string;
  value?: string;
}

/** `a=fingerprint` — RFC 8122 §5 */
interface SdpFingerprint {
  /** e.g. `sha-256` */
  hashFunction: string;
  /** Upper-case hex pairs separated by colons */
  fingerprint: string;
}

/** `a=extmap` — RFC 8285 §8 */
interface SdpExtmap {
  id: number;
  direction?: SdpDirection;
  uri: string;
  /** Extension attributes, verbatim */
  attributes?: string;
}

/** `a=candidate` — RFC 8839 §5.1 (TCP candidates: RFC 6544) */
interface SdpCandidate {
  foundation: string;
  /** 1 = RTP, 2 = RTCP */
  component: number;
  /** `UDP`, `TCP`, as written (case is not normalized) */
  transport: string;
  priority: number;
  /** IP address or FQDN (e.g. an mDNS `*.local` name) */
  address: string;
  port: number;
  type: 'host' | 'srflx' | 'prflx' | 'relay' | (string & {});
  /** `raddr` */
  relatedAddress?: string;
  /** `rport` */
  relatedPort?: number;
  /** `tcptype` — RFC 6544 */
  tcpType?: 'active' | 'passive' | 'so' | (string & {});
  /** Other extension attributes in their original order, e.g. `generation`, `ufrag`, `network-id` */
  extensions?: Record<string, string>;
}

/**
 * All `a=ssrc:<ssrc-id> <attribute>[:<value>]` lines of one SSRC — RFC 5576 §4.1.
 * Lines of the same SSRC are merged, in order of first appearance.
 */
interface SdpSsrc {
  id: number;
  /** Source attributes in their original order, e.g. `cname`, `msid`. Attributes without a value map to null. */
  attributes: Record<string, string | null>;
}

/** `a=ssrc-group:<semantics> <ssrc-id> ...` — RFC 5576 §4.2 */
interface SdpSsrcGroup {
  /** `FID`, `FEC`, `FEC-FR`, `SIM`, … */
  semantics: string;
  ssrcs: number[];
}

/** `a=msid:<stream id> [<track id>]` — RFC 8830 §2 */
interface SdpMsid {
  /** msid-id; `-` means "no stream" */
  streamId: string;
  /** msid-appdata; WebRTC uses it for the track id */
  trackId?: string;
}

/** Attributes allowed both at session level and at media level */
interface SdpCommonAttributes {
  /** RFC 8866 §6.7. At session level it is the default for all media sections. */
  direction?: SdpDirection;
  /** `a=ice-ufrag` — RFC 8839 §5.4 */
  iceUfrag?: string;
  /** `a=ice-pwd` — RFC 8839 §5.4 */
  icePwd?: string;
  /** `a=ice-options` — RFC 8839 §5.6 */
  iceOptions?: string[];
  /** `a=end-of-candidates` — RFC 8840 §8.2 */
  endOfCandidates?: boolean;
  /** `a=fingerprint` — RFC 8122 §5. Several lines are allowed. */
  fingerprints?: SdpFingerprint[];
  /** `a=setup` — RFC 4145 §4 */
  setup?: SdpSetup;
  /** `a=extmap` — RFC 8285 */
  extmap?: SdpExtmap[];
  /** Attributes without a typed representation, in their original order */
  attributes?: SdpGenericAttribute[];
}

/**
 * `o=<username> <sess-id> <sess-version> <nettype> <addrtype> <unicast-address>` — RFC 8866 §5.2
 */
interface SdpOrigin {
  /** User's login on the originating host, or `-` */
  username: string;
  /**
   * Numeric string. Kept as a string because implementations use 64-bit values
   * that do not fit into a JavaScript number.
   */
  sessId: string;
  /** Numeric string, see {@link sessId}. Increase it on every modification. */
  sessVersion: string;
  /** `IN` */
  netType: string;
  /** `IP4` | `IP6` */
  addrType: string;
  unicastAddress: string;
}

/** `r=<repeat interval> <active duration> <offsets from start-time>` — RFC 8866 §5.10. All values in seconds. */
interface SdpRepeatTimes {
  repeatInterval: number;
  activeDuration: number;
  offsets: number[];
}

/** One `<adjustment time> <offset>` pair of `z=` — RFC 8866 §5.11. Values in seconds. */
interface SdpTimeZoneAdjustment {
  adjustmentTime: number;
  offset: number;
}

/**
 * Time description: `t=` with its `r=` and `z=` lines — RFC 8866 §5.9–5.11.
 * Times are NTP seconds; `0` means unbounded.
 */
interface SdpTiming {
  startTime: number;
  stopTime: number;
  repeat?: SdpRepeatTimes[];
  zoneAdjustments?: SdpTimeZoneAdjustment[];
}

/** `k=<method>[:<encryption key>]` — RFC 8866 §5.12 (obsolete) */
interface SdpEncryptionKey {
  method: 'clear' | 'base64' | 'uri' | 'prompt' | (string & {});
  encryptionKey?: string;
}

/** `b=<bwtype>:<bandwidth>` — RFC 8866 §5.8, RFC 3890 (TIAS) */
interface SdpBandwidthInformation {
  /** `CT`, `AS`, `TIAS`, `RS`, `RR`, … */
  bwtype: string;
  /** Kilobits per second for CT/AS, bits per second for TIAS */
  bandwidth: number;
}

/** `c=<nettype> <addrtype> <connection-address>` — RFC 8866 §5.7 */
interface SdpConnectionInformation {
  netType: string;
  addrType: string;
  /** `<address>[/<ttl>][/<number of addresses>]`, verbatim */
  connectionAddress: string;
}

/** `a=group:<semantics> <mid>…` — RFC 5888, RFC 9143 (BUNDLE) */
interface SdpGroup {
  semantics: 'LS' | 'FID' | 'SRF' | 'ANAT' | 'FEC' | 'DDP' | 'BUNDLE' | (string & {});
  mids: string[];
}

/** An RTP payload type with everything attached to it */
interface SdpCodec {
  payloadType: number;
  /** From `a=rtpmap`; absent for static payload types sent without rtpmap */
  encodingName?: string;
  clockRate?: number;
  /** Number of audio channels, if present in rtpmap */
  encodingParameters?: number;
  /**
   * `a=fmtp` parameters in their original order. A parameter without `=` (for example
   * `0-16` for telephone-event) has the value `null`.
   */
  parameters?: Record<string, string | null>;
  /** `a=rtcp-fb` values, e.g. `nack`, `nack pli`, `transport-cc` — RFC 4585 */
  rtcpFeedback?: string[];
}

interface SdpMediaSection extends SdpCommonAttributes {
  /** `m=` media type */
  type: 'audio' | 'video' | 'text' | 'application' | 'message' | (string & {});
  port: number;
  /** `<port>/<number of ports>` */
  numberOfPorts?: number;
  /** Transport protocol, e.g. `UDP/TLS/RTP/SAVPF`, `RTP/AVP`, `UDP/DTLS/SCTP` */
  proto: string;
  /**
   * The `<fmt>` list of the `m=` line for non-RTP protocols (e.g. `webrtc-datachannel`).
   * For RTP protocols the list is derived from {@link codecs} and this field is absent.
   */
  formats?: string[];
  /** RTP payload types in `m=` line order. Present for RTP protocols only. */
  codecs?: SdpCodec[];
  /** `a=rtcp-fb:*` values that apply to every payload type */
  rtcpFeedbackWildcard?: string[];
  /** `i=` media title */
  information?: string;
  connectionInformation?: SdpConnectionInformation;
  bandwidths?: SdpBandwidthInformation[];
  encryptionKey?: SdpEncryptionKey;
  /** `a=mid` — RFC 5888 §4 */
  mid?: string;
  /** `a=candidate` — RFC 8839 §5.1 */
  candidates?: SdpCandidate[];
  /** `a=msid` — RFC 8830. Several lines are allowed. */
  msid?: SdpMsid[];
  /** `a=ssrc` — RFC 5576 */
  ssrcs?: SdpSsrc[];
  /** `a=ssrc-group` — RFC 5576 */
  ssrcGroups?: SdpSsrcGroup[];
}

interface Sdp extends SdpCommonAttributes {
  /** `v=` — always 0 */
  protocolVersion: number;
  origin: SdpOrigin;
  /** `s=`; a single space if the session has no meaningful name */
  sessionName: string;
  /** `i=` */
  sessionInformation?: string;
  /** `u=` */
  uri?: string;
  /** `e=` lines */
  emailAddresses?: string[];
  /** `p=` lines */
  phoneNumbers?: string[];
  connectionInformation?: SdpConnectionInformation;
  bandwidths?: SdpBandwidthInformation[];
  /** One or more time descriptions */
  timing: SdpTiming[];
  encryptionKey?: SdpEncryptionKey;
  /** `a=group` */
  group?: SdpGroup[];
  /** `a=ice-lite` — RFC 8839 §5.3 */
  iceLite?: boolean;
  media: SdpMediaSection[];
}

interface SdpPair {
  offer: Sdp;
  answer: Sdp;
}

export {
  Sdp,
  SdpPair,
  SdpCodec,
  SdpGroup,
  SdpSetup,
  SdpCandidate,
  SdpMsid,
  SdpSsrc,
  SdpSsrcGroup,
  SdpExtmap,
  SdpOrigin,
  SdpTiming,
  SdpDirection,
  SdpFingerprint,
  SdpRepeatTimes,
  SdpMediaSection,
  SdpEncryptionKey,
  SdpCommonAttributes,
  SdpGenericAttribute,
  SdpTimeZoneAdjustment,
  SdpBandwidthInformation,
  SdpConnectionInformation,
}

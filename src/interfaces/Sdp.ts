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

/** `a=rid:<rid-id> <send|recv> [pt=<fmt>,...;][<restriction>;...]` — RFC 8851 §10 */
interface SdpRid {
  id: string;
  direction: 'send' | 'recv';
  /** `pt=` list */
  payloadTypes?: number[];
  /**
   * Restrictions in their original order, e.g. `max-width`, `max-fps`, `depend`.
   * A restriction without `=` maps to null.
   */
  restrictions?: Record<string, string | null>;
}

/** One rid of an `a=simulcast` stream — RFC 8853 §5.1 */
interface SdpSimulcastRid {
  rid: string;
  /** Prefixed with `~`: initially paused (RFC 7728) */
  paused?: boolean;
}

/**
 * Simulcast streams of one direction. Every element is one simulcast stream (`;`-separated),
 * listing its alternative rids (`,`-separated).
 */
type SdpSimulcastStreams = SdpSimulcastRid[][];

/** `a=simulcast` — RFC 8853 §5.1 */
interface SdpSimulcast {
  send?: SdpSimulcastStreams;
  recv?: SdpSimulcastStreams;
}

/** `a=rtcp:<port> [<nettype> <addrtype> <connection-address>]` — RFC 3605 */
interface SdpRtcp {
  port: number;
  netType?: string;
  addrType?: string;
  address?: string;
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
  /** `a=extmap-allow-mixed` — RFC 8285 §6 */
  extmapAllowMixed?: boolean;
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
  /** `a=rtcp` — RFC 3605 */
  rtcp?: SdpRtcp;
  /** `a=rtcp-mux` — RFC 5761 */
  rtcpMux?: boolean;
  /** `a=rtcp-rsize` — RFC 5506 */
  rtcpRsize?: boolean;
  /** `a=sctp-port` — RFC 8841 §5 */
  sctpPort?: number;
  /** `a=max-message-size` — RFC 8841 §6 */
  maxMessageSize?: number;
  /** `a=candidate` — RFC 8839 §5.1 */
  candidates?: SdpCandidate[];
  /** `a=msid` — RFC 8830. Several lines are allowed. */
  msid?: SdpMsid[];
  /** `a=ssrc` — RFC 5576 */
  ssrcs?: SdpSsrc[];
  /** `a=ssrc-group` — RFC 5576 */
  ssrcGroups?: SdpSsrcGroup[];
  /** `a=rid` — RFC 8851 */
  rids?: SdpRid[];
  /** `a=simulcast` — RFC 8853 */
  simulcast?: SdpSimulcast;
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

/**
 * A media section produced by `sdpReader.parseLenient`. Same as {@link SdpMediaSection},
 * except that fields read from a malformed `m=` line may be missing.
 *
 * For a malformed `m=` line of an RTP protocol, payload types that cannot be read
 * (non-numeric or outside 0-127) are kept as text in `formats`, next to the readable
 * ones in `codecs`. The writer uses `codecs` when present, so such `formats` are not
 * written back.
 */
interface SdpLenientMediaSection extends Omit<SdpMediaSection, 'port' | 'proto'> {
  /** Undefined when the port of the `m=` line cannot be read. Never 0 in that case: port 0 means a rejected stream. */
  port?: number;
  /** Undefined when the `m=` line has no `<proto>` field */
  proto?: string;
}

/**
 * The model produced by `sdpReader.parseLenient`. Same as {@link Sdp}, except that the
 * mandatory fields are undefined when their line is missing or cannot be read.
 * Use `sdpReader.isComplete` to narrow it to {@link Sdp}; it also requires every media
 * section to have a format, so that the writer accepts the result.
 */
interface SdpLenient extends Omit<Sdp, 'protocolVersion' | 'origin' | 'sessionName' | 'timing' | 'media'> {
  /** `v=`; undefined when missing or not a number. May differ from 0 when `v=` says so. */
  protocolVersion?: number;
  origin?: SdpOrigin;
  sessionName?: string;
  timing?: SdpTiming[];
  media: SdpLenientMediaSection[];
}

/** Stable codes of {@link SdpParseWarning} */
type SdpParseWarningCode =
  | 'empty-line'
  | 'malformed-line'
  | 'unknown-line-type'
  | 'missing-version'
  | 'version-not-first'
  | 'unsupported-version'
  | 'wrong-scope'
  | 'out-of-order'
  | 'duplicate-line'
  | 'malformed-value'
  | 'malformed-media'
  | 'malformed-attribute'
  | 'duplicate-attribute'
  | 'missing-mandatory-line'
  | 'trailing-whitespace';

/** What `parseLenient` did with the offending line */
type SdpParseWarningAction = 'kept' | 'skipped' | 'generic-attribute' | 'first-kept' | 'repaired';

/** A deviation from RFC 8866 found by `sdpReader.parseLenient` */
interface SdpParseWarning {
  code: SdpParseWarningCode;
  /** Human-readable; the same text that `sdpReader.parse` throws for the same problem */
  reason: string;
  /** 1-based line number, or 0 when the warning is not tied to a line (a missing line) */
  lineNumber: number;
  /** The offending line as it appears in the input, without the terminator; '' when `lineNumber` is 0 */
  line: string;
  action: SdpParseWarningAction;
}

/** The result of `sdpReader.parseLenient` */
interface SdpLenientResult {
  sdp: SdpLenient;
  /** In line order; warnings with `lineNumber` 0 come last, in the order v, o, s, t */
  warnings: SdpParseWarning[];
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
  SdpRid,
  SdpRtcp,
  SdpSimulcast,
  SdpSimulcastRid,
  SdpSimulcastStreams,
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
  SdpLenient,
  SdpLenientMediaSection,
  SdpLenientResult,
  SdpParseWarning,
  SdpParseWarningCode,
  SdpParseWarningAction,
}

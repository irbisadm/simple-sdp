import {
  Sdp,
  SdpBandwidthInformation,
  SdpCandidate,
  SdpCodec,
  SdpCommonAttributes,
  SdpConnectionInformation,
  SdpEncryptionKey,
  SdpLenient,
  SdpLenientMediaSection,
  SdpMediaSection,
  SdpRid,
  SdpSimulcast,
  SdpTiming,
} from "../../interfaces/Sdp";

const CRLF = '\r\n';

const connection = (c: SdpConnectionInformation) => `c=${c.netType} ${c.addrType} ${c.connectionAddress}`;
const bandwidth = (b: SdpBandwidthInformation) => `b=${b.bwtype}:${b.bandwidth}`;
const key = (k: SdpEncryptionKey) => `k=${k.method}${k.encryptionKey !== undefined ? `:${k.encryptionKey}` : ''}`;
const params = (p: Record<string, string | null>) =>
  Object.entries(p).map(([name, value]) => value === null ? name : `${name}=${value}`).join(';');

const timing = (t: SdpTiming): string[] => [
  `t=${t.startTime} ${t.stopTime}`,
  ...(t.repeat ?? []).map(r => `r=${[r.repeatInterval, r.activeDuration, ...r.offsets].join(' ')}`),
  ...(t.zoneAdjustments?.length
    ? [`z=${t.zoneAdjustments.map(z => `${z.adjustmentTime} ${z.offset}`).join(' ')}`]
    : []),
];

const candidate = (c: SdpCandidate): string => [
  c.foundation, c.component, c.transport, c.priority, c.address, c.port, 'typ', c.type,
  ...(c.relatedAddress !== undefined ? ['raddr', c.relatedAddress] : []),
  ...(c.relatedPort !== undefined ? ['rport', c.relatedPort] : []),
  ...(c.tcpType !== undefined ? ['tcptype', c.tcpType] : []),
  ...Object.entries(c.extensions ?? {}).flat(),
].join(' ');

const codec = (c: SdpCodec): string[] => [
  ...(c.encodingName !== undefined
    ? [`a=rtpmap:${c.payloadType} ${c.encodingName}/${c.clockRate}${c.encodingParameters !== undefined ? `/${c.encodingParameters}` : ''}`]
    : []),
  ...(c.rtcpFeedback ?? []).map(fb => `a=rtcp-fb:${c.payloadType} ${fb}`),
  ...(c.parameters !== undefined ? [`a=fmtp:${c.payloadType} ${params(c.parameters)}`] : []),
];

const rid = (r: SdpRid): string => {
  const list = [
    ...(r.payloadTypes ? [`pt=${r.payloadTypes.join(',')}`] : []),
    ...(r.restrictions && Object.keys(r.restrictions).length ? [params(r.restrictions)] : []),
  ].join(';');
  return `a=rid:${r.id} ${r.direction}${list ? ` ${list}` : ''}`;
};

const simulcast = (s: SdpSimulcast): string => `a=simulcast:${(['send', 'recv'] as const)
  .filter(dir => s[dir])
  .map(dir => `${dir} ${s[dir]!.map(alternatives => alternatives.map(r => `${r.paused ? '~' : ''}${r.rid}`).join(',')).join(';')}`)
  .join(' ')}`;

const flag = (value: boolean | undefined, name: string) => value ? [`a=${name}`] : [];

/** ICE and DTLS attributes, common to session and media level */
const transport = (s: SdpCommonAttributes): string[] => [
  ...(s.iceUfrag !== undefined ? [`a=ice-ufrag:${s.iceUfrag}`] : []),
  ...(s.icePwd !== undefined ? [`a=ice-pwd:${s.icePwd}`] : []),
  ...(s.iceOptions ? [`a=ice-options:${s.iceOptions.join(' ')}`] : []),
  ...(s.fingerprints ?? []).map(f => `a=fingerprint:${f.hashFunction} ${f.fingerprint}`),
  ...(s.setup !== undefined ? [`a=setup:${s.setup}`] : []),
];

const extmap = (s: SdpCommonAttributes): string[] => [
  ...(s.extmap ?? []).map(e =>
    `a=extmap:${e.id}${e.direction ? `/${e.direction}` : ''} ${e.uri}${e.attributes !== undefined ? ` ${e.attributes}` : ''}`),
  ...flag(s.extmapAllowMixed, 'extmap-allow-mixed'),
];

const generic = (s: SdpCommonAttributes): string[] =>
  (s.attributes ?? []).map(a => a.value === undefined ? `a=${a.name}` : `a=${a.name}:${a.value}`);

const media = (m: SdpMediaSection | SdpLenientMediaSection): string[] => {
  if (m.port === undefined) {
    throw new Error(`media section "${m.type}" has no port`);
  }
  if (m.proto === undefined) {
    throw new Error(`media section "${m.type}" has no proto`);
  }
  const formats = m.codecs ? m.codecs.map(c => String(c.payloadType)) : m.formats;
  if (!formats || formats.length === 0) {
    throw new Error(`media section "${m.type}" has neither codecs nor formats`);
  }
  return [
    `m=${m.type} ${m.port}${m.numberOfPorts !== undefined ? `/${m.numberOfPorts}` : ''} ${m.proto} ${formats.join(' ')}`,
    ...(m.information !== undefined ? [`i=${m.information}`] : []),
    ...(m.connectionInformation ? [connection(m.connectionInformation)] : []),
    ...(m.bandwidths ?? []).map(bandwidth),
    ...(m.encryptionKey ? [key(m.encryptionKey)] : []),
    ...(m.rtcp
      ? [`a=rtcp:${m.rtcp.port}${m.rtcp.netType !== undefined ? ` ${m.rtcp.netType} ${m.rtcp.addrType} ${m.rtcp.address}` : ''}`]
      : []),
    ...transport(m),
    ...(m.mid !== undefined ? [`a=mid:${m.mid}`] : []),
    ...extmap(m),
    ...(m.direction ? [`a=${m.direction}`] : []),
    ...(m.msid ?? []).map(id => `a=msid:${id.streamId}${id.trackId !== undefined ? ` ${id.trackId}` : ''}`),
    ...flag(m.rtcpMux, 'rtcp-mux'),
    ...flag(m.rtcpRsize, 'rtcp-rsize'),
    ...(m.codecs ?? []).flatMap(codec),
    ...(m.rtcpFeedbackWildcard ?? []).map(fb => `a=rtcp-fb:* ${fb}`),
    ...(m.sctpPort !== undefined ? [`a=sctp-port:${m.sctpPort}`] : []),
    ...(m.maxMessageSize !== undefined ? [`a=max-message-size:${m.maxMessageSize}`] : []),
    ...(m.rids ?? []).map(rid),
    ...(m.simulcast ? [simulcast(m.simulcast)] : []),
    ...(m.ssrcGroups ?? []).map(g => `a=ssrc-group:${[g.semantics, ...g.ssrcs].join(' ')}`),
    ...(m.ssrcs ?? []).flatMap(s => Object.entries(s.attributes)
      .map(([name, value]) => `a=ssrc:${s.id} ${name}${value === null ? '' : `:${value}`}`)),
    ...(m.candidates ?? []).map(c => `a=candidate:${candidate(c)}`),
    ...flag(m.endOfCandidates, 'end-of-candidates'),
    ...generic(m),
  ];
};

/**
 * Serializes a session description.
 *
 * Lines are emitted in RFC 8866 §5 order and terminated by CRLF. Within a section the
 * attributes are emitted in a fixed order (see README, "Writing"), followed by the generic
 * `attributes` in their stored order. Times are written in seconds.
 *
 * Also accepts the model of `sdpReader.parseLenient`, with the same rules.
 *
 * @throws Error if a mandatory field is missing (origin, timing, the port or proto of a
 *   media section, …)
 */
const write = (sdp: Sdp | SdpLenient): string => {
  const {origin: o} = sdp;
  if (!o) {
    throw new Error('origin (o=) is required');
  }
  if (!sdp.timing?.length) {
    throw new Error('at least one timing (t=) entry is required');
  }
  const lines = [
    `v=${sdp.protocolVersion ?? 0}`,
    `o=${o.username} ${o.sessId} ${o.sessVersion} ${o.netType} ${o.addrType} ${o.unicastAddress}`,
    `s=${sdp.sessionName ?? '-'}`,
    ...(sdp.sessionInformation !== undefined ? [`i=${sdp.sessionInformation}`] : []),
    ...(sdp.uri !== undefined ? [`u=${sdp.uri}`] : []),
    ...(sdp.emailAddresses ?? []).map(e => `e=${e}`),
    ...(sdp.phoneNumbers ?? []).map(p => `p=${p}`),
    ...(sdp.connectionInformation ? [connection(sdp.connectionInformation)] : []),
    ...(sdp.bandwidths ?? []).map(bandwidth),
    ...sdp.timing.flatMap(timing),
    ...(sdp.encryptionKey ? [key(sdp.encryptionKey)] : []),
    ...(sdp.group ?? []).map(g => `a=group:${[g.semantics, ...g.mids].join(' ')}`),
    ...flag(sdp.iceLite, 'ice-lite'),
    ...transport(sdp),
    ...extmap(sdp),
    ...(sdp.direction ? [`a=${sdp.direction}`] : []),
    ...flag(sdp.endOfCandidates, 'end-of-candidates'),
    ...generic(sdp),
    ...(sdp.media ?? []).flatMap(media),
  ];
  return lines.join(CRLF) + CRLF;
}

const sdpWriter = {
  write
}

export {sdpWriter}

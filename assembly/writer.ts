// Port of src/services/sdp-writer/index.ts.

import {
  Bandwidth, Candidate, Codec, CommonAttributes, Connection, EncryptionKey, MediaSection, Rid, Sdp, Simulcast, SimulcastRid,
  Timing,
} from './model';
import {fail, fmtNum, joinNums, Lines, Params, present, truthy} from './util';


function connection(c: Connection): string {
  return `c=${c.netType} ${c.addrType} ${c.connectionAddress}`;
}

function bandwidth(b: Bandwidth): string {
  return `b=${b.bwtype}:${fmtNum(b.bandwidth)}`;
}

function key(k: EncryptionKey): string {
  const encryptionKey = k.encryptionKey;
  return `k=${k.method}${encryptionKey !== null ? ':' + encryptionKey : ''}`;
}

function params(p: Params): string {
  const order = p.order();
  const parts = new Array<string>(order.length);
  for (let i = 0; i < order.length; i++) {
    const value = p.values[order[i]];
    parts[i] = value === null ? p.keys[order[i]] : `${p.keys[order[i]]}=${value}`;
  }
  return parts.join(';');
}

function timing(lines: Lines, t: Timing): void {
  lines.push(`t=${fmtNum(t.startTime)} ${fmtNum(t.stopTime)}`);
  const repeat = t.repeat;
  if (repeat !== null) {
    for (let i = 0; i < repeat.length; i++) {
      const r = repeat[i];
      const values: f64[] = [r.repeatInterval, r.activeDuration];
      lines.push(`r=${joinNums(values.concat(r.offsets), ' ')}`);
    }
  }
  const zone = t.zoneAdjustments;
  if (zone !== null && zone.length > 0) {
    const parts = new Array<string>(zone.length);
    for (let i = 0; i < zone.length; i++) {
      parts[i] = `${fmtNum(zone[i].adjustmentTime)} ${fmtNum(zone[i].offset)}`;
    }
    lines.push(`z=${parts.join(' ')}`);
  }
}

function candidate(c: Candidate): string {
  const parts: string[] = [
    c.foundation, fmtNum(c.component), c.transport, fmtNum(c.priority), c.address, fmtNum(c.port), 'typ', c.type,
  ];
  const relatedAddress = c.relatedAddress;
  if (relatedAddress !== null) {
    parts.push('raddr');
    parts.push(relatedAddress);
  }
  if (present(c.relatedPort)) {
    parts.push('rport');
    parts.push(fmtNum(c.relatedPort));
  }
  const tcpType = c.tcpType;
  if (tcpType !== null) {
    parts.push('tcptype');
    parts.push(tcpType);
  }
  const extensions = c.extensions;
  if (extensions !== null) {
    const order = extensions.order();
    for (let i = 0; i < order.length; i++) {
      parts.push(extensions.keys[order[i]]);
      const value = extensions.values[order[i]];
      parts.push(value === null ? '' : value); // [null].join() is ''
    }
  }
  return parts.join(' ');
}

function codec(lines: Lines, c: Codec): void {
  const pt = fmtNum(c.payloadType);
  const encodingName = c.encodingName;
  if (encodingName !== null) {
    const channels = present(c.encodingParameters) ? '/' + fmtNum(c.encodingParameters) : '';
    lines.push(`a=rtpmap:${pt} ${encodingName}/${clockRate(c)}${channels}`);
  }
  const feedback = c.rtcpFeedback;
  if (feedback !== null) {
    for (let i = 0; i < feedback.length; i++) {
      lines.push(`a=rtcp-fb:${pt} ${feedback[i]}`);
    }
  }
  const parameters = c.parameters;
  if (parameters !== null) {
    lines.push(`a=fmtp:${pt} ${params(parameters)}`);
  }
}

/** `${undefined}` is "undefined" in the TypeScript writer */
function clockRate(c: Codec): string {
  return present(c.clockRate) ? fmtNum(c.clockRate) : 'undefined';
}

function rid(r: Rid): string {
  const list: string[] = [];
  const payloadTypes = r.payloadTypes;
  if (payloadTypes !== null) {
    list.push(`pt=${joinNums(payloadTypes, ',')}`);
  }
  const restrictions = r.restrictions;
  if (restrictions !== null && restrictions.size > 0) {
    list.push(params(restrictions));
  }
  const joined = list.join(';');
  return `a=rid:${r.id} ${r.direction}${joined.length > 0 ? ' ' + joined : ''}`;
}

function streams(dir: string, list: Array<Array<SimulcastRid>>): string {
  const parts = new Array<string>(list.length);
  for (let i = 0; i < list.length; i++) {
    const alternatives = list[i];
    const rids = new Array<string>(alternatives.length);
    for (let j = 0; j < alternatives.length; j++) {
      rids[j] = (alternatives[j].paused ? '~' : '') + alternatives[j].rid;
    }
    parts[i] = rids.join(',');
  }
  return `${dir} ${parts.join(';')}`;
}

function simulcast(s: Simulcast): string {
  const parts: string[] = [];
  const send = s.send;
  if (send !== null) {
    parts.push(streams('send', send));
  }
  const recv = s.recv;
  if (recv !== null) {
    parts.push(streams('recv', recv));
  }
  return `a=simulcast:${parts.join(' ')}`;
}

function flag(lines: Lines, value: bool, name: string): void {
  if (value) {
    lines.push(`a=${name}`);
  }
}

/** ICE and DTLS attributes, common to session and media level */
function transport(lines: Lines, s: CommonAttributes): void {
  const ufrag = s.iceUfrag;
  if (ufrag !== null) {
    lines.push(`a=ice-ufrag:${ufrag}`);
  }
  const pwd = s.icePwd;
  if (pwd !== null) {
    lines.push(`a=ice-pwd:${pwd}`);
  }
  const options = s.iceOptions;
  if (options !== null) {
    lines.push(`a=ice-options:${options.join(' ')}`);
  }
  const fingerprints = s.fingerprints;
  if (fingerprints !== null) {
    for (let i = 0; i < fingerprints.length; i++) {
      lines.push(`a=fingerprint:${fingerprints[i].hashFunction} ${fingerprints[i].fingerprint}`);
    }
  }
  const setup = s.setup;
  if (setup !== null) {
    lines.push(`a=setup:${setup}`);
  }
}

function extmap(lines: Lines, s: CommonAttributes): void {
  const list = s.extmap;
  if (list !== null) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const direction = e.direction;
      const attributes = e.attributes;
      lines.push(`a=extmap:${fmtNum(e.id)}${truthy(direction) ? '/' + direction! : ''} ${e.uri}${attributes !== null ? ' ' + attributes : ''}`);
    }
  }
  flag(lines, s.extmapAllowMixed, 'extmap-allow-mixed');
}

function generic(lines: Lines, s: CommonAttributes): void {
  const list = s.attributes;
  if (list !== null) {
    for (let i = 0; i < list.length; i++) {
      const value = list[i].value;
      lines.push(value === null ? `a=${list[i].name}` : `a=${list[i].name}:${value}`);
    }
  }
}

function pushAll(lines: Lines, prefix: string, list: string[] | null): void {
  if (list !== null) {
    for (let i = 0; i < list.length; i++) {
      lines.push(prefix + list[i]);
    }
  }
}

function media(lines: Lines, m: MediaSection): bool {
  if (!present(m.port)) {
    fail(`media section "${m.type}" has no port`);
    return false;
  }
  const proto = m.proto;
  if (proto === null) {
    fail(`media section "${m.type}" has no proto`);
    return false;
  }
  let formats: string[] | null = m.formats;
  const codecs = m.codecs;
  if (codecs !== null) {
    formats = new Array<string>(codecs.length);
    for (let i = 0; i < codecs.length; i++) {
      formats[i] = fmtNum(codecs[i].payloadType);
    }
  }
  if (formats === null || formats.length == 0) {
    fail(`media section "${m.type}" has neither codecs nor formats`);
    return false;
  }
  const ports = present(m.numberOfPorts) ? '/' + fmtNum(m.numberOfPorts) : '';
  lines.push(`m=${m.type} ${fmtNum(m.port)}${ports} ${proto} ${formats.join(' ')}`);
  const information = m.information;
  if (information !== null) {
    lines.push(`i=${information}`);
  }
  const conn = m.connectionInformation;
  if (conn !== null) {
    lines.push(connection(conn));
  }
  const bandwidths = m.bandwidths;
  if (bandwidths !== null) {
    for (let i = 0; i < bandwidths.length; i++) {
      lines.push(bandwidth(bandwidths[i]));
    }
  }
  const encryptionKey = m.encryptionKey;
  if (encryptionKey !== null) {
    lines.push(key(encryptionKey));
  }
  const rtcp = m.rtcp;
  if (rtcp !== null) {
    const netType = rtcp.netType;
    const address = netType !== null ? ` ${netType} ${nullable(rtcp.addrType)} ${nullable(rtcp.address)}` : '';
    lines.push(`a=rtcp:${fmtNum(rtcp.port)}${address}`);
  }
  transport(lines, m);
  const mid = m.mid;
  if (mid !== null) {
    lines.push(`a=mid:${mid}`);
  }
  extmap(lines, m);
  const direction = m.direction;
  if (truthy(direction)) {
    lines.push(`a=${direction!}`);
  }
  const msid = m.msid;
  if (msid !== null) {
    for (let i = 0; i < msid.length; i++) {
      const trackId = msid[i].trackId;
      lines.push(`a=msid:${msid[i].streamId}${trackId !== null ? ' ' + trackId : ''}`);
    }
  }
  flag(lines, m.rtcpMux, 'rtcp-mux');
  flag(lines, m.rtcpRsize, 'rtcp-rsize');
  if (codecs !== null) {
    for (let i = 0; i < codecs.length; i++) {
      codec(lines, codecs[i]);
    }
  }
  pushAll(lines, 'a=rtcp-fb:* ', m.rtcpFeedbackWildcard);
  if (present(m.sctpPort)) {
    lines.push(`a=sctp-port:${fmtNum(m.sctpPort)}`);
  }
  if (present(m.maxMessageSize)) {
    lines.push(`a=max-message-size:${fmtNum(m.maxMessageSize)}`);
  }
  const rids = m.rids;
  if (rids !== null) {
    for (let i = 0; i < rids.length; i++) {
      lines.push(rid(rids[i]));
    }
  }
  const sc = m.simulcast;
  if (sc !== null) {
    lines.push(simulcast(sc));
  }
  const groups = m.ssrcGroups;
  if (groups !== null) {
    for (let i = 0; i < groups.length; i++) {
      const ids = joinNums(groups[i].ssrcs, ' ');
      lines.push(`a=ssrc-group:${groups[i].semantics}${groups[i].ssrcs.length > 0 ? ' ' + ids : ''}`);
    }
  }
  const ssrcs = m.ssrcs;
  if (ssrcs !== null) {
    for (let i = 0; i < ssrcs.length; i++) {
      const s = ssrcs[i];
      const order = s.attributes.order();
      for (let j = 0; j < order.length; j++) {
        const value = s.attributes.values[order[j]];
        lines.push(`a=ssrc:${fmtNum(s.id)} ${s.attributes.keys[order[j]]}${value === null ? '' : ':' + value}`);
      }
    }
  }
  const candidates = m.candidates;
  if (candidates !== null) {
    for (let i = 0; i < candidates.length; i++) {
      lines.push(`a=candidate:${candidate(candidates[i])}`);
    }
  }
  flag(lines, m.endOfCandidates, 'end-of-candidates');
  generic(lines, m);
  return true;
}

function nullable(s: string | null): string {
  return s === null ? 'undefined' : s;
}

/**
 * Serializes a session description: RFC 8866 §5 line order, CRLF, times in seconds.
 * Returns null on error (missing origin or timing, a media section without formats);
 * the reason is reported through fail().
 */
export function write(sdp: Sdp): string | null {
  const o = sdp.origin;
  if (o === null) {
    fail('origin (o=) is required');
    return null;
  }
  const timings = sdp.timing;
  if (timings === null || timings.length == 0) {
    fail('at least one timing (t=) entry is required');
    return null;
  }
  const lines = new Lines();
  lines.push(`v=${present(sdp.protocolVersion) ? fmtNum(sdp.protocolVersion) : '0'}`);
  lines.push(`o=${o.username} ${o.sessId} ${o.sessVersion} ${o.netType} ${o.addrType} ${o.unicastAddress}`);
  const sessionName = sdp.sessionName;
  lines.push(`s=${sessionName !== null ? sessionName : '-'}`);
  const information = sdp.sessionInformation;
  if (information !== null) {
    lines.push(`i=${information}`);
  }
  const uri = sdp.uri;
  if (uri !== null) {
    lines.push(`u=${uri}`);
  }
  pushAll(lines, 'e=', sdp.emailAddresses);
  pushAll(lines, 'p=', sdp.phoneNumbers);
  const conn = sdp.connectionInformation;
  if (conn !== null) {
    lines.push(connection(conn));
  }
  const bandwidths = sdp.bandwidths;
  if (bandwidths !== null) {
    for (let i = 0; i < bandwidths.length; i++) {
      lines.push(bandwidth(bandwidths[i]));
    }
  }
  for (let i = 0; i < timings.length; i++) {
    timing(lines, timings[i]);
  }
  const encryptionKey = sdp.encryptionKey;
  if (encryptionKey !== null) {
    lines.push(key(encryptionKey));
  }
  const groups = sdp.group;
  if (groups !== null) {
    for (let i = 0; i < groups.length; i++) {
      const mids = groups[i].mids;
      lines.push(`a=group:${groups[i].semantics}${mids.length > 0 ? ' ' + mids.join(' ') : ''}`);
    }
  }
  flag(lines, sdp.iceLite, 'ice-lite');
  transport(lines, sdp);
  extmap(lines, sdp);
  const direction = sdp.direction;
  if (truthy(direction)) {
    lines.push(`a=${direction!}`);
  }
  flag(lines, sdp.endOfCandidates, 'end-of-candidates');
  generic(lines, sdp);
  for (let i = 0; i < sdp.media.length; i++) {
    if (!media(lines, sdp.media[i])) {
      return null;
    }
  }
  return lines.toString();
}

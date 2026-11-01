// `a=` lines — port of src/services/sdp-reader/parsers/a-line.parser/*.ts.

import {
  Candidate, Codec, CommonAttributes, Extmap, Fingerprint, GenericAttribute, Group, MediaSection, Msid, Rid, Rtcp, Sdp,
  Simulcast, SimulcastRid, Ssrc, SsrcGroup,
} from '../model';
import {fail, failed, fmtNum, Params, present, splitFirst, stringToInt, truthy} from '../util';

const DIRECTIONS: string[] = ['sendrecv', 'sendonly', 'recvonly', 'inactive'];
const SETUP: string[] = ['active', 'passive', 'actpass', 'holdconn'];

// ---------------------------------------------------------------------------
// helpers.ts
// ---------------------------------------------------------------------------

/** Fails if the value is missing or empty */
function required(value: string | null, syntax: string): string {
  if (value === null || value.length == 0) {
    fail(`expected a value: ${syntax}`);
    return '';
  }
  return value;
}

/** Fails if a value is given for a flag attribute */
function flag(value: string | null): bool {
  if (value !== null) {
    fail('flag attribute must not have a value');
    return false;
  }
  return true;
}

function duplicate(name: string): void {
  fail(`duplicate a=${name}`);
}

/** The codec referenced by the payload type, or null if it is not in the m= line */
function findCodec(section: MediaSection, pt: string): Codec | null {
  const payloadType = stringToInt(pt, 'payload type');
  if (failed()) {
    return null;
  }
  const codecs = section.codecs;
  if (codecs === null) {
    return null;
  }
  for (let i = 0; i < codecs.length; i++) {
    if (codecs[i].payloadType == payloadType) {
      return codecs[i];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// fmtp.parser.ts
// ---------------------------------------------------------------------------

/** `;`-separated `name=value` pairs; whitespace around `;` is dropped; no `=` maps to null */
export function fmtpParametersParser(params: string): Params {
  const result = new Params();
  const raw = params.split(';');
  for (let i = 0; i < raw.length; i++) {
    const param = raw[i].trim();
    if (param.length == 0) {
      continue;
    }
    const idx = param.indexOf('=');
    if (idx == -1) {
      result.set(param, null);
    } else {
      result.set(param.slice(0, idx), param.slice(idx + 1));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// rtpmap.parser.ts
// ---------------------------------------------------------------------------

function rtpmapParser(codec: Codec, encoding: string): void {
  const parts = encoding.split('/');
  if (parts[0].length == 0 || parts.length < 2 || parts.length > 3) {
    fail('expected "<payload type> <encoding name>/<clock rate>[/<encoding parameters>]"');
    return;
  }
  const clockRate = stringToInt(parts[1], 'clock rate');
  if (failed()) {
    return;
  }
  let encodingParameters: f64 = NaN;
  if (parts.length == 3) {
    encodingParameters = stringToInt(parts[2], 'encoding parameters');
    if (failed()) {
      return;
    }
  }
  codec.encodingName = parts[0];
  codec.clockRate = clockRate;
  codec.encodingParameters = encodingParameters;
}

// ---------------------------------------------------------------------------
// candidate.parser.ts
// ---------------------------------------------------------------------------

const CANDIDATE_SYNTAX = '"<foundation> <component> <transport> <priority> <address> <port> typ <type> [raddr <addr>] [rport <port>] *(<ext-name> <ext-value>)"';

export function candidateParser(value: string): Candidate | null {
  const parts = value.split(' ');
  if (parts.length < 8 || parts[6] != 'typ' || parts.length % 2 != 0) {
    fail(`expected ${CANDIDATE_SYNTAX}`);
    return null;
  }
  const candidate = new Candidate();
  candidate.foundation = parts[0];
  candidate.component = stringToInt(parts[1], 'component id');
  if (failed()) {
    return null;
  }
  candidate.transport = parts[2];
  candidate.priority = stringToInt(parts[3], 'priority');
  if (failed()) {
    return null;
  }
  candidate.address = parts[4];
  candidate.port = stringToInt(parts[5], 'port');
  if (failed()) {
    return null;
  }
  candidate.type = parts[7];
  for (let i = 8; i < parts.length; i += 2) {
    const name = parts[i];
    const val = parts[i + 1];
    if (name.length == 0 || val.length == 0) {
      fail(`expected ${CANDIDATE_SYNTAX}`);
      return null;
    }
    if (name == 'raddr') {
      candidate.relatedAddress = val;
    } else if (name == 'rport') {
      candidate.relatedPort = stringToInt(val, 'rport');
      if (failed()) {
        return null;
      }
    } else if (name == 'tcptype') {
      candidate.tcpType = val;
    } else {
      let extensions = candidate.extensions;
      if (extensions === null) {
        extensions = new Params();
        candidate.extensions = extensions;
      }
      extensions.set(name, val);
    }
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// extmap.parser.ts
// ---------------------------------------------------------------------------

export function extmapParser(value: string): Extmap | null {
  const first = splitFirst(value);
  if (!truthy(first.rest)) {
    fail('expected "<id>[/<direction>] <uri> [<attributes>]"');
    return null;
  }
  const idPart = first.head;
  const idParts = idPart.split('/');
  if (idParts.length > 2 || (idParts.length == 2 && !DIRECTIONS.includes(idParts[1]))) {
    fail(`invalid extmap id "${idPart}"`);
    return null;
  }
  const rest = splitFirst(first.rest!);
  const extmap = new Extmap();
  extmap.id = stringToInt(idParts[0], 'extmap id');
  if (failed()) {
    return null;
  }
  extmap.uri = rest.head;
  if (idParts.length == 2) {
    extmap.direction = idParts[1];
  }
  extmap.attributes = rest.rest;
  return extmap;
}

// ---------------------------------------------------------------------------
// group.parser.ts
// ---------------------------------------------------------------------------

export function groupParser(value: string): Group | null {
  const parts = value.split(' ');
  const mids = parts.slice(1);
  let emptyMid = false;
  for (let i = 0; i < mids.length; i++) {
    if (mids[i].length == 0) {
      emptyMid = true;
    }
  }
  if (parts[0].length == 0 || emptyMid) {
    fail('expected "<semantics> <mid> ..."');
    return null;
  }
  return new Group(parts[0], mids);
}

// ---------------------------------------------------------------------------
// ssrc.parser.ts
// ---------------------------------------------------------------------------

function ssrcId(value: string): f64 {
  const id = stringToInt(value, 'ssrc-id');
  if (failed()) {
    return NaN;
  }
  if (id > 4294967295.0) {
    fail(`ssrc-id ${fmtNum(id)} does not fit into 32 bits`);
    return NaN;
  }
  return id;
}

/** `a=ssrc:<ssrc-id> <attribute>[:<value>]`. Returns false (keep generic) if the source attribute repeats. */
export function ssrcParser(section: MediaSection, value: string): bool {
  const split = splitFirst(value);
  if (!truthy(split.rest)) {
    fail('expected "<ssrc-id> <attribute>[:<value>]"');
    return false;
  }
  const id = ssrcId(split.head);
  if (failed()) {
    return false;
  }
  const attribute = split.rest!;
  const idx = attribute.indexOf(':');
  const name = idx == -1 ? attribute : attribute.slice(0, idx);
  const val: string | null = idx == -1 ? null : attribute.slice(idx + 1);
  let ssrcs = section.ssrcs;
  if (ssrcs === null) {
    ssrcs = new Array<Ssrc>(0);
    section.ssrcs = ssrcs;
  }
  let ssrc: Ssrc | null = null;
  for (let i = 0; i < ssrcs.length; i++) {
    if (ssrcs[i].id == id) {
      ssrc = ssrcs[i];
      break;
    }
  }
  if (ssrc === null) {
    ssrc = new Ssrc(id, new Params());
    ssrcs.push(ssrc);
  }
  if (ssrc.attributes.has(name)) {
    return false;
  }
  ssrc.attributes.set(name, val);
  return true;
}

export function ssrcGroupParser(value: string): SsrcGroup | null {
  const parts = value.split(' ');
  if (parts[0].length == 0) {
    fail('expected "<semantics> <ssrc-id> ..."');
    return null;
  }
  const ssrcs = new Array<f64>(0);
  for (let i = 1; i < parts.length; i++) {
    ssrcs.push(ssrcId(parts[i]));
    if (failed()) {
      return null;
    }
  }
  return new SsrcGroup(parts[0], ssrcs);
}

export function msidParser(value: string): Msid | null {
  const parts = value.split(' ');
  if (parts[0].length == 0 || (parts.length > 1 && parts[1].length == 0) || parts.length > 2) {
    fail('expected "<stream id> [<track id>]"');
    return null;
  }
  return new Msid(parts[0], parts.length > 1 ? parts[1] : null);
}

// ---------------------------------------------------------------------------
// simulcast.parser.ts
// ---------------------------------------------------------------------------

/** rid-id = 1*(alpha-numeric / "-" / "_") — RFC 8851 §10 */
function isRidId(s: string): bool {
  if (s.length == 0) {
    return false;
  }
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ok = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c == 0x2d || c == 0x5f;
    if (!ok) {
      return false;
    }
  }
  return true;
}

export function ridParser(value: string): Rid | null {
  const first = splitFirst(value);
  const id = first.head;
  let direction: string | null = null;
  let params: string | null = null;
  if (truthy(first.rest)) {
    const second = splitFirst(first.rest!);
    direction = second.head;
    params = second.rest;
  }
  if (!isRidId(id) || (direction != 'send' && direction != 'recv') || (params !== null && params.length == 0)) {
    fail('expected "<rid-id> <send|recv> [<params>]"');
    return null;
  }
  const rid = new Rid();
  rid.id = id;
  rid.direction = direction!;
  if (params !== null) {
    const restrictions = fmtpParametersParser(params);
    if (restrictions.has('pt')) {
      const pt = restrictions.get('pt');
      if (!params.startsWith('pt=') || pt === null) {
        fail('"pt=" must be the first rid parameter');
        return null;
      }
      const list = pt.split(',');
      const payloadTypes = new Array<f64>(list.length);
      for (let i = 0; i < list.length; i++) {
        payloadTypes[i] = stringToInt(list[i], 'payload type');
        if (failed()) {
          return null;
        }
      }
      rid.payloadTypes = payloadTypes;
      restrictions.delete('pt');
    }
    if (restrictions.size > 0) {
      rid.restrictions = restrictions;
    }
  }
  return rid;
}

function streamsParser(list: string): Array<Array<SimulcastRid>> | null {
  const streams = list.split(';');
  const result = new Array<Array<SimulcastRid>>(0);
  for (let i = 0; i < streams.length; i++) {
    const alternatives = streams[i].split(',');
    const stream = new Array<SimulcastRid>(0);
    for (let j = 0; j < alternatives.length; j++) {
      const scId = alternatives[j];
      const paused = scId.startsWith('~');
      const rid = paused ? scId.slice(1) : scId;
      if (!isRidId(rid)) {
        fail(`invalid simulcast rid "${scId}"`);
        return null;
      }
      stream.push(new SimulcastRid(rid, paused));
    }
    result.push(stream);
  }
  return result;
}

export function simulcastParser(value: string): Simulcast | null {
  const SYNTAX = 'expected "send|recv <streams> [send|recv <streams>]"';
  const parts = value.split(' ');
  if (parts.length != 2 && parts.length != 4) {
    fail(SYNTAX);
    return null;
  }
  const simulcast = new Simulcast();
  for (let i = 0; i < parts.length; i += 2) {
    const dir = parts[i];
    if ((dir != 'send' && dir != 'recv') || (dir == 'send' ? simulcast.send !== null : simulcast.recv !== null)) {
      fail(SYNTAX);
      return null;
    }
    const streams = streamsParser(parts[i + 1]);
    if (failed()) {
      return null;
    }
    if (dir == 'send') {
      simulcast.send = streams;
    } else {
      simulcast.recv = streams;
    }
  }
  return simulcast;
}

// ---------------------------------------------------------------------------
// a-line.parser/index.ts
// ---------------------------------------------------------------------------

function pushString(list: string[] | null, value: string): string[] {
  const result = list === null ? new Array<string>(0) : list;
  result.push(value);
  return result;
}

/** Attributes valid at both levels. Returns false if the attribute is not one of them. */
function commonAttribute(section: CommonAttributes, name: string, value: string | null): bool {
  if (DIRECTIONS.includes(name)) {
    if (section.direction !== null) {
      duplicate(name);
    } else {
      section.direction = name;
    }
  } else if (name == 'ice-ufrag') {
    const ufrag = required(value, 'a=ice-ufrag:<ufrag>');
    if (failed()) {
      return true;
    }
    if (section.iceUfrag !== null) {
      duplicate(name);
    } else {
      section.iceUfrag = ufrag;
    }
  } else if (name == 'ice-pwd') {
    const pwd = required(value, 'a=ice-pwd:<password>');
    if (failed()) {
      return true;
    }
    if (section.icePwd !== null) {
      duplicate(name);
    } else {
      section.icePwd = pwd;
    }
  } else if (name == 'ice-options') {
    const options = required(value, 'a=ice-options:<option> ...');
    if (failed()) {
      return true;
    }
    if (section.iceOptions !== null) {
      duplicate(name);
    } else {
      section.iceOptions = options.split(' ');
    }
  } else if (name == 'end-of-candidates') {
    flag(value);
    if (failed()) {
      return true;
    }
    if (section.endOfCandidates) {
      duplicate(name);
    } else {
      section.endOfCandidates = true;
    }
  } else if (name == 'fingerprint') {
    const fp = required(value, 'a=fingerprint:<hash-function> <fingerprint>');
    if (failed()) {
      return true;
    }
    const split = splitFirst(fp);
    if (!truthy(split.rest) || split.rest!.includes(' ')) {
      fail('expected "a=fingerprint:<hash-function> <fingerprint>"');
      return true;
    }
    let fingerprints = section.fingerprints;
    if (fingerprints === null) {
      fingerprints = new Array<Fingerprint>(0);
      section.fingerprints = fingerprints;
    }
    fingerprints.push(new Fingerprint(split.head, split.rest!));
  } else if (name == 'setup') {
    if (value === null || !SETUP.includes(value)) {
      fail(`a=setup must be one of ${SETUP.join(', ')}`);
      return true;
    }
    if (section.setup !== null) {
      duplicate(name);
    } else {
      section.setup = value;
    }
  } else if (name == 'extmap') {
    const v = required(value, 'a=extmap:<id> <uri>');
    if (failed()) {
      return true;
    }
    const extmap = extmapParser(v);
    if (failed()) {
      return true;
    }
    let list = section.extmap;
    if (list === null) {
      list = new Array<Extmap>(0);
      section.extmap = list;
    }
    list.push(extmap!);
  } else if (name == 'extmap-allow-mixed') {
    flag(value);
    if (failed()) {
      return true;
    }
    if (section.extmapAllowMixed) {
      duplicate(name);
    } else {
      section.extmapAllowMixed = true;
    }
  } else {
    return false;
  }
  return true;
}

function sessionAttribute(sdp: Sdp, name: string, value: string | null): bool {
  if (name == 'ice-lite') {
    flag(value);
    if (failed()) {
      return true;
    }
    if (sdp.iceLite) {
      duplicate(name);
    } else {
      sdp.iceLite = true;
    }
    return true;
  }
  if (name == 'group') {
    const v = required(value, 'a=group:<semantics> <mid> ...');
    if (failed()) {
      return true;
    }
    const group = groupParser(v);
    if (failed()) {
      return true;
    }
    let groups = sdp.group;
    if (groups === null) {
      groups = new Array<Group>(0);
      sdp.group = groups;
    }
    groups.push(group!);
    return true;
  }
  return false;
}

/** Media-level attributes. Returns false if the attribute is not one of them or must be kept generic. */
function mediaAttribute(m: MediaSection, name: string, value: string | null): bool {
  if (name == 'candidate') {
    const v = required(value, 'a=candidate:<candidate>');
    if (failed()) {
      return true;
    }
    const candidate = candidateParser(v);
    if (failed()) {
      return true;
    }
    let list = m.candidates;
    if (list === null) {
      list = new Array<Candidate>(0);
      m.candidates = list;
    }
    list.push(candidate!);
  } else if (name == 'mid') {
    const mid = required(value, 'a=mid:<identification-tag>');
    if (failed()) {
      return true;
    }
    if (m.mid !== null) {
      duplicate(name);
    } else {
      m.mid = mid;
    }
  } else if (name == 'msid') {
    const v = required(value, 'a=msid:<stream id> [<track id>]');
    if (failed()) {
      return true;
    }
    const msid = msidParser(v);
    if (failed()) {
      return true;
    }
    let list = m.msid;
    if (list === null) {
      list = new Array<Msid>(0);
      m.msid = list;
    }
    list.push(msid!);
  } else if (name == 'ssrc') {
    const v = required(value, 'a=ssrc:<ssrc-id> <attribute>[:<value>]');
    if (failed()) {
      return true;
    }
    return ssrcParser(m, v);
  } else if (name == 'ssrc-group') {
    const v = required(value, 'a=ssrc-group:<semantics> <ssrc-id> ...');
    if (failed()) {
      return true;
    }
    const group = ssrcGroupParser(v);
    if (failed()) {
      return true;
    }
    let list = m.ssrcGroups;
    if (list === null) {
      list = new Array<SsrcGroup>(0);
      m.ssrcGroups = list;
    }
    list.push(group!);
  } else if (name == 'rid') {
    const v = required(value, 'a=rid:<rid-id> <send|recv>');
    if (failed()) {
      return true;
    }
    const rid = ridParser(v);
    if (failed()) {
      return true;
    }
    let list = m.rids;
    if (list === null) {
      list = new Array<Rid>(0);
      m.rids = list;
    }
    list.push(rid!);
  } else if (name == 'simulcast') {
    const v = required(value, 'a=simulcast:<send|recv> <streams>');
    if (failed()) {
      return true;
    }
    const simulcast = simulcastParser(v);
    if (failed()) {
      return true;
    }
    if (m.simulcast !== null) {
      duplicate(name);
    } else {
      m.simulcast = simulcast;
    }
  } else if (name == 'rtcp-mux') {
    flag(value);
    if (failed()) {
      return true;
    }
    if (m.rtcpMux) {
      duplicate(name);
    } else {
      m.rtcpMux = true;
    }
  } else if (name == 'rtcp-rsize') {
    flag(value);
    if (failed()) {
      return true;
    }
    if (m.rtcpRsize) {
      duplicate(name);
    } else {
      m.rtcpRsize = true;
    }
  } else if (name == 'rtcp') {
    const v = required(value, 'a=rtcp:<port> [<nettype> <addrtype> <address>]');
    if (failed()) {
      return true;
    }
    const parts = v.split(' ');
    if (parts.length != 1 && parts.length != 4) {
      fail('expected "a=rtcp:<port> [<nettype> <addrtype> <address>]"');
      return true;
    }
    const rtcp = new Rtcp();
    rtcp.port = stringToInt(parts[0], 'port');
    if (failed()) {
      return true;
    }
    if (parts.length == 4) {
      rtcp.netType = parts[1];
      rtcp.addrType = parts[2];
      rtcp.address = parts[3];
    }
    if (m.rtcp !== null) {
      duplicate(name);
    } else {
      m.rtcp = rtcp;
    }
  } else if (name == 'sctp-port') {
    const v = required(value, 'a=sctp-port:<port>');
    if (failed()) {
      return true;
    }
    const port = stringToInt(v, 'sctp-port');
    if (failed()) {
      return true;
    }
    if (present(m.sctpPort)) {
      duplicate(name);
    } else {
      m.sctpPort = port;
    }
  } else if (name == 'max-message-size') {
    const v = required(value, 'a=max-message-size:<size>');
    if (failed()) {
      return true;
    }
    const size = stringToInt(v, 'max-message-size');
    if (failed()) {
      return true;
    }
    if (present(m.maxMessageSize)) {
      duplicate(name);
    } else {
      m.maxMessageSize = size;
    }
  } else if (name == 'rtpmap') {
    const v = required(value, 'a=rtpmap:<payload type> <encoding>');
    if (failed()) {
      return true;
    }
    const split = splitFirst(v);
    if (m.codecs === null) {
      return false;
    }
    const codec = findCodec(m, split.head);
    if (failed()) {
      return true;
    }
    if (codec === null || codec.encodingName !== null) {
      return false;
    }
    const encoding = split.rest;
    rtpmapParser(codec, encoding === null ? '' : encoding);
  } else if (name == 'fmtp') {
    const v = required(value, 'a=fmtp:<format> <parameters>');
    if (failed()) {
      return true;
    }
    const split = splitFirst(v);
    if (m.codecs === null) {
      return false;
    }
    const codec = findCodec(m, split.head);
    if (failed()) {
      return true;
    }
    const params = split.rest;
    if (codec === null || codec.parameters !== null || params === null) {
      return false;
    }
    codec.parameters = fmtpParametersParser(params);
  } else if (name == 'rtcp-fb') {
    const v = required(value, 'a=rtcp-fb:<payload type> <feedback>');
    if (failed()) {
      return true;
    }
    const split = splitFirst(v);
    const feedback = split.rest;
    if (!truthy(feedback) || m.codecs === null) {
      return false;
    }
    if (split.head == '*') {
      m.rtcpFeedbackWildcard = pushString(m.rtcpFeedbackWildcard, feedback!);
      return true;
    }
    const codec = findCodec(m, split.head);
    if (failed()) {
      return true;
    }
    if (codec === null) {
      return false;
    }
    codec.rtcpFeedback = pushString(codec.rtcpFeedback, feedback!);
  } else {
    return false;
  }
  return true;
}

/**
 * Parses the value of an `a=` line (without `a=`) into the section: `media` for a media
 * section, `session` at session level. Unknown attributes, and known attributes outside
 * their scope, are kept in `attributes`.
 */
export function aLineParser(section: CommonAttributes, media: MediaSection | null, session: Sdp | null, attribute: string): void {
  const idx = attribute.indexOf(':');
  const name = idx == -1 ? attribute : attribute.slice(0, idx);
  const value: string | null = idx == -1 ? null : attribute.slice(idx + 1);
  if (name.length == 0) {
    fail('empty attribute name');
    return;
  }
  let handled = commonAttribute(section, name, value);
  if (!handled && session !== null) {
    handled = sessionAttribute(session, name, value);
  }
  if (!handled && media !== null) {
    handled = mediaAttribute(media, name, value);
  }
  if (failed() || handled) {
    return;
  }
  let attributes = section.attributes;
  if (attributes === null) {
    attributes = new Array<GenericAttribute>(0);
    section.attributes = attributes;
  }
  attributes.push(new GenericAttribute(name, value));
}

// Model <-> JSON. The JSON has exactly the shape of the TypeScript `Sdp` model:
// absent optional fields are omitted, records are objects.

import {
  Bandwidth, Candidate, Codec, CommonAttributes, Connection, EncryptionKey, Extmap, Fingerprint, GenericAttribute, Group,
  MediaSection, Msid, Origin, RepeatTimes, Rid, Rtcp, Sdp, Simulcast, SimulcastRid, Ssrc, SsrcGroup, TimeZoneAdjustment,
  Timing,
} from './model';
import {jsonArray, JsonObject, JsonValue, Kind, numArray, quote, strArray} from './json';
import {ABSENT, fail, failed, Params} from './util';
import {Issue} from './validator';

// ---------------------------------------------------------------------------
// Model -> JSON
// ---------------------------------------------------------------------------

function paramsJson(p: Params): string {
  const o = new JsonObject();
  for (let i = 0; i < p.keys.length; i++) {
    const value = p.values[i];
    o.raw(p.keys[i], value === null ? 'null' : quote(value));
  }
  return o.toString();
}

function connectionJson(c: Connection): string {
  return new JsonObject()
    .str('netType', c.netType).str('addrType', c.addrType).str('connectionAddress', c.connectionAddress).toString();
}

function bandwidthsJson(list: Bandwidth[] | null): string | null {
  if (list === null) {
    return null;
  }
  const items = new Array<string>(list.length);
  for (let i = 0; i < list.length; i++) {
    items[i] = new JsonObject().str('bwtype', list[i].bwtype).num('bandwidth', list[i].bandwidth).toString();
  }
  return jsonArray(items);
}

function keyJson(k: EncryptionKey): string {
  return new JsonObject().str('method', k.method).optStr('encryptionKey', k.encryptionKey).toString();
}

function simulcastStreamsJson(streams: Array<Array<SimulcastRid>>): string {
  const items = new Array<string>(streams.length);
  for (let i = 0; i < streams.length; i++) {
    const alternatives = new Array<string>(streams[i].length);
    for (let j = 0; j < streams[i].length; j++) {
      alternatives[j] = new JsonObject().str('rid', streams[i][j].rid).flag('paused', streams[i][j].paused).toString();
    }
    items[i] = jsonArray(alternatives);
  }
  return jsonArray(items);
}

function commonJson(o: JsonObject, s: CommonAttributes): void {
  o.optStr('direction', s.direction);
  o.optStr('iceUfrag', s.iceUfrag);
  o.optStr('icePwd', s.icePwd);
  const iceOptions = s.iceOptions;
  if (iceOptions !== null) {
    o.raw('iceOptions', strArray(iceOptions));
  }
  o.flag('endOfCandidates', s.endOfCandidates);
  const fingerprints = s.fingerprints;
  if (fingerprints !== null) {
    const items = new Array<string>(fingerprints.length);
    for (let i = 0; i < fingerprints.length; i++) {
      items[i] = new JsonObject()
        .str('hashFunction', fingerprints[i].hashFunction).str('fingerprint', fingerprints[i].fingerprint).toString();
    }
    o.raw('fingerprints', jsonArray(items));
  }
  o.optStr('setup', s.setup);
  const extmap = s.extmap;
  if (extmap !== null) {
    const items = new Array<string>(extmap.length);
    for (let i = 0; i < extmap.length; i++) {
      const e = extmap[i];
      items[i] = new JsonObject()
        .num('id', e.id).optStr('direction', e.direction).str('uri', e.uri).optStr('attributes', e.attributes).toString();
    }
    o.raw('extmap', jsonArray(items));
  }
  o.flag('extmapAllowMixed', s.extmapAllowMixed);
  const attributes = s.attributes;
  if (attributes !== null) {
    const items = new Array<string>(attributes.length);
    for (let i = 0; i < attributes.length; i++) {
      items[i] = new JsonObject().str('name', attributes[i].name).optStr('value', attributes[i].value).toString();
    }
    o.raw('attributes', jsonArray(items));
  }
}

function codecJson(c: Codec): string {
  const o = new JsonObject()
    .num('payloadType', c.payloadType)
    .optStr('encodingName', c.encodingName)
    .optNum('clockRate', c.clockRate)
    .optNum('encodingParameters', c.encodingParameters);
  const parameters = c.parameters;
  if (parameters !== null) {
    o.raw('parameters', paramsJson(parameters));
  }
  const feedback = c.rtcpFeedback;
  if (feedback !== null) {
    o.raw('rtcpFeedback', strArray(feedback));
  }
  return o.toString();
}

function candidateJson(c: Candidate): string {
  const o = new JsonObject()
    .str('foundation', c.foundation)
    .num('component', c.component)
    .str('transport', c.transport)
    .num('priority', c.priority)
    .str('address', c.address)
    .num('port', c.port)
    .str('type', c.type)
    .optStr('relatedAddress', c.relatedAddress)
    .optNum('relatedPort', c.relatedPort)
    .optStr('tcpType', c.tcpType);
  const extensions = c.extensions;
  if (extensions !== null) {
    o.raw('extensions', paramsJson(extensions));
  }
  return o.toString();
}

function mediaJson(m: MediaSection): string {
  const o = new JsonObject().str('type', m.type).optNum('port', m.port).optNum('numberOfPorts', m.numberOfPorts).optStr('proto', m.proto);
  const formats = m.formats;
  if (formats !== null) {
    o.raw('formats', strArray(formats));
  }
  const codecs = m.codecs;
  if (codecs !== null) {
    const items = new Array<string>(codecs.length);
    for (let i = 0; i < codecs.length; i++) {
      items[i] = codecJson(codecs[i]);
    }
    o.raw('codecs', jsonArray(items));
  }
  const wildcard = m.rtcpFeedbackWildcard;
  if (wildcard !== null) {
    o.raw('rtcpFeedbackWildcard', strArray(wildcard));
  }
  o.optStr('information', m.information);
  const conn = m.connectionInformation;
  if (conn !== null) {
    o.raw('connectionInformation', connectionJson(conn));
  }
  o.optRaw('bandwidths', bandwidthsJson(m.bandwidths));
  const key = m.encryptionKey;
  if (key !== null) {
    o.raw('encryptionKey', keyJson(key));
  }
  o.optStr('mid', m.mid);
  const rtcp = m.rtcp;
  if (rtcp !== null) {
    o.raw('rtcp', new JsonObject()
      .num('port', rtcp.port).optStr('netType', rtcp.netType).optStr('addrType', rtcp.addrType).optStr('address', rtcp.address)
      .toString());
  }
  o.flag('rtcpMux', m.rtcpMux);
  o.flag('rtcpRsize', m.rtcpRsize);
  o.optNum('sctpPort', m.sctpPort);
  o.optNum('maxMessageSize', m.maxMessageSize);
  const candidates = m.candidates;
  if (candidates !== null) {
    const items = new Array<string>(candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      items[i] = candidateJson(candidates[i]);
    }
    o.raw('candidates', jsonArray(items));
  }
  const msid = m.msid;
  if (msid !== null) {
    const items = new Array<string>(msid.length);
    for (let i = 0; i < msid.length; i++) {
      items[i] = new JsonObject().str('streamId', msid[i].streamId).optStr('trackId', msid[i].trackId).toString();
    }
    o.raw('msid', jsonArray(items));
  }
  const ssrcs = m.ssrcs;
  if (ssrcs !== null) {
    const items = new Array<string>(ssrcs.length);
    for (let i = 0; i < ssrcs.length; i++) {
      items[i] = new JsonObject().num('id', ssrcs[i].id).raw('attributes', paramsJson(ssrcs[i].attributes)).toString();
    }
    o.raw('ssrcs', jsonArray(items));
  }
  const groups = m.ssrcGroups;
  if (groups !== null) {
    const items = new Array<string>(groups.length);
    for (let i = 0; i < groups.length; i++) {
      items[i] = new JsonObject().str('semantics', groups[i].semantics).raw('ssrcs', numArray(groups[i].ssrcs)).toString();
    }
    o.raw('ssrcGroups', jsonArray(items));
  }
  const rids = m.rids;
  if (rids !== null) {
    const items = new Array<string>(rids.length);
    for (let i = 0; i < rids.length; i++) {
      const r = rids[i];
      const ro = new JsonObject().str('id', r.id).str('direction', r.direction);
      const pts = r.payloadTypes;
      if (pts !== null) {
        ro.raw('payloadTypes', numArray(pts));
      }
      const restrictions = r.restrictions;
      if (restrictions !== null) {
        ro.raw('restrictions', paramsJson(restrictions));
      }
      items[i] = ro.toString();
    }
    o.raw('rids', jsonArray(items));
  }
  const simulcast = m.simulcast;
  if (simulcast !== null) {
    const so = new JsonObject();
    const send = simulcast.send;
    if (send !== null) {
      so.raw('send', simulcastStreamsJson(send));
    }
    const recv = simulcast.recv;
    if (recv !== null) {
      so.raw('recv', simulcastStreamsJson(recv));
    }
    o.raw('simulcast', so.toString());
  }
  commonJson(o, m);
  return o.toString();
}

export function sdpToJson(sdp: Sdp): string {
  const o = new JsonObject();
  if (!isNaN(sdp.protocolVersion)) {
    o.num('protocolVersion', sdp.protocolVersion);
  }
  const origin = sdp.origin;
  if (origin !== null) {
    o.raw('origin', new JsonObject()
      .str('username', origin.username).str('sessId', origin.sessId).str('sessVersion', origin.sessVersion)
      .str('netType', origin.netType).str('addrType', origin.addrType).str('unicastAddress', origin.unicastAddress)
      .toString());
  }
  o.optStr('sessionName', sdp.sessionName);
  o.optStr('sessionInformation', sdp.sessionInformation);
  o.optStr('uri', sdp.uri);
  const emails = sdp.emailAddresses;
  if (emails !== null) {
    o.raw('emailAddresses', strArray(emails));
  }
  const phones = sdp.phoneNumbers;
  if (phones !== null) {
    o.raw('phoneNumbers', strArray(phones));
  }
  const conn = sdp.connectionInformation;
  if (conn !== null) {
    o.raw('connectionInformation', connectionJson(conn));
  }
  o.optRaw('bandwidths', bandwidthsJson(sdp.bandwidths));
  const timing = sdp.timing;
  if (timing !== null) {
    const items = new Array<string>(timing.length);
    for (let i = 0; i < timing.length; i++) {
      const t = timing[i];
      const to = new JsonObject().num('startTime', t.startTime).num('stopTime', t.stopTime);
      const repeat = t.repeat;
      if (repeat !== null) {
        const reps = new Array<string>(repeat.length);
        for (let j = 0; j < repeat.length; j++) {
          reps[j] = new JsonObject()
            .num('repeatInterval', repeat[j].repeatInterval).num('activeDuration', repeat[j].activeDuration)
            .raw('offsets', numArray(repeat[j].offsets)).toString();
        }
        to.raw('repeat', jsonArray(reps));
      }
      const zone = t.zoneAdjustments;
      if (zone !== null) {
        const zs = new Array<string>(zone.length);
        for (let j = 0; j < zone.length; j++) {
          zs[j] = new JsonObject().num('adjustmentTime', zone[j].adjustmentTime).num('offset', zone[j].offset).toString();
        }
        to.raw('zoneAdjustments', jsonArray(zs));
      }
      items[i] = to.toString();
    }
    o.raw('timing', jsonArray(items));
  }
  const key = sdp.encryptionKey;
  if (key !== null) {
    o.raw('encryptionKey', keyJson(key));
  }
  const groups = sdp.group;
  if (groups !== null) {
    const items = new Array<string>(groups.length);
    for (let i = 0; i < groups.length; i++) {
      items[i] = new JsonObject().str('semantics', groups[i].semantics).raw('mids', strArray(groups[i].mids)).toString();
    }
    o.raw('group', jsonArray(items));
  }
  o.flag('iceLite', sdp.iceLite);
  commonJson(o, sdp);
  const media = new Array<string>(sdp.media.length);
  for (let i = 0; i < sdp.media.length; i++) {
    media[i] = mediaJson(sdp.media[i]);
  }
  o.raw('media', jsonArray(media));
  return o.toString();
}

export function issuesToJson(issues: Issue[]): string {
  const items = new Array<string>(issues.length);
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const o = new JsonObject().str('severity', issue.severity).str('code', issue.code).str('message', issue.message);
    if (issue.mediaIndex >= 0) {
      o.num('mediaIndex', issue.mediaIndex);
    }
    if (issue.lineNumber >= 0) {
      o.num('lineNumber', issue.lineNumber);
    }
    items[i] = o.toString();
  }
  return jsonArray(items);
}

// ---------------------------------------------------------------------------
// JSON -> model. Absent optional fields and `null` are the same; a field of the wrong
// type fails with "invalid SDP model: <path> ...".
// ---------------------------------------------------------------------------

function invalid(path: string, what: string): void {
  fail(`invalid SDP model: ${path} ${what}`);
}

/** The member if present and not null, else null. Fails if `v` itself is not an object. */
function member(v: JsonValue, key: string): JsonValue | null {
  const m = v.get(key);
  return m === null || m.kind == Kind.Null ? null : m;
}

function expectKind(v: JsonValue, kind: Kind, path: string, what: string): bool {
  if (v.kind != kind) {
    invalid(path, `must be ${what}, got ${v.kindName()}`);
    return false;
  }
  return true;
}

function optStr(o: JsonValue, key: string, path: string): string | null {
  const v = member(o, key);
  if (v === null || !expectKind(v, Kind.Str, `${path}.${key}`, 'a string')) {
    return null;
  }
  return v.s;
}

function reqStr(o: JsonValue, key: string, path: string): string {
  const v = member(o, key);
  if (v === null) {
    invalid(`${path}.${key}`, 'is required');
    return '';
  }
  return expectKind(v, Kind.Str, `${path}.${key}`, 'a string') ? v.s : '';
}

function optNum(o: JsonValue, key: string, path: string): f64 {
  const v = member(o, key);
  if (v === null || !expectKind(v, Kind.Num, `${path}.${key}`, 'a number')) {
    return ABSENT;
  }
  return v.n;
}

function reqNum(o: JsonValue, key: string, path: string): f64 {
  const v = member(o, key);
  if (v === null) {
    invalid(`${path}.${key}`, 'is required');
    return ABSENT;
  }
  return expectKind(v, Kind.Num, `${path}.${key}`, 'a number') ? v.n : ABSENT;
}

function optBool(o: JsonValue, key: string, path: string): bool {
  const v = member(o, key);
  if (v === null || !expectKind(v, Kind.Bool, `${path}.${key}`, 'a boolean')) {
    return false;
  }
  return v.b;
}

/** Array member; null if absent or invalid (check failed()) */
function optArr(o: JsonValue, key: string, path: string): JsonValue[] | null {
  const v = member(o, key);
  if (v === null || !expectKind(v, Kind.Arr, `${path}.${key}`, 'an array')) {
    return null;
  }
  return v.items;
}

function optObj(o: JsonValue, key: string, path: string): JsonValue | null {
  const v = member(o, key);
  if (v === null || !expectKind(v, Kind.Obj, `${path}.${key}`, 'an object')) {
    return null;
  }
  return v;
}

function strList(items: JsonValue[] | null, path: string): string[] | null {
  if (items === null) {
    return null;
  }
  const result = new Array<string>(items.length);
  for (let i = 0; i < items.length; i++) {
    if (!expectKind(items[i], Kind.Str, `${path}[${i}]`, 'a string')) {
      return null;
    }
    result[i] = items[i].s;
  }
  return result;
}

function numList(items: JsonValue[] | null, path: string): f64[] | null {
  if (items === null) {
    return null;
  }
  const result = new Array<f64>(items.length);
  for (let i = 0; i < items.length; i++) {
    if (!expectKind(items[i], Kind.Num, `${path}[${i}]`, 'a number')) {
      return null;
    }
    result[i] = items[i].n;
  }
  return result;
}

function objList(items: JsonValue[] | null, path: string): JsonValue[] | null {
  if (items === null) {
    return null;
  }
  for (let i = 0; i < items.length; i++) {
    if (!expectKind(items[i], Kind.Obj, `${path}[${i}]`, 'an object')) {
      return null;
    }
  }
  return items;
}

/** `Record<string, string | null>` */
function paramsFrom(o: JsonValue | null, path: string): Params | null {
  if (o === null) {
    return null;
  }
  const p = new Params();
  for (let i = 0; i < o.keys.length; i++) {
    const v = o.values[i];
    if (v.kind == Kind.Null) {
      p.set(o.keys[i], null);
    } else if (expectKind(v, Kind.Str, `${path}.${o.keys[i]}`, 'a string or null')) {
      p.set(o.keys[i], v.s);
    } else {
      return null;
    }
  }
  return p;
}

function connectionFrom(o: JsonValue | null, path: string): Connection | null {
  if (o === null) {
    return null;
  }
  return new Connection(reqStr(o, 'netType', path), reqStr(o, 'addrType', path), reqStr(o, 'connectionAddress', path));
}

function bandwidthsFrom(o: JsonValue, path: string): Bandwidth[] | null {
  const items = objList(optArr(o, 'bandwidths', path), `${path}.bandwidths`);
  if (items === null) {
    return null;
  }
  const result = new Array<Bandwidth>(items.length);
  for (let i = 0; i < items.length; i++) {
    const p = `${path}.bandwidths[${i}]`;
    result[i] = new Bandwidth(reqStr(items[i], 'bwtype', p), reqNum(items[i], 'bandwidth', p));
  }
  return result;
}

function keyFrom(o: JsonValue | null, path: string): EncryptionKey | null {
  if (o === null) {
    return null;
  }
  return new EncryptionKey(reqStr(o, 'method', path), optStr(o, 'encryptionKey', path));
}

function commonFrom(s: CommonAttributes, o: JsonValue, path: string): void {
  s.direction = optStr(o, 'direction', path);
  s.iceUfrag = optStr(o, 'iceUfrag', path);
  s.icePwd = optStr(o, 'icePwd', path);
  s.iceOptions = strList(optArr(o, 'iceOptions', path), `${path}.iceOptions`);
  s.endOfCandidates = optBool(o, 'endOfCandidates', path);
  const fps = objList(optArr(o, 'fingerprints', path), `${path}.fingerprints`);
  if (fps !== null) {
    const list = new Array<Fingerprint>(fps.length);
    for (let i = 0; i < fps.length; i++) {
      const p = `${path}.fingerprints[${i}]`;
      list[i] = new Fingerprint(reqStr(fps[i], 'hashFunction', p), reqStr(fps[i], 'fingerprint', p));
    }
    s.fingerprints = list;
  }
  s.setup = optStr(o, 'setup', path);
  const exts = objList(optArr(o, 'extmap', path), `${path}.extmap`);
  if (exts !== null) {
    const list = new Array<Extmap>(exts.length);
    for (let i = 0; i < exts.length; i++) {
      const p = `${path}.extmap[${i}]`;
      const e = new Extmap();
      e.id = reqNum(exts[i], 'id', p);
      e.direction = optStr(exts[i], 'direction', p);
      e.uri = reqStr(exts[i], 'uri', p);
      e.attributes = optStr(exts[i], 'attributes', p);
      list[i] = e;
    }
    s.extmap = list;
  }
  s.extmapAllowMixed = optBool(o, 'extmapAllowMixed', path);
  const attrs = objList(optArr(o, 'attributes', path), `${path}.attributes`);
  if (attrs !== null) {
    const list = new Array<GenericAttribute>(attrs.length);
    for (let i = 0; i < attrs.length; i++) {
      const p = `${path}.attributes[${i}]`;
      list[i] = new GenericAttribute(reqStr(attrs[i], 'name', p), optStr(attrs[i], 'value', p));
    }
    s.attributes = list;
  }
}

function simulcastStreamsFrom(items: JsonValue[] | null, path: string): Array<Array<SimulcastRid>> | null {
  if (items === null) {
    return null;
  }
  const result = new Array<Array<SimulcastRid>>(items.length);
  for (let i = 0; i < items.length; i++) {
    if (!expectKind(items[i], Kind.Arr, `${path}[${i}]`, 'an array')) {
      return null;
    }
    const alternatives = objList(items[i].items, `${path}[${i}]`);
    if (alternatives === null) {
      return null;
    }
    const stream = new Array<SimulcastRid>(alternatives.length);
    for (let j = 0; j < alternatives.length; j++) {
      const p = `${path}[${i}][${j}]`;
      stream[j] = new SimulcastRid(reqStr(alternatives[j], 'rid', p), optBool(alternatives[j], 'paused', p));
    }
    result[i] = stream;
  }
  return result;
}

function mediaFrom(o: JsonValue, path: string): MediaSection {
  const m = new MediaSection();
  m.type = reqStr(o, 'type', path);
  m.port = optNum(o, 'port', path);
  m.numberOfPorts = optNum(o, 'numberOfPorts', path);
  m.proto = optStr(o, 'proto', path);
  m.formats = strList(optArr(o, 'formats', path), `${path}.formats`);
  const codecs = objList(optArr(o, 'codecs', path), `${path}.codecs`);
  if (codecs !== null) {
    const list = new Array<Codec>(codecs.length);
    for (let i = 0; i < codecs.length; i++) {
      const p = `${path}.codecs[${i}]`;
      const c = new Codec();
      c.payloadType = reqNum(codecs[i], 'payloadType', p);
      c.encodingName = optStr(codecs[i], 'encodingName', p);
      c.clockRate = optNum(codecs[i], 'clockRate', p);
      c.encodingParameters = optNum(codecs[i], 'encodingParameters', p);
      c.parameters = paramsFrom(optObj(codecs[i], 'parameters', p), `${p}.parameters`);
      c.rtcpFeedback = strList(optArr(codecs[i], 'rtcpFeedback', p), `${p}.rtcpFeedback`);
      list[i] = c;
    }
    m.codecs = list;
  }
  m.rtcpFeedbackWildcard = strList(optArr(o, 'rtcpFeedbackWildcard', path), `${path}.rtcpFeedbackWildcard`);
  m.information = optStr(o, 'information', path);
  m.connectionInformation = connectionFrom(optObj(o, 'connectionInformation', path), `${path}.connectionInformation`);
  m.bandwidths = bandwidthsFrom(o, path);
  m.encryptionKey = keyFrom(optObj(o, 'encryptionKey', path), `${path}.encryptionKey`);
  m.mid = optStr(o, 'mid', path);
  const rtcp = optObj(o, 'rtcp', path);
  if (rtcp !== null) {
    const p = `${path}.rtcp`;
    const r = new Rtcp();
    r.port = reqNum(rtcp, 'port', p);
    r.netType = optStr(rtcp, 'netType', p);
    r.addrType = optStr(rtcp, 'addrType', p);
    r.address = optStr(rtcp, 'address', p);
    m.rtcp = r;
  }
  m.rtcpMux = optBool(o, 'rtcpMux', path);
  m.rtcpRsize = optBool(o, 'rtcpRsize', path);
  m.sctpPort = optNum(o, 'sctpPort', path);
  m.maxMessageSize = optNum(o, 'maxMessageSize', path);
  const candidates = objList(optArr(o, 'candidates', path), `${path}.candidates`);
  if (candidates !== null) {
    const list = new Array<Candidate>(candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      const p = `${path}.candidates[${i}]`;
      const co = candidates[i];
      const c = new Candidate();
      c.foundation = reqStr(co, 'foundation', p);
      c.component = reqNum(co, 'component', p);
      c.transport = reqStr(co, 'transport', p);
      c.priority = reqNum(co, 'priority', p);
      c.address = reqStr(co, 'address', p);
      c.port = reqNum(co, 'port', p);
      c.type = reqStr(co, 'type', p);
      c.relatedAddress = optStr(co, 'relatedAddress', p);
      c.relatedPort = optNum(co, 'relatedPort', p);
      c.tcpType = optStr(co, 'tcpType', p);
      c.extensions = paramsFrom(optObj(co, 'extensions', p), `${p}.extensions`);
      list[i] = c;
    }
    m.candidates = list;
  }
  const msid = objList(optArr(o, 'msid', path), `${path}.msid`);
  if (msid !== null) {
    const list = new Array<Msid>(msid.length);
    for (let i = 0; i < msid.length; i++) {
      const p = `${path}.msid[${i}]`;
      list[i] = new Msid(reqStr(msid[i], 'streamId', p), optStr(msid[i], 'trackId', p));
    }
    m.msid = list;
  }
  const ssrcs = objList(optArr(o, 'ssrcs', path), `${path}.ssrcs`);
  if (ssrcs !== null) {
    const list = new Array<Ssrc>(ssrcs.length);
    for (let i = 0; i < ssrcs.length; i++) {
      const p = `${path}.ssrcs[${i}]`;
      const attributes = paramsFrom(optObj(ssrcs[i], 'attributes', p), `${p}.attributes`);
      list[i] = new Ssrc(reqNum(ssrcs[i], 'id', p), attributes === null ? new Params() : attributes);
    }
    m.ssrcs = list;
  }
  const groups = objList(optArr(o, 'ssrcGroups', path), `${path}.ssrcGroups`);
  if (groups !== null) {
    const list = new Array<SsrcGroup>(groups.length);
    for (let i = 0; i < groups.length; i++) {
      const p = `${path}.ssrcGroups[${i}]`;
      const ids = numList(optArr(groups[i], 'ssrcs', p), `${p}.ssrcs`);
      list[i] = new SsrcGroup(reqStr(groups[i], 'semantics', p), ids === null ? [] : ids);
    }
    m.ssrcGroups = list;
  }
  const rids = objList(optArr(o, 'rids', path), `${path}.rids`);
  if (rids !== null) {
    const list = new Array<Rid>(rids.length);
    for (let i = 0; i < rids.length; i++) {
      const p = `${path}.rids[${i}]`;
      const r = new Rid();
      r.id = reqStr(rids[i], 'id', p);
      r.direction = reqStr(rids[i], 'direction', p);
      r.payloadTypes = numList(optArr(rids[i], 'payloadTypes', p), `${p}.payloadTypes`);
      r.restrictions = paramsFrom(optObj(rids[i], 'restrictions', p), `${p}.restrictions`);
      list[i] = r;
    }
    m.rids = list;
  }
  const simulcast = optObj(o, 'simulcast', path);
  if (simulcast !== null) {
    const s = new Simulcast();
    s.send = simulcastStreamsFrom(optArr(simulcast, 'send', `${path}.simulcast`), `${path}.simulcast.send`);
    s.recv = simulcastStreamsFrom(optArr(simulcast, 'recv', `${path}.simulcast`), `${path}.simulcast.recv`);
    m.simulcast = s;
  }
  commonFrom(m, o, path);
  return m;
}

/** Builds the model from its JSON form; returns null and calls fail() on error */
export function sdpFromJson(o: JsonValue): Sdp | null {
  if (!expectKind(o, Kind.Obj, 'sdp', 'an object')) {
    return null;
  }
  const path = 'sdp';
  const sdp = new Sdp();
  sdp.protocolVersion = optNum(o, 'protocolVersion', path);
  const origin = optObj(o, 'origin', path);
  if (origin !== null) {
    const p = `${path}.origin`;
    const og = new Origin();
    og.username = reqStr(origin, 'username', p);
    og.sessId = reqStr(origin, 'sessId', p);
    og.sessVersion = reqStr(origin, 'sessVersion', p);
    og.netType = reqStr(origin, 'netType', p);
    og.addrType = reqStr(origin, 'addrType', p);
    og.unicastAddress = reqStr(origin, 'unicastAddress', p);
    sdp.origin = og;
  }
  sdp.sessionName = optStr(o, 'sessionName', path);
  sdp.sessionInformation = optStr(o, 'sessionInformation', path);
  sdp.uri = optStr(o, 'uri', path);
  sdp.emailAddresses = strList(optArr(o, 'emailAddresses', path), `${path}.emailAddresses`);
  sdp.phoneNumbers = strList(optArr(o, 'phoneNumbers', path), `${path}.phoneNumbers`);
  sdp.connectionInformation = connectionFrom(optObj(o, 'connectionInformation', path), `${path}.connectionInformation`);
  sdp.bandwidths = bandwidthsFrom(o, path);
  const timing = objList(optArr(o, 'timing', path), `${path}.timing`);
  if (timing !== null) {
    const list = new Array<Timing>(timing.length);
    for (let i = 0; i < timing.length; i++) {
      const p = `${path}.timing[${i}]`;
      const t = new Timing();
      t.startTime = reqNum(timing[i], 'startTime', p);
      t.stopTime = reqNum(timing[i], 'stopTime', p);
      const repeat = objList(optArr(timing[i], 'repeat', p), `${p}.repeat`);
      if (repeat !== null) {
        const reps = new Array<RepeatTimes>(repeat.length);
        for (let j = 0; j < repeat.length; j++) {
          const rp = `${p}.repeat[${j}]`;
          const r = new RepeatTimes();
          r.repeatInterval = reqNum(repeat[j], 'repeatInterval', rp);
          r.activeDuration = reqNum(repeat[j], 'activeDuration', rp);
          const offsets = numList(optArr(repeat[j], 'offsets', rp), `${rp}.offsets`);
          r.offsets = offsets === null ? [] : offsets;
          reps[j] = r;
        }
        t.repeat = reps;
      }
      const zone = objList(optArr(timing[i], 'zoneAdjustments', p), `${p}.zoneAdjustments`);
      if (zone !== null) {
        const zs = new Array<TimeZoneAdjustment>(zone.length);
        for (let j = 0; j < zone.length; j++) {
          const zp = `${p}.zoneAdjustments[${j}]`;
          zs[j] = new TimeZoneAdjustment(reqNum(zone[j], 'adjustmentTime', zp), reqNum(zone[j], 'offset', zp));
        }
        t.zoneAdjustments = zs;
      }
      list[i] = t;
    }
    sdp.timing = list;
  }
  sdp.encryptionKey = keyFrom(optObj(o, 'encryptionKey', path), `${path}.encryptionKey`);
  const groups = objList(optArr(o, 'group', path), `${path}.group`);
  if (groups !== null) {
    const list = new Array<Group>(groups.length);
    for (let i = 0; i < groups.length; i++) {
      const p = `${path}.group[${i}]`;
      const mids = strList(optArr(groups[i], 'mids', p), `${p}.mids`);
      list[i] = new Group(reqStr(groups[i], 'semantics', p), mids === null ? [] : mids);
    }
    sdp.group = list;
  }
  sdp.iceLite = optBool(o, 'iceLite', path);
  commonFrom(sdp, o, path);
  const media = objList(optArr(o, 'media', path), `${path}.media`);
  if (media !== null) {
    for (let i = 0; i < media.length; i++) {
      sdp.media.push(mediaFrom(media[i], `${path}.media[${i}]`));
    }
  }
  return failed() ? null : sdp;
}

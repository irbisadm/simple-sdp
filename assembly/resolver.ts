// sdpResolver.resolve and sdpNegotiator.negotiate: a port of src/services/sdp-resolver
// and src/services/sdp-negotiator. Results are written straight to JSON with the shape
// of the TypeScript `SdpResolved` and `SdpNegotiation`.

import {Codec, CommonAttributes, Extmap, Fingerprint, MediaSection, Sdp} from './model';
import {jsonArray, JsonObject, strArray} from './json';
import {codecObject, extmapObject, fingerprintJson} from './serialize';
import {asciiCase} from './validator';
import {ABSENT, fmtNum, isDigits, present, splitFirst} from './util';

const ENCRYPT_URI = 'urn:ietf:params:rtp-hdrext:encrypt';

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

class ResolvedCodec {
  constructor(public codec: Codec, public isStatic: bool) {}
}

class ResolvedExtmap {
  constructor(public extmap: Extmap, public encrypted: bool) {}
}

class ResolvedMedia {
  index: i32 = 0;
  mid: string | null = null;
  type: string = '';
  port: f64 = ABSENT;
  rejected: bool = false;
  proto: string | null = null;
  direction: string = 'sendrecv';
  codecs: ResolvedCodec[] = [];
  extmap: ResolvedExtmap[] = [];
  iceUfrag: string | null = null;
  icePwd: string | null = null;
  setup: string | null = null;
  fingerprints: Fingerprint[] = [];
}

class Resolved {
  bundle: string[] = [];
  hold: bool = false;
  media: ResolvedMedia[] = [];
}

/** Statically assigned payload types — RFC 3551 §6, tables 4 and 5. Null if not assigned. */
function staticPayloadType(pt: f64): Codec | null {
  let name = '';
  let rate: f64 = 8000;
  let channels: f64 = ABSENT;
  const n = <i32>pt;
  if (<f64>n != pt) return null;
  switch (n) {
    case 0: name = 'PCMU'; break;
    case 3: name = 'GSM'; break;
    case 4: name = 'G723'; break;
    case 5: name = 'DVI4'; break;
    case 6: name = 'DVI4'; rate = 16000; break;
    case 7: name = 'LPC'; break;
    case 8: name = 'PCMA'; break;
    case 9: name = 'G722'; break;
    case 10: name = 'L16'; rate = 44100; channels = 2; break;
    case 11: name = 'L16'; rate = 44100; break;
    case 12: name = 'QCELP'; break;
    case 13: name = 'CN'; break;
    case 14: name = 'MPA'; rate = 90000; break;
    case 15: name = 'G728'; break;
    case 16: name = 'DVI4'; rate = 11025; break;
    case 17: name = 'DVI4'; rate = 22050; break;
    case 18: name = 'G729'; break;
    case 25: name = 'CelB'; rate = 90000; break;
    case 26: name = 'JPEG'; rate = 90000; break;
    case 28: name = 'nv'; rate = 90000; break;
    case 31: name = 'H261'; rate = 90000; break;
    case 32: name = 'MPV'; rate = 90000; break;
    case 33: name = 'MP2T'; rate = 90000; break;
    case 34: name = 'H263'; rate = 90000; break;
    default: return null;
  }
  const c = new Codec();
  c.encodingName = name;
  c.clockRate = rate;
  c.encodingParameters = channels;
  return c;
}

/** Splits at spaces, dropping empty parts (`value.split(' ').filter(s => s.length)`) */
function words(value: string): string[] {
  const parts = value.split(' ');
  const out = new Array<string>(0);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length > 0) out.push(parts[i]);
  }
  return out;
}

/**
 * An `a=rtpmap` line for `pt` that lenient parsing kept as a generic attribute, if its
 * encoding name is readable (e.g. `a=rtpmap:101 telephone-event` without a clock rate).
 * The first such line wins.
 */
function looseRtpmap(m: MediaSection, pt: f64): Codec | null {
  const attributes = m.attributes;
  if (attributes === null) return null;
  for (let i = 0; i < attributes.length; i++) {
    const value = attributes[i].value;
    if (attributes[i].name != 'rtpmap' || value === null) continue;
    const parts = words(value);
    if (parts.length == 0 || !isDigits(parts[0])) continue;
    const encoding = parts.length > 1 ? parts[1] : '';
    const fields = encoding.split('/');
    if (fields[0].length == 0) continue;
    if (parseFloat(parts[0]) != pt) continue;
    const c = new Codec();
    c.encodingName = fields[0];
    if (fields.length > 1 && isDigits(fields[1])) {
      c.clockRate = parseFloat(fields[1]);
      if (fields.length > 2 && isDigits(fields[2])) {
        c.encodingParameters = parseFloat(fields[2]);
      }
    }
    return c;
  }
  return null;
}

function copyCodec(c: Codec): Codec {
  const out = new Codec();
  out.payloadType = c.payloadType;
  out.encodingName = c.encodingName;
  out.clockRate = c.clockRate;
  out.encodingParameters = c.encodingParameters;
  out.parameters = c.parameters;
  out.rtcpFeedback = c.rtcpFeedback;
  return out;
}

function resolveCodecs(m: MediaSection): ResolvedCodec[] {
  const codecs = m.codecs;
  const out = new Array<ResolvedCodec>(0);
  if (codecs === null) return out;
  const wildcard = m.rtcpFeedbackWildcard;
  for (let i = 0; i < codecs.length; i++) {
    const codec = copyCodec(codecs[i]);
    let isStatic = false;
    if (codec.encodingName === null) {
      let known = looseRtpmap(m, codec.payloadType);
      if (known === null) {
        known = staticPayloadType(codec.payloadType);
        isStatic = known !== null;
      }
      if (known !== null) {
        codec.encodingName = known.encodingName;
        codec.clockRate = known.clockRate;
        codec.encodingParameters = known.encodingParameters;
      }
    }
    if (wildcard !== null && wildcard.length > 0) {
      const own = codecs[i].rtcpFeedback;
      const feedback = own === null ? new Array<string>(0) : own.slice(0);
      for (let j = 0; j < wildcard.length; j++) {
        if (!feedback.includes(wildcard[j])) feedback.push(wildcard[j]);
      }
      codec.rtcpFeedback = feedback;
    }
    out.push(new ResolvedCodec(codec, isStatic));
  }
  return out;
}

function resolveExtmap(e: Extmap): ResolvedExtmap {
  const attributes = e.attributes;
  if (e.uri != ENCRYPT_URI || attributes === null) {
    return new ResolvedExtmap(e, false);
  }
  const split = splitFirst(attributes);
  const out = new Extmap();
  out.id = e.id;
  out.direction = e.direction;
  out.uri = split.head;
  out.attributes = split.rest;
  return new ResolvedExtmap(out, true);
}

function resolveExtmaps(media: Extmap[] | null, session: Extmap[] | null): ResolvedExtmap[] {
  const out = new Array<ResolvedExtmap>(0);
  if (media !== null) {
    for (let i = 0; i < media.length; i++) out.push(resolveExtmap(media[i]));
  }
  if (session !== null) {
    for (let i = 0; i < session.length; i++) {
      let used = false;
      for (let j = 0; media !== null && j < media.length; j++) {
        if (media[j].id == session[i].id) used = true;
      }
      if (!used) out.push(resolveExtmap(session[i]));
    }
  }
  return out;
}

/** Typed `a=setup`, else the value of the first generic `a=setup` attribute */
function setupOf(s: CommonAttributes): string | null {
  if (s.setup !== null) return s.setup;
  const attributes = s.attributes;
  if (attributes === null) return null;
  for (let i = 0; i < attributes.length; i++) {
    if (attributes[i].name == 'setup') return attributes[i].value;
  }
  return null;
}

function resolveMedia(m: MediaSection, index: i32, session: Sdp): ResolvedMedia {
  const r = new ResolvedMedia();
  r.index = index;
  r.mid = m.mid;
  r.type = m.type;
  r.port = m.port;
  r.rejected = m.port == 0;
  r.proto = m.proto;
  const direction = m.direction !== null ? m.direction : session.direction;
  r.direction = direction !== null ? direction : 'sendrecv';
  r.codecs = resolveCodecs(m);
  r.extmap = resolveExtmaps(m.extmap, session.extmap);
  r.iceUfrag = m.iceUfrag !== null ? m.iceUfrag : session.iceUfrag;
  r.icePwd = m.icePwd !== null ? m.icePwd : session.icePwd;
  const setup = setupOf(m);
  r.setup = setup !== null ? setup : setupOf(session);
  const fingerprints = m.fingerprints !== null ? m.fingerprints : session.fingerprints;
  r.fingerprints = fingerprints !== null ? fingerprints : [];
  return r;
}

function resolveSdp(sdp: Sdp): Resolved {
  const r = new Resolved();
  for (let i = 0; i < sdp.media.length; i++) {
    const m = resolveMedia(sdp.media[i], i, sdp);
    r.media.push(m);
    if (!m.rejected && m.direction != 'sendrecv') r.hold = true;
  }
  const groups = sdp.group;
  if (groups !== null) {
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].semantics == 'BUNDLE') {
        r.bundle = groups[i].mids.slice(0);
        break;
      }
    }
  }
  return r;
}

function codecJson(c: ResolvedCodec): string {
  return codecObject(c.codec).flag('static', c.isStatic).toString();
}

function codecsJson(list: ResolvedCodec[]): string {
  const items = new Array<string>(list.length);
  for (let i = 0; i < list.length; i++) items[i] = codecJson(list[i]);
  return jsonArray(items);
}

function extmapsJson(list: ResolvedExtmap[]): string {
  const items = new Array<string>(list.length);
  for (let i = 0; i < list.length; i++) {
    items[i] = extmapObject(list[i].extmap).flag('encrypted', list[i].encrypted).toString();
  }
  return jsonArray(items);
}

function mediaJson(m: ResolvedMedia): string {
  const fingerprints = new Array<string>(m.fingerprints.length);
  for (let i = 0; i < m.fingerprints.length; i++) fingerprints[i] = fingerprintJson(m.fingerprints[i]);
  return new JsonObject()
    .num('index', <f64>m.index)
    .optStr('mid', m.mid)
    .str('type', m.type)
    .optNum('port', m.port)
    .raw('rejected', m.rejected ? 'true' : 'false')
    .optStr('proto', m.proto)
    .str('direction', m.direction)
    .raw('codecs', codecsJson(m.codecs))
    .raw('extmap', extmapsJson(m.extmap))
    .optStr('iceUfrag', m.iceUfrag)
    .optStr('icePwd', m.icePwd)
    .optStr('setup', m.setup)
    .raw('fingerprints', jsonArray(fingerprints))
    .toString();
}

/** JSON of `sdpResolver.resolve(sdp)` */
export function resolveJson(sdp: Sdp): string {
  const r = resolveSdp(sdp);
  const media = new Array<string>(r.media.length);
  for (let i = 0; i < r.media.length; i++) media[i] = mediaJson(r.media[i]);
  return new JsonObject()
    .raw('bundle', strArray(r.bundle))
    .raw('hold', r.hold ? 'true' : 'false')
    .raw('media', jsonArray(media))
    .toString();
}

// ---------------------------------------------------------------------------
// Negotiate
// ---------------------------------------------------------------------------

/** Codecs match by name (ASCII case-insensitive), clock rate and channels; a codec without a name matches by payload type */
function codecKey(c: Codec): string {
  const name = c.encodingName;
  if (name === null) return '#' + fmtNum(c.payloadType);
  return asciiCase(name, false) + '/' + (present(c.clockRate) ? fmtNum(c.clockRate) : '') + '/' +
    (present(c.encodingParameters) ? fmtNum(c.encodingParameters) : '1');
}

function extmapKey(e: ResolvedExtmap): string {
  return (e.encrypted ? 'encrypted ' : '') + e.extmap.uri;
}

function negotiatedMediaJson(am: ResolvedMedia, om: ResolvedMedia | null): string {
  const rejected = am.rejected;
  const codecs = new Array<ResolvedCodec>(0);
  const extmap = new Array<ResolvedExtmap>(0);
  if (!rejected && om !== null) {
    const offerCodecs = new Array<string>(om.codecs.length);
    for (let i = 0; i < om.codecs.length; i++) offerCodecs[i] = codecKey(om.codecs[i].codec);
    for (let i = 0; i < am.codecs.length; i++) {
      if (offerCodecs.includes(codecKey(am.codecs[i].codec))) codecs.push(am.codecs[i]);
    }
    const offerExtmap = new Array<string>(om.extmap.length);
    for (let i = 0; i < om.extmap.length; i++) offerExtmap[i] = extmapKey(om.extmap[i]);
    for (let i = 0; i < am.extmap.length; i++) {
      if (offerExtmap.includes(extmapKey(am.extmap[i]))) extmap.push(am.extmap[i]);
    }
  }
  const offerDirection = om !== null ? om.direction : 'sendrecv';
  return new JsonObject()
    .num('index', <f64>am.index)
    .optNum('offerIndex', om !== null ? <f64>om.index : ABSENT)
    .optStr('mid', am.mid)
    .str('type', am.type)
    .raw('rejected', rejected ? 'true' : 'false')
    .raw('codecs', codecsJson(codecs))
    .raw('extmap', extmapsJson(extmap))
    .str('offerDirection', offerDirection)
    .str('answerDirection', am.direction)
    .raw('hold', isHold(am, om) ? 'true' : 'false')
    .toString();
}

/** Not rejected, and either side has a direction other than sendrecv */
function isHold(am: ResolvedMedia, om: ResolvedMedia | null): bool {
  const offerDirection = om !== null ? om.direction : 'sendrecv';
  return !am.rejected && (offerDirection != 'sendrecv' || am.direction != 'sendrecv');
}

/** JSON of `sdpNegotiator.negotiate(offer, answer)` */
export function negotiateJson(offer: Sdp, answer: Sdp): string {
  const o = resolveSdp(offer);
  const a = resolveSdp(answer);
  const media = new Array<string>(a.media.length);
  let hold = false;
  for (let i = 0; i < a.media.length; i++) {
    const am = a.media[i];
    let om: ResolvedMedia | null = null;
    const mid = am.mid;
    if (mid !== null) {
      for (let j = 0; j < o.media.length; j++) {
        if (o.media[j].mid == mid) {
          om = o.media[j];
          break;
        }
      }
    }
    if (om === null && i < o.media.length) om = o.media[i];
    media[i] = negotiatedMediaJson(am, om);
    if (isHold(am, om)) hold = true;
  }
  return new JsonObject()
    .raw('bundle', strArray(a.bundle))
    .raw('hold', hold ? 'true' : 'false')
    .raw('media', jsonArray(media))
    .toString();
}

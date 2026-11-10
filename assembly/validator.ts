// Port of src/services/sdp-validator/index.ts.

import {CommonAttributes, MediaSection, Sdp} from './model';
import {isRtpProto} from './reader/lines';
import {fmtNum, present} from './util';

export class Issue {
  constructor(
    public severity: string,
    public code: string,
    public message: string,
    /** Index in `sdp.media`, -1 if the issue is not tied to a media section */
    public mediaIndex: i32 = -1,
    /** For `parse-error`: the parser's line number; -1 otherwise */
    public lineNumber: i32 = -1,
  ) {}
}

/** Payload types 0–34 are statically assigned by RFC 3551 and may be used without rtpmap */
const MAX_STATIC_PT: f64 = 34;

/** `/(^|\/)(D?TLS)(\/|$)/` */
function usesDtls(m: MediaSection): bool {
  const proto = m.proto;
  if (proto === null) {
    return false;
  }
  const parts = proto.split('/');
  return parts.includes('TLS') || parts.includes('DTLS');
}

/** Digest length in bytes (RFC 8122 §5, IANA "Hash Function Textual Names"); -1 if unknown */
function hashBytes(name: string): i32 {
  const n = asciiCase(name, false);
  if (n == 'md2' || n == 'md5') return 16;
  if (n == 'sha-1') return 20;
  if (n == 'sha-224') return 28;
  if (n == 'sha-256') return 32;
  if (n == 'sha-384') return 48;
  if (n == 'sha-512') return 64;
  return -1;
}

/**
 * ASCII-only case mapping. Equivalent to toUpperCase()/toLowerCase() here: it is applied to
 * hex pairs, and to hash names compared with ASCII names (no non-ASCII character lowercases
 * to one of their letters), and it keeps the Unicode case tables out of the module.
 */
export function asciiCase(s: string, upper: bool): string {
  let out = s;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (upper ? c >= 0x61 && c <= 0x7a : c >= 0x41 && c <= 0x5a) {
      if (out === s) {
        out = '';
        for (let j = 0; j < s.length; j++) {
          const d = s.charCodeAt(j);
          const conv = upper ? (d >= 0x61 && d <= 0x7a ? d - 32 : d) : (d >= 0x41 && d <= 0x5a ? d + 32 : d);
          out += String.fromCharCode(conv);
        }
      }
      break;
    }
  }
  return out;
}

function isHex(c: i32): bool {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
}

/** `/^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2})*$/` */
function isHexPairs(s: string): bool {
  if (s.length < 2 || (s.length + 1) % 3 != 0) {
    return false;
  }
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (i % 3 == 2 ? c != 0x3a : !isHex(c)) {
      return false;
    }
  }
  return true;
}

class Collector {
  issues: Issue[] = [];

  error(code: string, message: string, mediaIndex: i32 = -1): void {
    this.issues.push(new Issue('error', code, message, mediaIndex));
  }

  warning(code: string, message: string, mediaIndex: i32 = -1): void {
    this.issues.push(new Issue('warning', code, message, mediaIndex));
  }

  iceLength(ufrag: string | null, pwd: string | null, mediaIndex: i32 = -1): void {
    if (ufrag !== null && (ufrag.length < 4 || ufrag.length > 256)) {
      this.error('ice-ufrag-length', `ice-ufrag must be 4-256 characters, got ${ufrag.length} (RFC 8839 §5.4)`, mediaIndex);
    }
    if (pwd !== null && (pwd.length < 22 || pwd.length > 256)) {
      this.error('ice-pwd-length', `ice-pwd must be 22-256 characters, got ${pwd.length} (RFC 8839 §5.4)`, mediaIndex);
    }
  }

  fingerprints(section: CommonAttributes, mediaIndex: i32 = -1): void {
    const list = section.fingerprints;
    if (list === null) {
      return;
    }
    for (let i = 0; i < list.length; i++) {
      const hashFunction = list[i].hashFunction;
      const fingerprint = list[i].fingerprint;
      const bytes = hashBytes(hashFunction);
      const count = fingerprint.split(':').length;
      if (!isHexPairs(fingerprint)) {
        this.error('invalid-fingerprint', `a=fingerprint:${hashFunction} must be colon-separated hex pairs (RFC 8122 §5)`, mediaIndex);
      } else if (bytes != -1 && count != bytes) {
        this.error('invalid-fingerprint', `a=fingerprint:${hashFunction} has ${count} bytes, expected ${bytes} (RFC 8122 §5)`, mediaIndex);
      } else if (fingerprint != asciiCase(fingerprint, true)) {
        this.warning('fingerprint-not-uppercase', `a=fingerprint:${hashFunction} must use upper-case hex (RFC 8122 §5)`, mediaIndex);
      }
    }
  }
}

function hasRid(m: MediaSection, id: string, dir: string): bool {
  const rids = m.rids;
  if (rids === null) {
    return false;
  }
  for (let i = 0; i < rids.length; i++) {
    if (rids[i].id == id && rids[i].direction == dir) {
      return true;
    }
  }
  return false;
}

function hasPayloadType(m: MediaSection, pt: f64): bool {
  const codecs = m.codecs;
  if (codecs === null) {
    return false;
  }
  for (let i = 0; i < codecs.length; i++) {
    if (codecs[i].payloadType == pt) {
      return true;
    }
  }
  return false;
}

function hasSsrc(m: MediaSection, id: f64): bool {
  const ssrcs = m.ssrcs;
  if (ssrcs === null) {
    return false;
  }
  for (let i = 0; i < ssrcs.length; i++) {
    if (ssrcs[i].id == id) {
      return true;
    }
  }
  return false;
}

/**
 * Checks a parsed session description. `type` is '' (no offer/answer checks), 'offer'
 * or 'answer'. Media sections with port 0 are skipped by the ICE/DTLS checks.
 */
export function validate(sdp: Sdp, type: string): Issue[] {
  const c = new Collector();
  const media = sdp.media;

  // --- RFC 8866 §5: mandatory fields ---
  if (sdp.protocolVersion != 0) {
    c.error('invalid-version', `v= must be 0, got ${present(sdp.protocolVersion) ? fmtNum(sdp.protocolVersion) : 'undefined'}`);
  }
  if (sdp.origin === null) {
    c.error('missing-origin', 'o= is required');
  }
  const sessionName = sdp.sessionName;
  if (sessionName === null) {
    c.error('missing-session-name', 's= is required');
  } else if (sessionName.length == 0) {
    c.warning('empty-session-name', 's= must not be empty; use "s= " or "s=-" (RFC 8866 §5.3)');
  }
  const timing = sdp.timing;
  if (timing === null || timing.length == 0) {
    c.error('missing-timing', 'at least one t= line is required');
  }
  if (sdp.connectionInformation === null) {
    for (let i = 0; i < media.length; i++) {
      if (media[i].connectionInformation === null) {
        c.error('missing-connection', 'c= is required at session level or in every media description (RFC 8866 §5.7)', i);
      }
    }
  }

  // --- mid and groups (RFC 5888, RFC 9143) ---
  const mids: string[] = [];
  for (let i = 0; i < media.length; i++) {
    const mid = media[i].mid;
    if (mid === null) {
      continue;
    }
    if (mids.includes(mid)) {
      c.error('duplicate-mid', `a=mid:${mid} is used by more than one media description`, i);
    }
    mids.push(mid);
  }
  const groups = sdp.group;
  let bundle = false;
  if (groups !== null) {
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      for (let i = 0; i < group.mids.length; i++) {
        if (!mids.includes(group.mids[i])) {
          c.error('group-unknown-mid', `a=group:${group.semantics} references unknown mid "${group.mids[i]}"`);
        }
      }
      if (group.semantics == 'BUNDLE') {
        bundle = true;
      }
    }
  }
  if (bundle) {
    for (let i = 0; i < media.length; i++) {
      if (media[i].mid === null) {
        c.error('bundle-missing-mid', 'every media description needs a=mid when BUNDLE is used (RFC 9143)', i);
      }
    }
  }

  // --- ICE: used if any ICE attribute appears anywhere ---
  let usesIce = sdp.iceUfrag !== null || sdp.icePwd !== null || sdp.iceLite;
  for (let i = 0; i < media.length && !usesIce; i++) {
    const candidates = media[i].candidates;
    usesIce = media[i].iceUfrag !== null || media[i].icePwd !== null || (candidates !== null && candidates.length > 0);
  }
  c.iceLength(sdp.iceUfrag, sdp.icePwd);
  c.fingerprints(sdp);

  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    const active = m.port != 0;
    c.iceLength(m.iceUfrag, m.icePwd, i);
    c.fingerprints(m, i);
    if (usesIce && active) {
      if (m.iceUfrag === null && sdp.iceUfrag === null) {
        c.error('missing-ice-ufrag', 'a=ice-ufrag is required (RFC 8839 §5.4)', i);
      }
      if (m.icePwd === null && sdp.icePwd === null) {
        c.error('missing-ice-pwd', 'a=ice-pwd is required (RFC 8839 §5.4)', i);
      }
    }

    // --- DTLS (RFC 8122, RFC 8842) ---
    if (usesDtls(m) && active) {
      const mfp = m.fingerprints;
      const sfp = sdp.fingerprints;
      if ((mfp === null || mfp.length == 0) && (sfp === null || sfp.length == 0)) {
        c.error('missing-fingerprint', `a=fingerprint is required for ${m.proto!} (RFC 8842 §5.2, §5.3)`, i);
      }
      const setup = m.setup !== null ? m.setup : sdp.setup;
      if (setup === null) {
        c.error('missing-setup', `a=setup is required for ${m.proto!} (RFC 8842 §5.2, §5.3)`, i);
      } else if (type == 'answer' && setup == 'actpass') {
        c.error('setup-actpass-in-answer', 'an answer must use a=setup:active or a=setup:passive (RFC 5763 §5)', i);
      }
    }

    // --- RTP payload types ---
    const proto = m.proto;
    if (proto !== null && isRtpProto(proto)) {
      const codecs = m.codecs;
      if (codecs !== null) {
        for (let j = 0; j < codecs.length; j++) {
          if (codecs[j].payloadType > MAX_STATIC_PT && codecs[j].encodingName === null) {
            c.error('missing-rtpmap', `payload type ${fmtNum(codecs[j].payloadType)} is dynamic and needs a=rtpmap (RFC 8866 §6.6)`, i);
          }
        }
      }
      const attributes = m.attributes;
      if (attributes !== null) {
        for (let j = 0; j < attributes.length; j++) {
          const name = attributes[j].name;
          if (name == 'rtpmap' || name == 'fmtp' || name == 'rtcp-fb') {
            const value = attributes[j].value;
            c.warning('unknown-payload-type',
              `a=${name}:${value === null ? 'undefined' : value} refers to a payload type that is not in the m= line, or repeats`, i);
          }
        }
      }
    }

    // --- extmap (RFC 8285) ---
    const extmap = m.extmap;
    if (extmap !== null) {
      const ids: f64[] = [];
      for (let j = 0; j < extmap.length; j++) {
        const id = extmap[j].id;
        if (id < 1 || id == 15 || id > 255) {
          c.error('extmap-invalid-id', `extmap id ${fmtNum(id)} must be 1-14 or 16-255 (RFC 8285)`, i);
        }
        if (ids.includes(id)) {
          c.error('extmap-duplicate-id', `extmap id ${fmtNum(id)} is used more than once`, i);
        }
        ids.push(id);
      }
    }

    // --- rid / simulcast (RFC 8851, RFC 8853) ---
    const simulcast = m.simulcast;
    if (simulcast !== null) {
      for (let d = 0; d < 2; d++) {
        const dir = d == 0 ? 'send' : 'recv';
        const streams = d == 0 ? simulcast.send : simulcast.recv;
        if (streams === null) {
          continue;
        }
        for (let s = 0; s < streams.length; s++) {
          for (let r = 0; r < streams[s].length; r++) {
            const rid = streams[s][r].rid;
            if (!hasRid(m, rid, dir)) {
              c.error('simulcast-unknown-rid',
                `a=simulcast ${dir} references "${rid}" without a matching a=rid:${rid} ${dir} (RFC 8853 §5.1)`, i);
            }
          }
        }
      }
    }
    const rids = m.rids;
    if (rids !== null) {
      for (let j = 0; j < rids.length; j++) {
        const pts = rids[j].payloadTypes;
        if (pts === null) {
          continue;
        }
        for (let k = 0; k < pts.length; k++) {
          if (!hasPayloadType(m, pts[k])) {
            c.error('rid-unknown-payload-type',
              `a=rid:${rids[j].id} references payload type ${fmtNum(pts[k])} that is not in the m= line (RFC 8851)`, i);
          }
        }
      }
    }

    // --- ssrc-group (RFC 5576 §4.2) ---
    const ssrcGroups = m.ssrcGroups;
    if (ssrcGroups !== null) {
      for (let j = 0; j < ssrcGroups.length; j++) {
        const group = ssrcGroups[j];
        for (let k = 0; k < group.ssrcs.length; k++) {
          if (!hasSsrc(m, group.ssrcs[k])) {
            c.warning('ssrc-group-unknown-ssrc',
              `a=ssrc-group:${group.semantics} references ssrc ${fmtNum(group.ssrcs[k])} without an a=ssrc line`, i);
          }
        }
      }
    }
  }
  return c.issues;
}

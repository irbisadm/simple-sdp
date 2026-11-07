// Port of src/services/sdp-reader/lenient.ts. Keep the two in sync: the checks run in
// the same order as in the strict parser, so the first warning for a description that
// strict mode rejects carries the same line number and reason.
//
// This path must not trap for any input: every problem is returned as a value.

import {GenericAttribute, MediaSection, Origin, Sdp, Timing, Codec, Bandwidth} from '../model';
import {failed, isDigits, resetError, takeError} from '../util';
import {
  bLineParser, cLineParser, isRtpProto, kLineParser, mLineParser, oLineParser, rLineParser, tLineParser, zLineParser,
} from './lines';
import {aLineParser} from './attributes';
import {
  isRepeatable, MEDIA_LETTERS, ORDER_HINT_MEDIA, ORDER_HINT_SESSION, RANK_R, RANK_T, RANK_Z, SESSION_LETTERS,
} from './index';

export class Warning {
  constructor(
    public code: string,
    public reason: string,
    public lineNumber: i32,
    public line: string,
    public action: string,
  ) {}
}

export class LenientResult {
  constructor(public sdp: Sdp, public warnings: Warning[]) {}
}

const FREE_TEXT = 'siuep';
const FIRST_LINE = 'a session description must start with "v="';

/** Splits on CRLF, LF and a lone CR; drops the empty string after a final terminator */
function splitLines(sdp: string): string[] {
  const lines = new Array<string>(0);
  let start = 0;
  let i = 0;
  const n = sdp.length;
  while (i < n) {
    const c = sdp.charCodeAt(i);
    if (c == 0x0a || c == 0x0d) {
      lines.push(sdp.substring(start, i));
      if (c == 0x0d && i + 1 < n && sdp.charCodeAt(i + 1) == 0x0a) {
        i++;
      }
      start = i + 1;
    }
    i++;
  }
  lines.push(sdp.substring(start, n));
  if (lines[lines.length - 1].length == 0) {
    lines.pop();
  }
  return lines;
}

/** Removes trailing spaces and tabs */
function trimTrailing(line: string): string {
  let end = line.length;
  while (end > 0) {
    const c = line.charCodeAt(end - 1);
    if (c != 0x20 && c != 0x09) {
      break;
    }
    end--;
  }
  return line.substring(0, end);
}

function isTyped(line: string): bool {
  return line.length >= 2 && line.charCodeAt(1) == 0x3d;
}

function rankOf(type: string, inMedia: bool): i32 {
  return (inMedia ? MEDIA_LETTERS : SESSION_LETTERS).indexOf(type);
}

/** Per-line state: the line's warning, if any */
class LineState {
  warning: Warning | null = null;

  constructor(public warnings: Warning[], public lineNumber: i32, public raw: string) {}

  warn(code: string, reason: string, action: string): void {
    if (this.warning === null) {
      const w = new Warning(code, reason, this.lineNumber, this.raw, action);
      this.warning = w;
      this.warnings.push(w);
    }
  }

  /** Records what was done with the line; a warning already raised for it keeps its code */
  outcome(code: string, reason: string, action: string): void {
    const w = this.warning;
    if (w === null) {
      this.warn(code, reason, action);
    } else {
      w.action = action;
    }
  }

  finish(line: string): void {
    if (this.warning === null && line != this.raw) {
      this.warn('trailing-whitespace', 'trailing whitespace removed', 'repaired');
    }
  }
}

function pushGeneric(section: Sdp | null, media: MediaSection | null, value: string): void {
  const idx = value.indexOf(':');
  const attr = new GenericAttribute(idx == -1 ? value : value.substring(0, idx), idx == -1 ? null : value.substring(idx + 1));
  let list = media !== null ? media.attributes : section!.attributes;
  if (list === null) {
    list = new Array<GenericAttribute>(0);
    if (media !== null) {
      media.attributes = list;
    } else {
      section!.attributes = list;
    }
  }
  list.push(attr);
}

/** An `a=` line; a malformed or repeated typed attribute is kept as a generic attribute */
function attribute(session: Sdp | null, media: MediaSection | null, value: string, st: LineState): void {
  if (media !== null) {
    aLineParser(media, media, null, value);
  } else {
    aLineParser(session!, null, session, value);
  }
  if (failed()) {
    const reason = takeError();
    pushGeneric(session, media, value);
    st.outcome(reason.startsWith('duplicate a=') ? 'duplicate-attribute' : 'malformed-attribute', reason, 'generic-attribute');
  }
}

/** An `m=` line; a malformed one keeps what can be read */
function mediaSection(value: string, st: LineState): MediaSection {
  const parsed = mLineParser(value);
  if (!failed() && parsed !== null) {
    return parsed;
  }
  st.outcome('malformed-media', takeError(), 'kept');
  const parts = value.split(' ');
  const section = new MediaSection();
  section.type = parts[0];
  if (parts.length > 1) {
    const ports = parts[1].split('/');
    if (ports.length <= 2 && isDigits(ports[0])) {
      section.port = parseFloat(ports[0]);
    }
    if (ports.length == 2 && isDigits(ports[1])) {
      section.numberOfPorts = parseFloat(ports[1]);
    }
  }
  if (parts.length > 2) {
    const proto = parts[2];
    section.proto = proto;
    const fmt = parts.slice(3);
    if (isRtpProto(proto)) {
      const codecs = new Array<Codec>(0);
      let formats: string[] | null = null;
      for (let i = 0; i < fmt.length; i++) {
        const pt = fmt[i];
        if (isDigits(pt) && parseFloat(pt) <= 127) {
          const codec = new Codec();
          codec.payloadType = parseFloat(pt);
          codecs.push(codec);
        } else {
          if (formats === null) {
            formats = new Array<string>(0);
          }
          formats.push(pt);
        }
      }
      section.codecs = codecs;
      section.formats = formats;
    } else {
      section.formats = fmt;
    }
  }
  return section;
}

/**
 * Parses a session description without failing. Every deviation from RFC 8866 that the
 * strict `parse` rejects is reported as a warning; the model keeps what the text allows.
 */
export function parseLenient(sdp: string): LenientResult {
  resetError();
  const raws = splitLines(sdp);
  const lines = new Array<string>(raws.length);
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    lines[i] = isTyped(raw) && FREE_TEXT.includes(raw.charAt(0)) ? raw : trimTrailing(raw);
  }

  const session = new Sdp();
  const warnings = new Array<Warning>(0);
  let section: MediaSection | null = null;
  let timing: Timing | null = null;
  let rank: i32 = -1;
  let seen = '';
  let firstLineChecked = false;
  let lateVersion = false;

  let hasSessionVersion = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('m=')) {
      break;
    }
    if (line.startsWith('v=')) {
      hasSessionVersion = true;
      break;
    }
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const st = new LineState(warnings, idx + 1, raws[idx]);

    // --- syntax ---
    if (line.length == 0) {
      st.warn('empty-line', 'empty line', 'skipped');
      continue;
    }
    if (!isTyped(line)) {
      st.warn('malformed-line', 'expected "<type>=<value>"', 'skipped');
      continue;
    }
    const type = line.charAt(0);
    const value = line.substring(2);

    // --- first line ---
    if (!firstLineChecked) {
      firstLineChecked = true;
      if (type != 'v') {
        lateVersion = hasSessionVersion;
        const unknown = type != 'm' && !SESSION_LETTERS.includes(type);
        st.warn(hasSessionVersion ? 'version-not-first' : 'missing-version', FIRST_LINE, unknown ? 'skipped' : 'kept');
        if (unknown) {
          continue;
        }
      }
    }

    // --- type, scope, order, duplicates ---
    const inMedia = section !== null;
    let applyRank = true;
    if (type == 'm') {
      rank = 0;
      seen = '';
    } else {
      const lineRank = rankOf(type, inMedia);
      if (lineRank == -1) {
        if (SESSION_LETTERS.includes(type)) {
          st.warn('wrong-scope', `"${type}=" is not allowed in a media description`, 'skipped');
        } else {
          st.warn('unknown-line-type', `unknown line type "${type}"`, 'skipped');
        }
        continue;
      }
      if (!inMedia && type == 'v' && lateVersion && !seen.includes('v')) {
        lateVersion = false;
        applyRank = false;
      } else if (!inMedia && type == 't') {
        if (rank > RANK_Z) {
          st.warn('out-of-order', `"t=" must precede "k=" and "a=" (order: ${ORDER_HINT_SESSION})`, 'kept');
          applyRank = false;
        }
      } else if (!inMedia && (type == 'r' || type == 'z')) {
        if (rank != RANK_T && rank != RANK_R) {
          st.warn('out-of-order', `"${type}=" must follow "t=" or "r="`, 'kept');
          applyRank = false;
        }
      } else {
        const single = !isRepeatable(type, inMedia);
        const outOfOrder = `line is out of order (${inMedia ? 'media' : 'session'} order: ${inMedia ? ORDER_HINT_MEDIA : ORDER_HINT_SESSION})`;
        if (lineRank < rank) {
          if (single && seen.includes(type)) {
            st.warn('out-of-order', outOfOrder, 'first-kept');
            st.finish(line);
            continue;
          }
          st.warn('out-of-order', outOfOrder, 'kept');
          applyRank = false;
        } else if (single && seen.includes(type)) {
          st.warn('duplicate-line', inMedia && type == 'c'
            ? 'multiple "c=" lines in one media description are not supported'
            : `duplicate "${type}=" line`, 'first-kept');
          st.finish(line);
          continue;
        }
      }
    }

    // --- values ---
    let applied = false;
    if (section !== null && type != 'm') {
      const m: MediaSection = section;
      if (type == 'i') {
        m.information = value;
      } else if (type == 'c') {
        const c = cLineParser(value);
        if (!failed()) {
          m.connectionInformation = c;
        }
      } else if (type == 'b') {
        const b = bLineParser(value);
        if (!failed()) {
          let list = m.bandwidths;
          if (list === null) {
            list = new Array<Bandwidth>(0);
            m.bandwidths = list;
          }
          list.push(b!);
        }
      } else if (type == 'k') {
        const k = kLineParser(value);
        if (!failed()) {
          m.encryptionKey = k;
        }
      } else if (type == 'a') {
        attribute(null, m, value, st);
      }
      if (failed()) {
        st.outcome('malformed-value', takeError(), 'skipped');
      } else {
        applied = true;
      }
    } else if (type == 'v') {
      if (value == '0') {
        session.protocolVersion = 0;
        applied = true;
      } else if (isDigits(value)) {
        session.protocolVersion = parseFloat(value);
        st.outcome('unsupported-version', `unsupported protocol version "${value}"`, 'kept');
        applied = true;
      } else {
        st.outcome('malformed-value', `unsupported protocol version "${value}"`, 'skipped');
      }
    } else if (type == 'o') {
      const o = oLineParser(value);
      if (!failed()) {
        session.origin = o;
        applied = true;
      } else {
        const reason = takeError();
        const parts = value.split(' ');
        if (parts.length == 6) {
          const origin = new Origin();
          origin.username = parts[0];
          origin.sessId = parts[1];
          origin.sessVersion = parts[2];
          origin.netType = parts[3];
          origin.addrType = parts[4];
          origin.unicastAddress = parts[5];
          session.origin = origin;
          st.outcome('malformed-value', reason, 'kept');
          applied = true;
        } else {
          st.outcome('malformed-value', reason, 'skipped');
        }
      }
    } else if (type == 's') {
      session.sessionName = value;
      applied = true;
    } else if (type == 'i') {
      session.sessionInformation = value;
      applied = true;
    } else if (type == 'u') {
      session.uri = value;
      applied = true;
    } else if (type == 'e') {
      let list = session.emailAddresses;
      if (list === null) {
        list = new Array<string>(0);
        session.emailAddresses = list;
      }
      list.push(value);
      applied = true;
    } else if (type == 'p') {
      let list = session.phoneNumbers;
      if (list === null) {
        list = new Array<string>(0);
        session.phoneNumbers = list;
      }
      list.push(value);
      applied = true;
    } else if (type == 'c') {
      const c = cLineParser(value);
      if (!failed()) {
        session.connectionInformation = c;
        applied = true;
      }
    } else if (type == 'b') {
      const b = bLineParser(value);
      if (!failed()) {
        let list = session.bandwidths;
        if (list === null) {
          list = new Array<Bandwidth>(0);
          session.bandwidths = list;
        }
        list.push(b!);
        applied = true;
      }
    } else if (type == 't') {
      const t = tLineParser(value);
      if (!failed()) {
        timing = t;
        let list = session.timing;
        if (list === null) {
          list = new Array<Timing>(0);
          session.timing = list;
        }
        list.push(t!);
        applied = true;
      }
    } else if (type == 'r') {
      const r = rLineParser(value);
      if (!failed()) {
        if (timing !== null) {
          const t: Timing = timing;
          let list = t.repeat;
          if (list === null) {
            list = [];
            t.repeat = list;
          }
          list.push(r!);
          applied = true;
        } else {
          st.outcome('out-of-order', '"r=" must follow "t=" or "r="', 'skipped');
        }
      }
    } else if (type == 'z') {
      const z = zLineParser(value);
      if (!failed()) {
        if (timing === null) {
          st.outcome('out-of-order', '"z=" must follow "t=" or "r="', 'skipped');
        } else if (timing.zoneAdjustments !== null) {
          st.outcome('out-of-order', '"z=" must follow "t=" or "r="', 'first-kept');
        } else {
          timing.zoneAdjustments = z;
          applied = true;
        }
      }
    } else if (type == 'k') {
      const k = kLineParser(value);
      if (!failed()) {
        session.encryptionKey = k;
        applied = true;
      }
    } else if (type == 'a') {
      attribute(session, null, value, st);
      applied = true;
    } else if (type == 'm') {
      const m = mediaSection(value, st);
      section = m;
      session.media.push(m);
    }
    if (failed()) {
      st.outcome('malformed-value', takeError(), 'skipped');
    }
    if (applied && type != 'm') {
      seen += type;
      if (applyRank) {
        rank = rankOf(type, section !== null);
      }
    }
    st.finish(line);
  }

  // --- end of input ---
  if (!firstLineChecked) {
    warnings.push(new Warning('missing-version', 'missing mandatory "v=" line', 0, '', 'skipped'));
  }
  if (session.origin === null) {
    warnings.push(new Warning('missing-mandatory-line', 'missing mandatory "o=" line', 0, '', 'skipped'));
  }
  if (session.sessionName === null) {
    warnings.push(new Warning('missing-mandatory-line', 'missing mandatory "s=" line', 0, '', 'skipped'));
  }
  if (session.timing === null) {
    warnings.push(new Warning('missing-mandatory-line', 'missing mandatory "t=" line', 0, '', 'skipped'));
  }
  resetError();
  return new LenientResult(session, warnings);
}

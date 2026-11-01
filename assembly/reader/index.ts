// Port of src/services/sdp-reader/index.ts.

import {MediaSection, Sdp, Timing} from '../model';
import {failed, resetError, takeError} from '../util';
import {bLineParser, cLineParser, kLineParser, mLineParser, oLineParser, rLineParser, tLineParser, zLineParser} from './lines';
import {aLineParser} from './attributes';

/** Port of SdpParseError */
export class ParseError {
  constructor(public reason: string, public lineNumber: i32, public line: string) {}

  get message(): string {
    return this.lineNumber > 0 ? `SDP line ${this.lineNumber} "${this.line}": ${this.reason}` : `SDP: ${this.reason}`;
  }
}

/** The error of the last failed `parse()` */
export class LastParse {
  static error: ParseError | null = null;
}

const SESSION_LETTERS = 'vosiuepcbtrzka';
const MEDIA_LETTERS = 'micbka';
const RANK_T = 9;
const RANK_R = 10;
const RANK_Z = 11;
const ORDER_HINT_SESSION = 'v o s i u e p c b t r z k a';
const ORDER_HINT_MEDIA = 'm i c b k a';

function isRepeatable(type: string, media: bool): bool {
  return media ? type == 'b' || type == 'a' : type == 'e' || type == 'p' || type == 'b' || type == 'a';
}

function splitLines(sdp: string): string[] {
  const lines = sdp.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.endsWith('\r')) {
      lines[i] = line.slice(0, line.length - 1);
    }
  }
  if (lines.length > 0 && lines[lines.length - 1].length == 0) {
    lines.pop();
  }
  return lines;
}

/** Line order and line syntax (RFC 8866 §5). Returns the error reason, or null. */
function checkOrder(line: string, idx: i32, inMedia: bool, rank: i32): string | null {
  if (line.length == 0) {
    return 'empty line';
  }
  if (line.length < 2 || line.charAt(1) != '=') {
    return 'expected "<type>=<value>"';
  }
  const type = line.charAt(0);
  if (idx == 0 && type != 'v') {
    return 'a session description must start with "v="';
  }
  if (type == 'm') {
    return null;
  }
  const lineRank = (inMedia ? MEDIA_LETTERS : SESSION_LETTERS).indexOf(type);
  if (lineRank == -1) {
    return SESSION_LETTERS.includes(type)
      ? `"${type}=" is not allowed in a media description`
      : `unknown line type "${type}"`;
  }
  if (!inMedia && type == 't') {
    if (rank > RANK_Z) {
      return `"t=" must precede "k=" and "a=" (order: ${ORDER_HINT_SESSION})`;
    }
  } else if (!inMedia && (type == 'r' || type == 'z')) {
    if (rank != RANK_T && rank != RANK_R) {
      return `"${type}=" must follow "t=" or "r="`;
    }
  } else if (lineRank < rank) {
    return `line is out of order (${inMedia ? 'media' : 'session'} order: ${inMedia ? ORDER_HINT_MEDIA : ORDER_HINT_SESSION})`;
  } else if (lineRank == rank && !isRepeatable(type, inMedia)) {
    return inMedia && type == 'c'
      ? 'multiple "c=" lines in one media description are not supported'
      : `duplicate "${type}=" line`;
  }
  return null;
}

function lineRank(type: string, inMedia: bool): i32 {
  return type == 'm' ? 0 : (inMedia ? MEDIA_LETTERS : SESSION_LETTERS).indexOf(type);
}

/**
 * Parses a session description. Returns null on error; the error is in `LastParse.error`.
 * Lines may be terminated by CRLF or, leniently, by LF alone.
 */
export function parse(sdp: string): Sdp | null {
  resetError();
  LastParse.error = null;
  const lines = splitLines(sdp);
  const session = new Sdp();
  let section: MediaSection | null = null;
  let timing: Timing | null = null;
  let rank: i32 = -1;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const orderError = checkOrder(line, idx, section !== null, rank);
    if (orderError !== null) {
      LastParse.error = new ParseError(orderError, idx + 1, line);
      return null;
    }
    const type = line.charAt(0);
    const value = line.slice(2);
    rank = lineRank(type, section !== null);

    if (section !== null && type != 'm') {
      const m: MediaSection = section;
      if (type == 'i') {
        m.information = value;
      } else if (type == 'c') {
        m.connectionInformation = cLineParser(value);
      } else if (type == 'b') {
        const b = bLineParser(value);
        if (!failed()) {
          let list = m.bandwidths;
          if (list === null) {
            list = [];
            m.bandwidths = list;
          }
          list.push(b!);
        }
      } else if (type == 'k') {
        m.encryptionKey = kLineParser(value);
      } else if (type == 'a') {
        aLineParser(m, m, null, value);
      }
    } else if (type == 'v') {
      if (value != '0') {
        LastParse.error = new ParseError(`unsupported protocol version "${value}"`, idx + 1, line);
        return null;
      }
      session.protocolVersion = 0;
    } else if (type == 'o') {
      session.origin = oLineParser(value);
    } else if (type == 's') {
      session.sessionName = value;
    } else if (type == 'i') {
      session.sessionInformation = value;
    } else if (type == 'u') {
      session.uri = value;
    } else if (type == 'e') {
      let list = session.emailAddresses;
      if (list === null) {
        list = [];
        session.emailAddresses = list;
      }
      list.push(value);
    } else if (type == 'p') {
      let list = session.phoneNumbers;
      if (list === null) {
        list = [];
        session.phoneNumbers = list;
      }
      list.push(value);
    } else if (type == 'c') {
      session.connectionInformation = cLineParser(value);
    } else if (type == 'b') {
      const b = bLineParser(value);
      if (!failed()) {
        let list = session.bandwidths;
        if (list === null) {
          list = [];
          session.bandwidths = list;
        }
        list.push(b!);
      }
    } else if (type == 't') {
      timing = tLineParser(value);
      if (!failed()) {
        let list = session.timing;
        if (list === null) {
          list = [];
          session.timing = list;
        }
        list.push(timing!);
      }
    } else if (type == 'r') {
      const r = rLineParser(value);
      if (!failed()) {
        const t = timing!;
        let list = t.repeat;
        if (list === null) {
          list = [];
          t.repeat = list;
        }
        list.push(r!);
      }
    } else if (type == 'z') {
      const z = zLineParser(value);
      if (!failed()) {
        timing!.zoneAdjustments = z;
      }
    } else if (type == 'k') {
      session.encryptionKey = kLineParser(value);
    } else if (type == 'a') {
      aLineParser(session, null, session, value);
    } else if (type == 'm') {
      const m = mLineParser(value);
      if (!failed()) {
        section = m;
        session.media.push(m!);
      }
    }
    if (failed()) {
      LastParse.error = new ParseError(takeError(), idx + 1, line);
      return null;
    }
  }

  if (isNaN(session.protocolVersion)) {
    LastParse.error = new ParseError('missing mandatory "v=" line', 0, '');
  } else if (session.origin === null) {
    LastParse.error = new ParseError('missing mandatory "o=" line', 0, '');
  } else if (session.sessionName === null) {
    LastParse.error = new ParseError('missing mandatory "s=" line', 0, '');
  } else if (session.timing === null) {
    LastParse.error = new ParseError('missing mandatory "t=" line', 0, '');
  }
  return LastParse.error === null ? session : null;
}

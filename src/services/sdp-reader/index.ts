import {Sdp, SdpMediaSection, SdpTiming} from "../../interfaces/Sdp";
import {SdpParseError} from "../../errors";
import {oLineParser} from "./parsers/o-line.parser";
import {tLineParser} from "./parsers/t-line.parser";
import {rLineParser} from "./parsers/r-line.parser";
import {zLineParser} from "./parsers/z-line.parser";
import {kLineParser} from "./parsers/k-line.parser";
import {mLineParser} from "./parsers/m-line.parser";
import {bLineParser} from "./parsers/b-line.parser";
import {cLineParser} from "./parsers/c-line.parser";
import {aLineParser} from "./parsers/a-line.parser";

/**
 * Line order of RFC 8866 §5. Lines with the same rank may repeat only if listed in
 * the corresponding REPEATABLE set. `t=`/`r=`/`z=` (time descriptions) are handled separately.
 */
const SESSION_ORDER: Record<string, number> = {
  v: 0, o: 1, s: 2, i: 3, u: 4, e: 5, p: 6, c: 7, b: 8, t: 9, r: 10, z: 11, k: 12, a: 13,
};
const SESSION_REPEATABLE = new Set(['e', 'p', 'b', 'a']);
const MEDIA_ORDER: Record<string, number> = {m: 0, i: 1, c: 2, b: 3, k: 4, a: 5};
const MEDIA_REPEATABLE = new Set(['b', 'a']);

const ORDER_HINT = {
  session: 'v o s i u e p c b t r z k a',
  media: 'm i c b k a',
};

/**
 * Parses a session description.
 *
 * Lines may be terminated by CRLF or, leniently (RFC 8866 §5), by LF alone.
 *
 * @throws SdpParseError if the description violates RFC 8866: malformed or unknown
 *   line, wrong line order, missing mandatory line, malformed typed attribute.
 */
const parse = (sdp: string): Sdp => {
  const lines = sdp.split(/\r?\n/);
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  const session: Partial<Sdp> & { media: SdpMediaSection[] } = {media: []};
  let section: SdpMediaSection | null = null;
  let timing: SdpTiming | null = null;
  let rank = -1;

  lines.forEach((line, idx) => {
    const fail = (reason: string): never => {
      throw new SdpParseError(reason, idx + 1, line);
    };
    if (line.length === 0) {
      fail('empty line');
    }
    if (line.length < 2 || line[1] !== '=') {
      fail('expected "<type>=<value>"');
    }
    const type = line[0];
    const value = line.slice(2);
    if (idx === 0 && type !== 'v') {
      fail('a session description must start with "v="');
    }

    // --- line order (RFC 8866 §5) ---
    if (type === 'm') {
      rank = 0;
    } else {
      const scope = section ? 'media' : 'session';
      const order = section ? MEDIA_ORDER : SESSION_ORDER;
      const repeatable = section ? MEDIA_REPEATABLE : SESSION_REPEATABLE;
      const lineRank = order[type];
      if (lineRank === undefined) {
        fail(type in SESSION_ORDER
          ? `"${type}=" is not allowed in a media description`
          : `unknown line type "${type}"`);
      }
      if (!section && type === 't') {
        if (rank > SESSION_ORDER.z) {
          fail(`"t=" must precede "k=" and "a=" (order: ${ORDER_HINT.session})`);
        }
      } else if (!section && (type === 'r' || type === 'z')) {
        if (rank !== SESSION_ORDER.t && rank !== SESSION_ORDER.r) {
          fail(`"${type}=" must follow "t=" or "r="`);
        }
      } else if (lineRank < rank) {
        fail(`line is out of order (${scope} order: ${ORDER_HINT[scope]})`);
      } else if (lineRank === rank && !repeatable.has(type)) {
        fail(section && type === 'c'
          ? 'multiple "c=" lines in one media description are not supported'
          : `duplicate "${type}=" line`);
      }
      rank = lineRank;
    }

    // --- content ---
    try {
      if (section) {
        switch (type) {
          case 'i':
            section.information = value;
            break;
          case 'c':
            section.connectionInformation = cLineParser(value);
            break;
          case 'b':
            (section.bandwidths ??= []).push(bLineParser(value));
            break;
          case 'k':
            section.encryptionKey = kLineParser(value);
            break;
          case 'a':
            aLineParser(section, 'media', value);
            break;
        }
        if (type !== 'm') {
          return;
        }
      }
      switch (type) {
        case 'v':
          if (value !== '0') {
            fail(`unsupported protocol version "${value}"`);
          }
          session.protocolVersion = 0;
          break;
        case 'o':
          session.origin = oLineParser(value);
          break;
        case 's':
          session.sessionName = value;
          break;
        case 'i':
          session.sessionInformation = value;
          break;
        case 'u':
          session.uri = value;
          break;
        case 'e':
          (session.emailAddresses ??= []).push(value);
          break;
        case 'p':
          (session.phoneNumbers ??= []).push(value);
          break;
        case 'c':
          session.connectionInformation = cLineParser(value);
          break;
        case 'b':
          (session.bandwidths ??= []).push(bLineParser(value));
          break;
        case 't':
          timing = tLineParser(value);
          (session.timing ??= []).push(timing);
          break;
        case 'r':
          (timing!.repeat ??= []).push(rLineParser(value));
          break;
        case 'z':
          timing!.zoneAdjustments = zLineParser(value);
          break;
        case 'k':
          session.encryptionKey = kLineParser(value);
          break;
        case 'a':
          aLineParser(session as Sdp, 'session', value);
          break;
        case 'm':
          section = mLineParser(value);
          session.media.push(section);
          break;
      }
    } catch (e) {
      if (e instanceof SdpParseError) {
        throw e;
      }
      fail((e as Error).message);
    }
  });

  for (const [field, letter] of [['protocolVersion', 'v'], ['origin', 'o'], ['sessionName', 's'], ['timing', 't']] as const) {
    if (session[field] === undefined) {
      throw new SdpParseError(`missing mandatory "${letter}=" line`, 0, '');
    }
  }
  return session as Sdp;
}

/** Returns true if {@link parse} accepts the description. */
const isValid = (sdp: string, writeLog = false): boolean => {
  try {
    parse(sdp);
    return true;
  } catch (e) {
    if (writeLog) {
      console.error(e);
    }
    return false
  }
}

const sdpReader = {
  parse,
  isValid
}

export {sdpReader}

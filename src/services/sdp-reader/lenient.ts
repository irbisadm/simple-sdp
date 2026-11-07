import {
  Sdp,
  SdpLenient,
  SdpLenientMediaSection,
  SdpLenientResult,
  SdpParseWarning,
  SdpParseWarningAction,
  SdpParseWarningCode,
  SdpTiming,
} from "../../interfaces/Sdp";
import {oLineParser} from "./parsers/o-line.parser";
import {tLineParser} from "./parsers/t-line.parser";
import {rLineParser} from "./parsers/r-line.parser";
import {zLineParser} from "./parsers/z-line.parser";
import {kLineParser} from "./parsers/k-line.parser";
import {isRtpProto, mLineParser} from "./parsers/m-line.parser";
import {bLineParser} from "./parsers/b-line.parser";
import {cLineParser} from "./parsers/c-line.parser";
import {aLineParser} from "./parsers/a-line.parser";
import {MEDIA_ORDER, MEDIA_REPEATABLE, ORDER_HINT, SESSION_ORDER, SESSION_REPEATABLE} from "./order";

// Lenient parsing. The checks run in the same order as in the strict `parse` (index.ts),
// so the first warning for a description that strict mode rejects carries the same line
// number and reason. Keep this file and assembly/reader/lenient.ts in sync.

/** Free-text lines whose trailing whitespace is kept */
const FREE_TEXT = 'siuep';
const RANK_T = SESSION_ORDER.t;
const RANK_R = SESSION_ORDER.r;
const RANK_Z = SESSION_ORDER.z;
const FIRST_LINE = 'a session description must start with "v="';

/** Splits on CRLF, LF and a lone CR; drops the empty string after a final terminator */
const splitLines = (sdp: string): string[] => {
  const lines = sdp.split(/\r\n|\n|\r/);
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/** Removes trailing spaces and tabs (not other whitespace, unlike `trimEnd`) */
const trimTrailing = (line: string): string => {
  let end = line.length;
  while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) {
    end--;
  }
  return line.slice(0, end);
}

const isTyped = (line: string) => line.length >= 2 && line[1] === '=';

const errorMessage = (e: unknown): string => (e as Error).message;

/**
 * Parses a session description without throwing. Every deviation from RFC 8866 that
 * {@link parse} rejects is reported as a warning, and the model keeps what the text allows.
 */
export const parseLenient = (sdp: string): SdpLenientResult => {
  const raws = splitLines(String(sdp));
  const lines = raws.map(raw => isTyped(raw) && FREE_TEXT.includes(raw[0]) ? raw : trimTrailing(raw));

  const session: SdpLenient = {media: []};
  const warnings: SdpParseWarning[] = [];
  let section: SdpLenientMediaSection | null = null;
  let timing: SdpTiming | null = null;
  let rank = -1;
  let seen = new Set<string>();
  let firstLineChecked = false;
  /** A `v=` exists before the first `m=` but not on the first line: it is exempt from the order check */
  let lateVersion = false;

  // Look-ahead for the first-line rule: is there a v= in the session part?
  let hasSessionVersion = false;
  for (const line of lines) {
    if (line.startsWith('m=')) {
      break;
    }
    if (line.startsWith('v=')) {
      hasSessionVersion = true;
      break;
    }
  }

  lines.forEach((line, idx) => {
    const raw = raws[idx];
    const lineNumber = idx + 1;
    let warning: SdpParseWarning | null = null;
    const warn = (code: SdpParseWarningCode, reason: string, action: SdpParseWarningAction): void => {
      if (warning === null) {
        warning = {code, reason, lineNumber, line: raw, action};
        warnings.push(warning);
      }
    };
    /** Records what was done with the line; the warning already raised for it keeps its code */
    const outcome = (code: SdpParseWarningCode, reason: string, action: SdpParseWarningAction): void => {
      if (warning === null) {
        warn(code, reason, action);
      } else {
        warning.action = action;
      }
    };
    const finish = () => {
      if (warning === null && line !== raw) {
        warn('trailing-whitespace', 'trailing whitespace removed', 'repaired');
      }
    };

    // --- syntax ---
    if (line.length === 0) {
      warn('empty-line', 'empty line', 'skipped');
      return;
    }
    if (!isTyped(line)) {
      warn('malformed-line', 'expected "<type>=<value>"', 'skipped');
      return;
    }
    const type = line[0];
    const value = line.slice(2);

    // --- first line ---
    if (!firstLineChecked) {
      firstLineChecked = true;
      if (type !== 'v') {
        lateVersion = hasSessionVersion;
        const unknown = type !== 'm' && !(type in SESSION_ORDER);
        warn(hasSessionVersion ? 'version-not-first' : 'missing-version', FIRST_LINE, unknown ? 'skipped' : 'kept');
        if (unknown) {
          return;
        }
      }
    }

    // --- type, scope, order, duplicates ---
    let applyRank = true;
    if (type === 'm') {
      rank = 0;
      seen = new Set<string>();
    } else {
      const scope = section ? 'media' : 'session';
      const order = section ? MEDIA_ORDER : SESSION_ORDER;
      const repeatable = section ? MEDIA_REPEATABLE : SESSION_REPEATABLE;
      const lineRank = order[type];
      if (lineRank === undefined) {
        if (type in SESSION_ORDER) {
          warn('wrong-scope', `"${type}=" is not allowed in a media description`, 'skipped');
        } else {
          warn('unknown-line-type', `unknown line type "${type}"`, 'skipped');
        }
        return;
      }
      if (!section && type === 'v' && lateVersion && !seen.has('v')) {
        // The position problem is already reported on the first line
        lateVersion = false;
        applyRank = false;
      } else if (!section && type === 't') {
        if (rank > RANK_Z) {
          warn('out-of-order', `"t=" must precede "k=" and "a=" (order: ${ORDER_HINT.session})`, 'kept');
          applyRank = false;
        }
      } else if (!section && (type === 'r' || type === 'z')) {
        if (rank !== RANK_T && rank !== RANK_R) {
          warn('out-of-order', `"${type}=" must follow "t=" or "r="`, 'kept');
          applyRank = false;
        }
      } else {
        const single = !repeatable.has(type);
        if (lineRank < rank) {
          if (single && seen.has(type)) {
            warn('out-of-order', `line is out of order (${scope} order: ${ORDER_HINT[scope]})`, 'first-kept');
            finish();
            return;
          }
          warn('out-of-order', `line is out of order (${scope} order: ${ORDER_HINT[scope]})`, 'kept');
          applyRank = false;
        } else if (single && seen.has(type)) {
          warn('duplicate-line', section && type === 'c'
            ? 'multiple "c=" lines in one media description are not supported'
            : `duplicate "${type}=" line`, 'first-kept');
          finish();
          return;
        }
      }
    }

    // --- values ---
    /** Marks the line as applied: it takes part in the order and duplicate checks from now on */
    const applied = () => {
      if (type === 'm') {
        return;
      }
      seen.add(type);
      if (applyRank) {
        rank = (section ? MEDIA_ORDER : SESSION_ORDER)[type];
      }
    };
    const malformed = (e: unknown) => outcome('malformed-value', errorMessage(e), 'skipped');

    if (section && type !== 'm') {
      const m = section;
      try {
        switch (type) {
          case 'i':
            m.information = value;
            break;
          case 'c':
            m.connectionInformation = cLineParser(value);
            break;
          case 'b': {
            const bandwidth = bLineParser(value); // before `??=`: a failure must not leave []
            (m.bandwidths ??= []).push(bandwidth);
            break;
          }
          case 'k':
            m.encryptionKey = kLineParser(value);
            break;
          case 'a':
            attribute(m, 'media', value, outcome);
            break;
        }
        applied();
      } catch (e) {
        malformed(e);
      }
      finish();
      return;
    }

    switch (type) {
      case 'v':
        if (value === '0') {
          session.protocolVersion = 0;
          applied();
        } else if (/^\d+$/.test(value)) {
          session.protocolVersion = parseInt(value, 10);
          outcome('unsupported-version', `unsupported protocol version "${value}"`, 'kept');
          applied();
        } else {
          outcome('malformed-value', `unsupported protocol version "${value}"`, 'skipped');
        }
        break;
      case 'o':
        try {
          session.origin = oLineParser(value);
          applied();
        } catch (e) {
          const parts = value.split(' ');
          if (parts.length === 6) {
            // Keep the fields as text, e.g. a non-numeric sess-id
            const [username, sessId, sessVersion, netType, addrType, unicastAddress] = parts;
            session.origin = {username, sessId, sessVersion, netType, addrType, unicastAddress};
            outcome('malformed-value', errorMessage(e), 'kept');
            applied();
          } else {
            malformed(e);
          }
        }
        break;
      case 's':
        session.sessionName = value;
        applied();
        break;
      case 'i':
        session.sessionInformation = value;
        applied();
        break;
      case 'u':
        session.uri = value;
        applied();
        break;
      case 'e':
        (session.emailAddresses ??= []).push(value);
        applied();
        break;
      case 'p':
        (session.phoneNumbers ??= []).push(value);
        applied();
        break;
      case 'c':
        try {
          session.connectionInformation = cLineParser(value);
          applied();
        } catch (e) {
          malformed(e);
        }
        break;
      case 'b':
        try {
          const bandwidth = bLineParser(value); // before `??=`: a failure must not leave []
          (session.bandwidths ??= []).push(bandwidth);
          applied();
        } catch (e) {
          malformed(e);
        }
        break;
      case 't':
        try {
          timing = tLineParser(value);
          (session.timing ??= []).push(timing);
          applied();
        } catch (e) {
          malformed(e);
        }
        break;
      case 'r':
        try {
          const repeat = rLineParser(value);
          if (timing) {
            (timing.repeat ??= []).push(repeat);
            applied();
          } else {
            outcome('out-of-order', '"r=" must follow "t=" or "r="', 'skipped');
          }
        } catch (e) {
          malformed(e);
        }
        break;
      case 'z':
        try {
          const zones = zLineParser(value);
          if (!timing) {
            outcome('out-of-order', '"z=" must follow "t=" or "r="', 'skipped');
          } else if (timing.zoneAdjustments !== undefined) {
            outcome('out-of-order', '"z=" must follow "t=" or "r="', 'first-kept');
          } else {
            timing.zoneAdjustments = zones;
            applied();
          }
        } catch (e) {
          malformed(e);
        }
        break;
      case 'k':
        try {
          session.encryptionKey = kLineParser(value);
          applied();
        } catch (e) {
          malformed(e);
        }
        break;
      case 'a':
        attribute(session, 'session', value, outcome);
        applied();
        break;
      case 'm':
        section = mediaSection(value, outcome);
        session.media.push(section);
        break;
    }
    finish();
  });

  // --- end of input ---
  if (!firstLineChecked) {
    warnings.push({code: 'missing-version', reason: 'missing mandatory "v=" line', lineNumber: 0, line: '', action: 'skipped'});
  }
  for (const [field, letter] of [['origin', 'o'], ['sessionName', 's'], ['timing', 't']] as const) {
    if (session[field] === undefined) {
      warnings.push({
        code: 'missing-mandatory-line',
        reason: `missing mandatory "${letter}=" line`,
        lineNumber: 0,
        line: '',
        action: 'skipped',
      });
    }
  }
  return {sdp: session, warnings};
}

type Outcome = (code: SdpParseWarningCode, reason: string, action: SdpParseWarningAction) => void;

/** An `a=` line; a malformed or repeated typed attribute is kept as a generic attribute */
const attribute = (section: SdpLenient | SdpLenientMediaSection, scope: 'session' | 'media', value: string, outcome: Outcome) => {
  try {
    aLineParser(section as any, scope, value);
  } catch (e) {
    const reason = errorMessage(e);
    const idx = value.indexOf(':');
    const name = idx === -1 ? value : value.slice(0, idx);
    (section.attributes ??= []).push(idx === -1 ? {name} : {name, value: value.slice(idx + 1)});
    outcome(reason.startsWith('duplicate a=') ? 'duplicate-attribute' : 'malformed-attribute', reason, 'generic-attribute');
  }
}

/** An `m=` line; a malformed one keeps what can be read */
const mediaSection = (value: string, outcome: Outcome): SdpLenientMediaSection => {
  try {
    return mLineParser(value);
  } catch (e) {
    outcome('malformed-media', errorMessage(e), 'kept');
  }
  const [type, portPart, proto, ...fmt] = value.split(' ');
  const section: SdpLenientMediaSection = {type};
  if (portPart !== undefined) {
    const ports = portPart.split('/');
    if (ports.length <= 2 && /^\d+$/.test(ports[0])) {
      section.port = parseInt(ports[0], 10);
    }
    if (ports.length === 2 && /^\d+$/.test(ports[1])) {
      section.numberOfPorts = parseInt(ports[1], 10);
    }
  }
  if (proto !== undefined) {
    section.proto = proto;
    if (isRtpProto(proto)) {
      section.codecs = [];
      for (const pt of fmt) {
        if (/^\d+$/.test(pt) && parseInt(pt, 10) <= 127) {
          section.codecs.push({payloadType: parseInt(pt, 10)});
        } else {
          (section.formats ??= []).push(pt);
        }
      }
    } else {
      section.formats = fmt;
    }
  }
  return section;
}

/** True if the lenient model has every mandatory field, i.e. it is a valid {@link Sdp} */
export const isComplete = (sdp: SdpLenient | Sdp): sdp is Sdp =>
  sdp.protocolVersion !== undefined && sdp.origin !== undefined && sdp.sessionName !== undefined &&
  sdp.timing !== undefined && sdp.timing.length > 0 &&
  sdp.media.every(m => m.port !== undefined && m.proto !== undefined);

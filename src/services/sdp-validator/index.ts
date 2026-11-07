import {Sdp, SdpCommonAttributes, SdpLenient, SdpLenientMediaSection, SdpMediaSection, SdpParseWarningCode} from "../../interfaces/Sdp";
import {SdpParseError} from "../../errors";
import {sdpReader} from "../sdp-reader";
import {isRtpProto} from "../sdp-reader/parsers/m-line.parser";
import {own} from "../sdp-reader/parsers/a-line.parser/helpers";

type SdpIssueCode =
  | 'parse-error'
  | 'invalid-version'
  | 'missing-origin'
  | 'missing-session-name'
  | 'empty-session-name'
  | 'missing-timing'
  | 'missing-connection'
  | 'duplicate-mid'
  | 'bundle-missing-mid'
  | 'group-unknown-mid'
  | 'missing-rtpmap'
  | 'unknown-payload-type'
  | 'missing-fingerprint'
  | 'invalid-fingerprint'
  | 'fingerprint-not-uppercase'
  | 'missing-setup'
  | 'setup-actpass-in-answer'
  | 'missing-ice-ufrag'
  | 'missing-ice-pwd'
  | 'ice-ufrag-length'
  | 'ice-pwd-length'
  | 'extmap-invalid-id'
  | 'extmap-duplicate-id'
  | 'simulcast-unknown-rid'
  | 'rid-unknown-payload-type'
  | 'ssrc-group-unknown-ssrc'
  /** A warning of `sdpReader.parseLenient`, reported with the `lenient` option */
  | `lenient:${SdpParseWarningCode}`;

interface SdpIssue {
  severity: 'error' | 'warning';
  code: SdpIssueCode;
  message: string;
  /** Index in `sdp.media`, if the issue belongs to a media section */
  mediaIndex?: number;
  /** For `parse-error` and `lenient:*`: the line number reported by the parser (0 if not tied to a line) */
  lineNumber?: number;
}

interface SdpValidateOptions {
  /** Enables offer/answer specific checks, e.g. `a=setup:actpass` is not allowed in an answer */
  type?: 'offer' | 'answer';
  /**
   * Parses a string with `sdpReader.parseLenient` instead of `sdpReader.parse`: every
   * parse warning becomes a `lenient:<code>` issue with severity `warning`, and the
   * other checks run on the recovered model.
   */
  lenient?: boolean;
}

/** Payload types 0–34 are statically assigned by RFC 3551 and may be used without rtpmap */
const MAX_STATIC_PT = 34;

const usesDtls = (m: SdpMediaSection | SdpLenientMediaSection) => /(^|\/)(D?TLS)(\/|$)/.test(m.proto ?? '');

/** Digest length in bytes of the hash functions of the IANA "Hash Function Textual Names" registry (RFC 8122 §5) */
const HASH_BYTES: Record<string, number> = {
  'md2': 16, 'md5': 16, 'sha-1': 20, 'sha-224': 28, 'sha-256': 32, 'sha-384': 48, 'sha-512': 64,
};
const HEX_PAIRS = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2})*$/;

/**
 * Checks a session description against RFC 8866 and the WebRTC SDP rules most often
 * violated in practice (RFC 8829, 8839, 8842, 8843, 8851, 8853).
 *
 * A string is parsed first; a parse failure is reported as a single `parse-error` issue
 * (this covers the line-order and mandatory-line rules of RFC 8866 §5). With
 * `{lenient: true}` the string is parsed with `sdpReader.parseLenient` instead: each parse
 * warning becomes a `lenient:<code>` warning issue and the other checks run on the model.
 * Media sections with port 0 (rejected or bundle-only) are skipped by the ICE/DTLS checks.
 *
 * @returns the issues found, empty if none
 */
const validate = (input: Sdp | SdpLenient | string, options: SdpValidateOptions = {}): SdpIssue[] => {
  let sdp: Sdp | SdpLenient;
  const issues: SdpIssue[] = [];
  if (typeof input === 'string' && options.lenient) {
    const result = sdpReader.parseLenient(input);
    for (const w of result.warnings) {
      issues.push({
        severity: 'warning',
        code: `lenient:${w.code}`,
        message: new SdpParseError(w.reason, w.lineNumber, w.line).message,
        lineNumber: w.lineNumber,
      });
    }
    sdp = result.sdp;
  } else if (typeof input === 'string') {
    try {
      sdp = sdpReader.parse(input);
    } catch (e) {
      if (e instanceof SdpParseError) {
        return [{severity: 'error', code: 'parse-error', message: e.message, lineNumber: e.lineNumber}];
      }
      throw e;
    }
  } else {
    sdp = input;
  }

  const error = (code: SdpIssueCode, message: string, mediaIndex?: number) =>
    issues.push(mediaIndex === undefined ? {severity: 'error', code, message} : {severity: 'error', code, message, mediaIndex});
  const warning = (code: SdpIssueCode, message: string, mediaIndex?: number) =>
    issues.push(mediaIndex === undefined ? {severity: 'warning', code, message} : {severity: 'warning', code, message, mediaIndex});
  const media = sdp.media ?? [];

  // --- RFC 8866 §5: mandatory fields ---
  if (sdp.protocolVersion !== 0) {
    error('invalid-version', `v= must be 0, got ${sdp.protocolVersion}`);
  }
  if (!sdp.origin) {
    error('missing-origin', 'o= is required');
  }
  if (sdp.sessionName === undefined) {
    error('missing-session-name', 's= is required');
  } else if (sdp.sessionName === '') {
    warning('empty-session-name', 's= must not be empty; use "s= " or "s=-" (RFC 8866 §5.3)');
  }
  if (!sdp.timing?.length) {
    error('missing-timing', 'at least one t= line is required');
  }
  if (!sdp.connectionInformation) {
    media.forEach((m, i) => {
      if (!m.connectionInformation) {
        error('missing-connection', 'c= is required at session level or in every media description (RFC 8866 §5.7)', i);
      }
    });
  }

  // --- mid and groups (RFC 5888, RFC 9143) ---
  const mids = new Set<string>();
  media.forEach((m, i) => {
    if (m.mid === undefined) {
      return;
    }
    if (mids.has(m.mid)) {
      error('duplicate-mid', `a=mid:${m.mid} is used by more than one media description`, i);
    }
    mids.add(m.mid);
  });
  for (const group of sdp.group ?? []) {
    for (const mid of group.mids) {
      if (!mids.has(mid)) {
        error('group-unknown-mid', `a=group:${group.semantics} references unknown mid "${mid}"`);
      }
    }
  }
  if (sdp.group?.some(g => g.semantics === 'BUNDLE')) {
    media.forEach((m, i) => {
      if (m.mid === undefined) {
        error('bundle-missing-mid', 'every media description needs a=mid when BUNDLE is used (RFC 9143)', i);
      }
    });
  }

  // --- ICE: used if any ICE attribute appears anywhere ---
  const usesIce = sdp.iceUfrag !== undefined || sdp.icePwd !== undefined || sdp.iceLite ||
    media.some(m => m.iceUfrag !== undefined || m.icePwd !== undefined || m.candidates?.length);
  const checkIceLength = (ufrag: string | undefined, pwd: string | undefined, mediaIndex?: number) => {
    if (ufrag !== undefined && (ufrag.length < 4 || ufrag.length > 256)) {
      error('ice-ufrag-length', `ice-ufrag must be 4-256 characters, got ${ufrag.length} (RFC 8839 §5.4)`, mediaIndex);
    }
    if (pwd !== undefined && (pwd.length < 22 || pwd.length > 256)) {
      error('ice-pwd-length', `ice-pwd must be 22-256 characters, got ${pwd.length} (RFC 8839 §5.4)`, mediaIndex);
    }
  };
  checkIceLength(sdp.iceUfrag, sdp.icePwd);

  // --- a=fingerprint format (RFC 8122 §5): 2UHEX *(":" 2UHEX), digest length of the hash ---
  const checkFingerprints = (section: SdpCommonAttributes, mediaIndex?: number) => {
    for (const {hashFunction, fingerprint} of section.fingerprints ?? []) {
      const bytes = own(HASH_BYTES, hashFunction.toLowerCase());
      if (!HEX_PAIRS.test(fingerprint)) {
        error('invalid-fingerprint', `a=fingerprint:${hashFunction} must be colon-separated hex pairs (RFC 8122 §5)`, mediaIndex);
      } else if (bytes !== undefined && fingerprint.split(':').length !== bytes) {
        error('invalid-fingerprint',
          `a=fingerprint:${hashFunction} has ${fingerprint.split(':').length} bytes, expected ${bytes} (RFC 8122 §5)`, mediaIndex);
      } else if (fingerprint !== fingerprint.toUpperCase()) {
        warning('fingerprint-not-uppercase', `a=fingerprint:${hashFunction} must use upper-case hex (RFC 8122 §5)`, mediaIndex);
      }
    }
  };
  checkFingerprints(sdp);

  media.forEach((m, i) => {
    const active = m.port !== 0;
    checkIceLength(m.iceUfrag, m.icePwd, i);
    checkFingerprints(m, i);
    if (usesIce && active) {
      if ((m.iceUfrag ?? sdp.iceUfrag) === undefined) {
        error('missing-ice-ufrag', 'a=ice-ufrag is required (RFC 8839 §5.4)', i);
      }
      if ((m.icePwd ?? sdp.icePwd) === undefined) {
        error('missing-ice-pwd', 'a=ice-pwd is required (RFC 8839 §5.4)', i);
      }
    }

    // --- DTLS (RFC 8122, RFC 8842) ---
    if (usesDtls(m) && active) {
      if (!m.fingerprints?.length && !sdp.fingerprints?.length) {
        error('missing-fingerprint', `a=fingerprint is required for ${m.proto} (RFC 8842 §5.2, §5.3)`, i);
      }
      const setup = m.setup ?? sdp.setup;
      if (setup === undefined) {
        error('missing-setup', `a=setup is required for ${m.proto} (RFC 8842 §5.2, §5.3)`, i);
      } else if (options.type === 'answer' && setup === 'actpass') {
        error('setup-actpass-in-answer', 'an answer must use a=setup:active or a=setup:passive (RFC 5763 §5)', i);
      }
    }

    // --- RTP payload types ---
    if (isRtpProto(m.proto ?? '')) {
      for (const codec of m.codecs ?? []) {
        if (codec.payloadType > MAX_STATIC_PT && codec.encodingName === undefined) {
          error('missing-rtpmap', `payload type ${codec.payloadType} is dynamic and needs a=rtpmap (RFC 8866 §6.6)`, i);
        }
      }
      for (const attr of m.attributes ?? []) {
        if (attr.name === 'rtpmap' || attr.name === 'fmtp' || attr.name === 'rtcp-fb') {
          warning('unknown-payload-type', `a=${attr.name}:${attr.value} refers to a payload type that is not in the m= line, or repeats`, i);
        }
      }
    }

    // --- extmap (RFC 8285) ---
    const ids = new Set<number>();
    for (const ext of m.extmap ?? []) {
      if (ext.id < 1 || ext.id === 15 || ext.id > 255) {
        error('extmap-invalid-id', `extmap id ${ext.id} must be 1-14 or 16-255 (RFC 8285)`, i);
      }
      if (ids.has(ext.id)) {
        error('extmap-duplicate-id', `extmap id ${ext.id} is used more than once`, i);
      }
      ids.add(ext.id);
    }

    // --- rid / simulcast (RFC 8851, RFC 8853) ---
    for (const dir of ['send', 'recv'] as const) {
      for (const rid of (m.simulcast?.[dir] ?? []).flat()) {
        if (!m.rids?.some(r => r.id === rid.rid && r.direction === dir)) {
          error('simulcast-unknown-rid', `a=simulcast ${dir} references "${rid.rid}" without a matching a=rid:${rid.rid} ${dir} (RFC 8853 §5.1)`, i);
        }
      }
    }
    for (const rid of m.rids ?? []) {
      for (const pt of rid.payloadTypes ?? []) {
        if (!m.codecs?.some(c => c.payloadType === pt)) {
          error('rid-unknown-payload-type', `a=rid:${rid.id} references payload type ${pt} that is not in the m= line (RFC 8851)`, i);
        }
      }
    }

    // --- ssrc-group (RFC 5576 §4.2) ---
    for (const group of m.ssrcGroups ?? []) {
      for (const ssrc of group.ssrcs) {
        if (!m.ssrcs?.some(s => s.id === ssrc)) {
          warning('ssrc-group-unknown-ssrc', `a=ssrc-group:${group.semantics} references ssrc ${ssrc} without an a=ssrc line`, i);
        }
      }
    }
  });

  return issues;
}

const sdpValidator = {
  validate
}

export {sdpValidator, SdpIssue, SdpIssueCode, SdpValidateOptions}

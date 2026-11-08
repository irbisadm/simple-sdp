// Parsers of the non-attribute lines — port of src/services/sdp-reader/parsers/*.ts.
// On error they call fail() and return a placeholder; callers must check failed().

import {
  Bandwidth, Codec, Connection, EncryptionKey, MediaSection, Origin, RepeatTimes, TimeZoneAdjustment, Timing,
} from '../model';
import {fail, failed, fmtNum, isDigits, stringToInt} from '../util';

/** True for RTP-based protocols: `/(^|\/)RTP\//` */
export function isRtpProto(proto: string): bool {
  const parts = proto.split('/');
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] == 'RTP') {
      return true;
    }
  }
  return false;
}

/** `b=<bwtype>:<bandwidth>` — RFC 8866 §5.8 */
export function bLineParser(value: string): Bandwidth | null {
  const idx = value.indexOf(':');
  if (idx <= 0) {
    fail('expected "<bwtype>:<bandwidth>"');
    return null;
  }
  const bandwidth = stringToInt(value.slice(idx + 1), 'bandwidth');
  if (failed()) {
    return null;
  }
  return new Bandwidth(value.slice(0, idx), bandwidth);
}

/** `c=<nettype> <addrtype> <connection-address>` — RFC 8866 §5.7 */
export function cLineParser(value: string): Connection | null {
  const parts = value.split(' ');
  if (parts.length != 3) {
    fail('expected "<nettype> <addrtype> <connection-address>"');
    return null;
  }
  return new Connection(parts[0], parts[1], parts[2]);
}

/** `k=<method>[:<encryption key>]` — RFC 8866 §5.12 */
export function kLineParser(value: string): EncryptionKey | null {
  const idx = value.indexOf(':');
  const method = idx == -1 ? value : value.slice(0, idx);
  if (method.length == 0) {
    fail('empty key method');
    return null;
  }
  return new EncryptionKey(method, idx == -1 ? null : value.slice(idx + 1));
}

/** Typed time (`7d`, `1h`, `25h`, `3600`) in seconds — RFC 8866 §5.10. `signed` accepts a leading `-`. */
export function lineTimeParser(lTime: string, signed: bool = false): f64 {
  if (signed && lTime.startsWith('-')) {
    return -lineTimeParser(lTime.slice(1));
  }
  const sfx = lTime.length > 0 ? lTime.charAt(lTime.length - 1) : '';
  let unit: f64 = 0;
  if (sfx == 'd') {
    unit = 86400;
  } else if (sfx == 'h') {
    unit = 3600;
  } else if (sfx == 'm') {
    unit = 60;
  } else if (sfx == 's') {
    unit = 1;
  }
  if (unit != 0) {
    return unit * stringToInt(lTime.slice(0, lTime.length - 1), 'time');
  }
  return stringToInt(lTime, 'time');
}

/** `m=<media> <port>[/<number of ports>] <proto> <fmt> ...` — RFC 8866 §5.14 */
export function mLineParser(value: string): MediaSection | null {
  const parts = value.split(' ');
  if (parts.length < 4) {
    fail('expected "<media> <port> <proto> <fmt> ..."');
    return null;
  }
  const portPart = parts[1];
  const portParts = portPart.split('/');
  if (portParts.length > 2) {
    fail(`invalid port "${portPart}"`);
    return null;
  }
  const section = new MediaSection();
  section.type = parts[0];
  section.port = stringToInt(portParts[0], 'port');
  section.proto = parts[2];
  if (failed()) {
    return null;
  }
  if (portParts.length == 2) {
    section.numberOfPorts = stringToInt(portParts[1], 'number of ports');
    if (failed()) {
      return null;
    }
  }
  const fmt = parts.slice(3);
  // A doubled space makes an empty field. For RTP an empty payload type fails below.
  if (parts[0].length == 0 || parts[2].length == 0 || (!isRtpProto(parts[2]) && fmt.includes(''))) {
    fail('expected "<media> <port> <proto> <fmt> ..."');
    return null;
  }
  if (isRtpProto(parts[2])) {
    const codecs = new Array<Codec>(0);
    for (let i = 0; i < fmt.length; i++) {
      const payloadType = stringToInt(fmt[i], 'payload type');
      if (failed()) {
        return null;
      }
      if (payloadType > 127) {
        fail(`payload type ${fmtNum(payloadType)} is out of range 0-127`);
        return null;
      }
      const codec = new Codec();
      codec.payloadType = payloadType;
      codecs.push(codec);
    }
    section.codecs = codecs;
  } else {
    section.formats = fmt;
  }
  return section;
}

/** `o=<username> <sess-id> <sess-version> <nettype> <addrtype> <unicast-address>` — RFC 8866 §5.2 */
export function oLineParser(value: string): Origin | null {
  const parts = value.split(' ');
  if (parts.length != 6) {
    fail('expected "<username> <sess-id> <sess-version> <nettype> <addrtype> <unicast-address>"');
    return null;
  }
  if (!isDigits(parts[1])) {
    fail(`sess-id "${parts[1]}" is not numeric`);
    return null;
  }
  if (!isDigits(parts[2])) {
    fail(`sess-version "${parts[2]}" is not numeric`);
    return null;
  }
  const origin = new Origin();
  origin.username = parts[0];
  origin.sessId = parts[1];
  origin.sessVersion = parts[2];
  origin.netType = parts[3];
  origin.addrType = parts[4];
  origin.unicastAddress = parts[5];
  return origin;
}

/** `r=<repeat interval> <active duration> <offsets from start-time>` — RFC 8866 §5.10 */
export function rLineParser(value: string): RepeatTimes | null {
  const parts = value.split(' ');
  if (parts.length < 3) {
    fail('expected "<repeat interval> <active duration> <offset>..."');
    return null;
  }
  const times = new Array<f64>(parts.length);
  for (let i = 0; i < parts.length; i++) {
    times[i] = lineTimeParser(parts[i]);
    if (failed()) {
      return null;
    }
  }
  const repeat = new RepeatTimes();
  repeat.repeatInterval = times[0];
  repeat.activeDuration = times[1];
  repeat.offsets = times.slice(2);
  return repeat;
}

/** `t=<start-time> <stop-time>` — RFC 8866 §5.9 */
export function tLineParser(value: string): Timing | null {
  const parts = value.split(' ');
  if (parts.length != 2) {
    fail('expected "<start-time> <stop-time>"');
    return null;
  }
  const timing = new Timing();
  timing.startTime = stringToInt(parts[0], 'start time');
  if (failed()) {
    return null;
  }
  timing.stopTime = stringToInt(parts[1], 'stop time');
  if (failed()) {
    return null;
  }
  return timing;
}

/** `z=<adjustment time> <offset> ...` — RFC 8866 §5.11 */
export function zLineParser(value: string): TimeZoneAdjustment[] | null {
  const parts = value.split(' ');
  if (parts.length < 2 || parts.length % 2 != 0) {
    fail('expected pairs of "<adjustment time> <offset>"');
    return null;
  }
  const result = new Array<TimeZoneAdjustment>(0);
  for (let i = 0; i < parts.length; i += 2) {
    const adjustmentTime = stringToInt(parts[i], 'adjustment time');
    if (failed()) {
      return null;
    }
    const offset = lineTimeParser(parts[i + 1], true);
    if (failed()) {
      return null;
    }
    result.push(new TimeZoneAdjustment(adjustmentTime, offset));
  }
  return result;
}

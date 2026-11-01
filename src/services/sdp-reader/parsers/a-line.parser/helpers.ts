import {SdpCodec, SdpMediaSection} from "../../../../interfaces/Sdp";
import {stringToIntParser} from "../string-to-int.parser";

/**
 * `record[key]` for own properties only, so that names like `constructor` or `toString`
 * do not resolve to members of `Object.prototype`.
 */
export const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

/** `record[key] = value` that also stores `__proto__` as an ordinary key */
export const setOwn = <T>(record: Record<string, T>, key: string, value: T): void => {
  Object.defineProperty(record, key, {value, writable: true, enumerable: true, configurable: true});
}

/** Throws if the value is missing */
export const required = (value: string | undefined, syntax: string): string => {
  if (value === undefined || value.length === 0) {
    throw new Error(`expected a value: ${syntax}`);
  }
  return value;
}

/** Throws if a value is given for a flag attribute */
export const flag = (value: string | undefined): true => {
  if (value !== undefined) {
    throw new Error('flag attribute must not have a value');
  }
  return true;
}

/** Splits `"<head> <rest>"` at the first space */
export const splitFirst = (value: string): [string, string | undefined] => {
  const idx = value.indexOf(' ');
  return idx === -1 ? [value, undefined] : [value.slice(0, idx), value.slice(idx + 1)];
}

/** Returns the codec referenced by the payload type, or undefined if it is not in the m= line */
export const findCodec = (section: SdpMediaSection, pt: string): SdpCodec | undefined => {
  const payloadType = stringToIntParser(pt, 'payload type');
  return section.codecs?.find(codec => codec.payloadType === payloadType);
}

export const once = <T extends object, K extends keyof T>(target: T, key: K, value: T[K], name: string) => {
  if (target[key] !== undefined) {
    throw new Error(`duplicate a=${name}`);
  }
  target[key] = value;
}

export const push = <T extends object, K extends keyof T>(target: T, key: K, value: NonNullable<T[K]> extends (infer U)[] ? U : never) => {
  if (target[key] === undefined) {
    (target[key] as unknown) = [];
  }
  (target[key] as unknown[]).push(value);
}

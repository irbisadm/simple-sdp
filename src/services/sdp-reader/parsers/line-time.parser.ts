import {stringToIntParser} from "./string-to-int.parser";

/** RFC 8866 §5.10, Table 1 */
const UNITS = {'d': 86400, 'h': 3600, 'm': 60, 's': 1} as const;

/**
 * Parses a typed time (`7d`, `1h`, `25h`, `3600`) into seconds.
 * With `signed`, a leading `-` is accepted (z= offsets, RFC 8866 §5.11).
 */
export const lineTimeParser = (lTime: string, signed = false): number => {
  if (signed && lTime.startsWith('-')) {
    return -lineTimeParser(lTime.slice(1));
  }
  const sfx = lTime.slice(-1);
  if (sfx in UNITS) {
    return UNITS[sfx as keyof typeof UNITS] * stringToIntParser(lTime.slice(0, -1), 'time');
  }
  return stringToIntParser(lTime, 'time');
}

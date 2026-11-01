import {SdpTimeZoneAdjustment} from "../../../interfaces/Sdp";
import {stringToIntParser} from "./string-to-int.parser";
import {lineTimeParser} from "./line-time.parser";

/** `z=<adjustment time> <offset> <adjustment time> <offset> ...` — RFC 8866 §5.11 */
export const zLineParser = (value: string): SdpTimeZoneAdjustment[] => {
  const parts = value.split(' ');
  if (parts.length < 2 || parts.length % 2 !== 0) {
    throw new Error('expected pairs of "<adjustment time> <offset>"');
  }
  const result: SdpTimeZoneAdjustment[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    result.push({
      adjustmentTime: stringToIntParser(parts[i], 'adjustment time'),
      offset: lineTimeParser(parts[i + 1], true),
    });
  }
  return result;
}

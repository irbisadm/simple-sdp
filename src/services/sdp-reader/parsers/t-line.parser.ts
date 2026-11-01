import {SdpTiming} from "../../../interfaces/Sdp";
import {stringToIntParser} from "./string-to-int.parser";

/** `t=<start-time> <stop-time>` — RFC 8866 §5.9 */
export const tLineParser = (value: string): SdpTiming => {
  const parts = value.split(' ');
  if (parts.length !== 2) {
    throw new Error('expected "<start-time> <stop-time>"');
  }
  return {
    startTime: stringToIntParser(parts[0], 'start time'),
    stopTime: stringToIntParser(parts[1], 'stop time'),
  }
}

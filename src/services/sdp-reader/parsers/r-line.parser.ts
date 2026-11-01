import {SdpRepeatTimes} from "../../../interfaces/Sdp";
import {lineTimeParser} from "./line-time.parser";

/** `r=<repeat interval> <active duration> <offsets from start-time>` — RFC 8866 §5.10 */
export const rLineParser = (value: string): SdpRepeatTimes => {
  const parts = value.split(' ');
  if (parts.length < 3) {
    throw new Error('expected "<repeat interval> <active duration> <offset>..."');
  }
  const [interval, duration, ...offsets] = parts.map(part => lineTimeParser(part));
  return {repeatInterval: interval, activeDuration: duration, offsets};
}

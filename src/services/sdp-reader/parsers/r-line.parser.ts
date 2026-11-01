import {SdpRepeatTimes} from "../../../interfaces/Sdp";
import {linePartsParser} from "./line-parts.parser";
import {lineTimeParser} from "./line-time.parser";

export const rLineParser = (line: string): SdpRepeatTimes => {
  const repeatParts = linePartsParser(line, 'r');
  if (repeatParts.length < 2) {
    throw new Error(`Invalid repeat line "${line}": expected "r=<repeat interval> <active duration> <offsets>"`);
  }
  const sdpRepeatTimes: SdpRepeatTimes = {
    repeatInterval: lineTimeParser(repeatParts[0]),
    activeDuration: lineTimeParser(repeatParts[1]),
  }
  if (repeatParts.length > 2) {
    sdpRepeatTimes.offsets = repeatParts.slice(2).map(lineTimeParser);
  }
  return sdpRepeatTimes;
}

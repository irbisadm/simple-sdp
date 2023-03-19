import {SdpRepeatTimes} from "../../../inerfaces/Sdp";
import {linePartsParser} from "./line-parts.parser";
import {lineTimeParser} from "./line-time.parser";

export const rLineParser = (line: string): SdpRepeatTimes => {
  const repeatParts = linePartsParser(line, 'r');
  const repeatInterval = lineTimeParser(repeatParts[0]);
  const activeDuration = lineTimeParser(repeatParts[0]);
  const sdpRepeatTimes: SdpRepeatTimes = {
    repeatInterval,
    activeDuration
  }
  if (repeatParts.length > 3) {
    sdpRepeatTimes.offsets = [];
    for (let i = 2; i < repeatParts.length; i++) {
      sdpRepeatTimes.offsets.push(lineTimeParser(repeatParts[i]));
    }
  }
  return sdpRepeatTimes;
}
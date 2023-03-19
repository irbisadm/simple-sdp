import {SdpTiming} from "../../../inerfaces/Sdp";
import {linePartsParser} from "./line-parts.parser";

export const tLineParser = (line:string):SdpTiming=>{
  const timingParts = linePartsParser(line,'t');
  const startTimeInt = parseInt(timingParts[0]);
  const startTime = isNaN(startTimeInt)?0:startTimeInt;
  const stopTimeInt = parseInt(timingParts[1]);
  const stopTime = isNaN(stopTimeInt)?0:stopTimeInt;
  return {
    startTime,
    stopTime
  }
}
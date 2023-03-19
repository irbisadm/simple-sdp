import {SdpConnectionInformation} from "../../../inerfaces/Sdp";
import {linePartsParser} from "./line-parts.parser";

export const cLineParser = (line:string):SdpConnectionInformation=>{
  const lineParts = linePartsParser(line,'c');
  const netType = lineParts[0] === 'IN'?'IN':void 0;
  const addrType = ['IP4','IP6'].includes(lineParts[1])?lineParts[1] as 'IP4'|'IP6':void 0;
  return {
    netType,
    addrType,
    connectionAddress: lineParts[2]
  }
}
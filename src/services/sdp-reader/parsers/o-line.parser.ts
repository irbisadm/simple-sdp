import {SdpOrigin} from "../../../inerfaces/Sdp";
import {linePartsParser} from "./line-parts.parser";

export const oLineParser = (line: string): SdpOrigin => {
 const originParts = linePartsParser(line,'o');
 const sessVersion = parseInt(originParts[2]);
 const netType = originParts[3] === 'IN'?'IN':void 0;
 const addrType = ['IP4','IP6'].includes(originParts[4])?originParts[4] as 'IP4'|'IP6':void 0;
 return {
  username: originParts[0],
  sessId: originParts[1],
  sessVersion,
  netType,
  addrType,
  unicastAddress: originParts[5]
 }
}
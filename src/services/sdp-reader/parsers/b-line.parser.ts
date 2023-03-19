import {SdpBandwidthInformation} from "../../../inerfaces/Sdp";
import {stringToIntParser} from "./string-to-int.parser";

export const bLineParser = (line: string): SdpBandwidthInformation => {
  const lineContent = line.replace('k=', '');
  const [bwtype, bandwidth] = lineContent.split(':');
  return {
    bwtype,
    bandwidth: stringToIntParser(bandwidth)
  }
}
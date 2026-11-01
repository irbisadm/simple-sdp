import {SdpBandwidthInformation} from "../../../interfaces/Sdp";
import {stringToIntParser} from "./string-to-int.parser";

/** `b=<bwtype>:<bandwidth>` — RFC 8866 §5.8 */
export const bLineParser = (value: string): SdpBandwidthInformation => {
  const idx = value.indexOf(':');
  if (idx <= 0) {
    throw new Error('expected "<bwtype>:<bandwidth>"');
  }
  return {
    bwtype: value.slice(0, idx),
    bandwidth: stringToIntParser(value.slice(idx + 1), 'bandwidth'),
  }
}

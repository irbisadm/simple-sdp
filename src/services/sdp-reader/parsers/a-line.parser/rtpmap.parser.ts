import {SdpCodec} from "../../../../interfaces/Sdp";
import {stringToIntParser} from "../string-to-int.parser";

/** `<encoding name>/<clock rate>[/<encoding parameters>]` of `a=rtpmap` — RFC 8866 §6.6 */
export const rtpmapParser = (codec: SdpCodec, encoding: string) => {
  const [encodingName, clockRate, encodingParameters, ...extra] = encoding.split('/');
  if (!encodingName || clockRate === undefined || extra.length) {
    throw new Error('expected "<payload type> <encoding name>/<clock rate>[/<encoding parameters>]"');
  }
  codec.encodingName = encodingName;
  codec.clockRate = stringToIntParser(clockRate, 'clock rate');
  if (encodingParameters !== undefined) {
    codec.encodingParameters = stringToIntParser(encodingParameters, 'encoding parameters');
  }
}

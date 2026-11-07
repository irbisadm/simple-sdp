import {SdpCodec} from "../../../../interfaces/Sdp";
import {stringToIntParser} from "../string-to-int.parser";

/** `<encoding name>/<clock rate>[/<encoding parameters>]` of `a=rtpmap` — RFC 8866 §6.6 */
export const rtpmapParser = (codec: SdpCodec, encoding: string) => {
  const [encodingName, clockRate, encodingParameters, ...extra] = encoding.split('/');
  if (!encodingName || clockRate === undefined || extra.length) {
    throw new Error('expected "<payload type> <encoding name>/<clock rate>[/<encoding parameters>]"');
  }
  // Read everything before touching the codec, so that a failure leaves it unchanged
  const rate = stringToIntParser(clockRate, 'clock rate');
  const parameters = encodingParameters !== undefined
    ? stringToIntParser(encodingParameters, 'encoding parameters')
    : undefined;
  codec.encodingName = encodingName;
  codec.clockRate = rate;
  if (parameters !== undefined) {
    codec.encodingParameters = parameters;
  }
}

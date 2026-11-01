import {SdpMediaSection} from "../../../interfaces/Sdp";
import {stringToIntParser} from "./string-to-int.parser";

/** True for RTP-based protocols: RTP/AVP, RTP/SAVPF, UDP/TLS/RTP/SAVPF, TCP/RTP/AVP, … */
export const isRtpProto = (proto: string): boolean => /(^|\/)RTP\//.test(proto);

/** `m=<media> <port>[/<number of ports>] <proto> <fmt> ...` — RFC 8866 §5.14 */
export const mLineParser = (value: string): SdpMediaSection => {
  const parts = value.split(' ');
  if (parts.length < 4) {
    throw new Error('expected "<media> <port> <proto> <fmt> ..."');
  }
  const [type, portPart, proto, ...fmt] = parts;
  const [port, numberOfPorts, ...extra] = portPart.split('/');
  if (extra.length) {
    throw new Error(`invalid port "${portPart}"`);
  }
  const section: SdpMediaSection = {
    type,
    port: stringToIntParser(port, 'port'),
    proto,
  };
  if (numberOfPorts !== undefined) {
    section.numberOfPorts = stringToIntParser(numberOfPorts, 'number of ports');
  }
  if (isRtpProto(proto)) {
    section.codecs = fmt.map(pt => {
      const payloadType = stringToIntParser(pt, 'payload type');
      if (payloadType > 127) {
        throw new Error(`payload type ${payloadType} is out of range 0-127`);
      }
      return {payloadType};
    });
  } else {
    section.formats = fmt;
  }
  return section;
}

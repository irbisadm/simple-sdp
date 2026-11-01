import {SdpConnectionInformation} from "../../../interfaces/Sdp";

/** `c=<nettype> <addrtype> <connection-address>` — RFC 8866 §5.7 */
export const cLineParser = (value: string): SdpConnectionInformation => {
  const parts = value.split(' ');
  if (parts.length !== 3) {
    throw new Error('expected "<nettype> <addrtype> <connection-address>"');
  }
  const [netType, addrType, connectionAddress] = parts;
  return {netType, addrType, connectionAddress};
}

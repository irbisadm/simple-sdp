import {SdpOrigin} from "../../../interfaces/Sdp";

const isDigits = /^\d+$/;

/** `o=<username> <sess-id> <sess-version> <nettype> <addrtype> <unicast-address>` — RFC 8866 §5.2 */
export const oLineParser = (value: string): SdpOrigin => {
  const parts = value.split(' ');
  if (parts.length !== 6) {
    throw new Error('expected "<username> <sess-id> <sess-version> <nettype> <addrtype> <unicast-address>"');
  }
  const [username, sessId, sessVersion, netType, addrType, unicastAddress] = parts;
  if (!isDigits.test(sessId)) {
    throw new Error(`sess-id "${sessId}" is not numeric`);
  }
  if (!isDigits.test(sessVersion)) {
    throw new Error(`sess-version "${sessVersion}" is not numeric`);
  }
  return {username, sessId, sessVersion, netType, addrType, unicastAddress};
}

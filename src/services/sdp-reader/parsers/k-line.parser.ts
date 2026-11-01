import {SdpEncryptionKey} from "../../../interfaces/Sdp";

/** `k=<method>` / `k=<method>:<encryption key>` — RFC 8866 §5.12 */
export const kLineParser = (value: string): SdpEncryptionKey => {
  const idx = value.indexOf(':');
  const method = idx === -1 ? value : value.slice(0, idx);
  if (method.length === 0) {
    throw new Error('empty key method');
  }
  return idx === -1 ? {method} : {method, encryptionKey: value.slice(idx + 1)};
}

import {SdpEncryptionKey} from "../../../inerfaces/Sdp";

export const kLineParser = (line: string): SdpEncryptionKey => {
  const lineContent = line.replace('k=', '');
  const [method,encryptionKey] = lineContent.split(':');
  const allowedMethod = ['clear','base64','uri','prompt'];
  if(!allowedMethod.includes(method)){
    throw new Error(`Encryption method "${method}" is not supported by RFC-4566`)
  }
  return {
    method: method as 'clear' | 'base64' | 'uri' | 'prompt',
    encryptionKey
  }
}
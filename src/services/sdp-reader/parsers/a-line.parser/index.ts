import {Sdp, SdpMediaSection} from "../../../../inerfaces/Sdp";
import {setIceAttr} from "./set-ice-attr";
import {setDtlsAttr} from "./set-dtls-attr";


export const aLineParser = <T extends Sdp | SdpMediaSection>(section: T, line: string): T => {
  if (!section.attributes) {
    section.attributes = {};
  }
  const aLineString = line.replace('a=', '');
  const [type, ...rest] = aLineString.split(':');
  const value = rest.join(':');
  switch (type) {
    case 'mid':
      (section as SdpMediaSection).mid = value;
      break;
    case 'ice-ufrag':
      setIceAttr(section, 'ufrag', value);
      break;
    case 'ice-pwd':
      setIceAttr(section, 'pwd', value);
      break;
    case 'ice-options':
      setIceAttr(section, 'options', value.split(' '));
      break;
    case 'fingerprint': {
      const [algorithm, fingerprint] = value.split(' ')
      setDtlsAttr(section, 'algorithm', algorithm);
      setDtlsAttr(section, 'fingerprint', fingerprint);
      break;
    }
    case 'setup':
      setDtlsAttr(section, 'setup', value as 'active' | 'passive' | 'actpass');
      break;
    case 'sendrecv'||'sendonly'||'recvonly'||'inactive':
      (section as SdpMediaSection).direction = type;
      break;
    default:
      if(section.attributes[type]){
        if(!Array.isArray(section.attributes[type])) {
          section.attributes[type] = [section.attributes[type] as string];
        }
        (section.attributes[type] as string[]).push(value);
        break;
      }
      section.attributes[type] = (rest.length === 0) ? true : value;
      break;
  }
  return section;
}
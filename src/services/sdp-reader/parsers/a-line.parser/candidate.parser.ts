import {SdpCandidate} from "../../../../interfaces/Sdp";
import {stringToIntParser} from "../string-to-int.parser";

const SYNTAX = '"<foundation> <component> <transport> <priority> <address> <port> typ <type> [raddr <addr>] [rport <port>] *(<ext-name> <ext-value>)"';

/** Value of `a=candidate` — RFC 8839 §5.1 */
export const candidateParser = (value: string): SdpCandidate => {
  const parts = value.split(' ');
  if (parts.length < 8 || parts[6] !== 'typ' || parts.length % 2 !== 0) {
    throw new Error(`expected ${SYNTAX}`);
  }
  const [foundation, component, transport, priority, address, port, , type] = parts;
  const candidate: SdpCandidate = {
    foundation,
    component: stringToIntParser(component, 'component id'),
    transport,
    priority: stringToIntParser(priority, 'priority'),
    address,
    port: stringToIntParser(port, 'port'),
    type,
  };
  for (let i = 8; i < parts.length; i += 2) {
    const [name, val] = [parts[i], parts[i + 1]];
    if (name.length === 0 || val.length === 0) {
      throw new Error(`expected ${SYNTAX}`);
    }
    switch (name) {
      case 'raddr':
        candidate.relatedAddress = val;
        break;
      case 'rport':
        candidate.relatedPort = stringToIntParser(val, 'rport');
        break;
      case 'tcptype':
        candidate.tcpType = val;
        break;
      default:
        (candidate.extensions ??= {})[name] = val;
    }
  }
  return candidate;
}

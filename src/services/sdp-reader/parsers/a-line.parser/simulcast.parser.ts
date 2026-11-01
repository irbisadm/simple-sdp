import {SdpRid, SdpSimulcast, SdpSimulcastStreams} from "../../../../interfaces/Sdp";
import {stringToIntParser} from "../string-to-int.parser";
import {fmtpParametersParser} from "./fmtp.parser";
import {splitFirst} from "./helpers";

/** rid-id = 1*(alpha-numeric / "-" / "_") — RFC 8851 §10 */
const RID_ID = /^[A-Za-z0-9_-]+$/;

/** `a=rid:<rid-id> SP <rid-dir> [SP (rid-pt-param-list / rid-param-list)]` — RFC 8851 §10 */
export const ridParser = (value: string): SdpRid => {
  const [id, rest] = splitFirst(value);
  const [direction, params] = rest ? splitFirst(rest) : [undefined, undefined];
  if (!RID_ID.test(id) || (direction !== 'send' && direction !== 'recv') || params === '') {
    throw new Error('expected "<rid-id> <send|recv> [<params>]"');
  }
  const rid: SdpRid = {id, direction};
  if (params !== undefined) {
    const restrictions = fmtpParametersParser(params);
    if ('pt' in restrictions) {
      if (!params.startsWith('pt=') || restrictions.pt === null) {
        throw new Error('"pt=" must be the first rid parameter');
      }
      rid.payloadTypes = restrictions.pt.split(',').map(pt => stringToIntParser(pt, 'payload type'));
      delete restrictions.pt;
    }
    if (Object.keys(restrictions).length) {
      rid.restrictions = restrictions;
    }
  }
  return rid;
}

const streamsParser = (list: string): SdpSimulcastStreams =>
  list.split(';').map(alternatives => alternatives.split(',').map(scId => {
    const paused = scId.startsWith('~');
    const rid = paused ? scId.slice(1) : scId;
    if (!RID_ID.test(rid)) {
      throw new Error(`invalid simulcast rid "${scId}"`);
    }
    return paused ? {rid, paused} : {rid};
  }));

/** `a=simulcast:(sc-send [SP sc-recv]) / (sc-recv [SP sc-send])` — RFC 8853 §5.1 */
export const simulcastParser = (value: string): SdpSimulcast => {
  const parts = value.split(' ');
  if (parts.length !== 2 && parts.length !== 4) {
    throw new Error('expected "send|recv <streams> [send|recv <streams>]"');
  }
  const simulcast: SdpSimulcast = {};
  for (let i = 0; i < parts.length; i += 2) {
    const dir = parts[i];
    if ((dir !== 'send' && dir !== 'recv') || simulcast[dir]) {
      throw new Error('expected "send|recv <streams> [send|recv <streams>]"');
    }
    simulcast[dir] = streamsParser(parts[i + 1]);
  }
  return simulcast;
}

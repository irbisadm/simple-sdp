import {SdpDirection, SdpExtmap} from "../../../../interfaces/Sdp";
import {stringToIntParser} from "../string-to-int.parser";
import {splitFirst} from "./helpers";

const DIRECTIONS: SdpDirection[] = ['sendrecv', 'sendonly', 'recvonly', 'inactive'];

/** `a=extmap:<value>["/"<direction>] <URI> <extensionattributes>` — RFC 8285 §8 */
export const extmapParser = (value: string): SdpExtmap => {
  const [idPart, rest] = splitFirst(value);
  if (!rest) {
    throw new Error('expected "<id>[/<direction>] <uri> [<attributes>]"');
  }
  const [id, direction, ...extra] = idPart.split('/');
  if (extra.length || (direction !== undefined && !DIRECTIONS.includes(direction as SdpDirection))) {
    throw new Error(`invalid extmap id "${idPart}"`);
  }
  const [uri, attributes] = splitFirst(rest);
  const extmap: SdpExtmap = {id: stringToIntParser(id, 'extmap id'), uri};
  if (direction !== undefined) {
    extmap.direction = direction as SdpDirection;
  }
  if (attributes !== undefined) {
    extmap.attributes = attributes;
  }
  return extmap;
}

import {SdpMediaSection, SdpMsid, SdpSsrcGroup} from "../../../../interfaces/Sdp";
import {stringToIntParser} from "../string-to-int.parser";
import {own, setOwn, splitFirst} from "./helpers";

const ssrcId = (value: string): number => {
  const id = stringToIntParser(value, 'ssrc-id');
  if (id > 0xFFFFFFFF) {
    throw new Error(`ssrc-id ${id} does not fit into 32 bits`);
  }
  return id;
}

/**
 * `a=ssrc:<ssrc-id> <attribute>[:<value>]` — RFC 5576 §4.1.
 * Returns false (keep as generic attribute) if the SSRC already has this source attribute.
 */
export const ssrcParser = (section: SdpMediaSection, value: string): boolean => {
  const [idPart, attribute] = splitFirst(value);
  if (!attribute) {
    throw new Error('expected "<ssrc-id> <attribute>[:<value>]"');
  }
  const id = ssrcId(idPart);
  const idx = attribute.indexOf(':');
  const name = idx === -1 ? attribute : attribute.slice(0, idx);
  const val = idx === -1 ? null : attribute.slice(idx + 1);
  const ssrcs = (section.ssrcs ??= []);
  let ssrc = ssrcs.find(s => s.id === id);
  if (!ssrc) {
    ssrc = {id, attributes: {}};
    ssrcs.push(ssrc);
  }
  if (own(ssrc.attributes, name) !== undefined) {
    return false;
  }
  setOwn(ssrc.attributes, name, val);
  return true;
}

/** `a=ssrc-group:<semantics> *(SP <ssrc-id>)` — RFC 5576 §4.2 */
export const ssrcGroupParser = (value: string): SdpSsrcGroup => {
  const [semantics, ...ids] = value.split(' ');
  if (semantics.length === 0) {
    throw new Error('expected "<semantics> <ssrc-id> ..."');
  }
  return {semantics, ssrcs: ids.map(ssrcId)};
}

/** `a=msid:<msid-id> [<msid-appdata>]` — RFC 8830 §2 */
export const msidParser = (value: string): SdpMsid => {
  const [streamId, trackId, ...extra] = value.split(' ');
  if (streamId.length === 0 || trackId === '' || extra.length) {
    throw new Error('expected "<stream id> [<track id>]"');
  }
  return trackId === undefined ? {streamId} : {streamId, trackId};
}

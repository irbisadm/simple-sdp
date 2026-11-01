import {SdpGroup} from "../../../../interfaces/Sdp";

/** `a=group:<semantics> *(SP <identification-tag>)` — RFC 5888 §5 */
export const groupParser = (value: string): SdpGroup => {
  const [semantics, ...mids] = value.split(' ');
  if (semantics.length === 0 || mids.some(mid => mid.length === 0)) {
    throw new Error('expected "<semantics> <mid> ..."');
  }
  return {semantics, mids};
}

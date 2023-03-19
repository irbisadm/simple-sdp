import {SdpAppMediaSection, SdpAVMediaSection, SdpMediaSection, SdpOtherMediaSection} from "../../../inerfaces/Sdp";
import {linePartsParser} from "./line-parts.parser";

const parsePorts = (ports: string): number[] => {
  return ports.split('/').map(str => parseInt(str));
}

const avLineParser = (mediaParts: string[]): SdpAVMediaSection => {
  const section: SdpAVMediaSection = {
    type: mediaParts[0] as 'audio' | 'video',
    ports: parsePorts(mediaParts[1]),
    proto: mediaParts[2],
  }
  if (mediaParts.length > 3) {
    section.fmtp = [];
    for (let i = 3; i < mediaParts.length; i++) {
      section.fmtp.push(parseInt(mediaParts[i]));
    }
  }
  return section;
}
const appLineParser = (mediaParts: string[]): SdpAppMediaSection => {
  return {
    type: 'application',
    ports: parsePorts(mediaParts[1]),
    proto: mediaParts[2],
    description: mediaParts[3]
  } as SdpAppMediaSection;
}
const unknownLineParser = (mediaParts: string[]): SdpOtherMediaSection => {
  const section: SdpOtherMediaSection = {
    type: mediaParts[0],
    ports: parsePorts(mediaParts[1]),
    proto: mediaParts[2],
  }
  if (mediaParts.length > 3) {
    section.fmtp = [];
    for (let i = 3; i < mediaParts.length; i++) {
      section.fmtp.push(mediaParts[i]);
    }
  }
  return section;
}

export const mLineParser = (line: string): SdpMediaSection => {
  const mediaParts = linePartsParser(line, 'm');
  switch (mediaParts[0]) {
    case 'audio' || 'video':
      return avLineParser(mediaParts);
    case 'application':
      return appLineParser(mediaParts);
    default:
      return unknownLineParser(mediaParts);
  }
}
import {SdpMediaSection} from "../../../../inerfaces/Sdp";

export const extmapParser = (section:SdpMediaSection, line:string)=>{
  if(!section.extmap){
    section.extmap = {};
  }
  const lineParts = line.split(' ');
  section.extmap[parseInt(lineParts[0])] = lineParts[1];
}
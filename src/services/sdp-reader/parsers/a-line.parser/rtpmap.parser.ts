import {SdpAVMediaSection} from "../../../../inerfaces/Sdp";

export const rtpmapParser = (section:SdpAVMediaSection, line:string)=>{
  const lineParts = line.split(' ');
  const payloadType = parseInt(lineParts[0]);
  const fmtSection = section.fmt?.find(fmtp=>fmtp.payloadType === payloadType);
  if(fmtSection){
    fmtSection.contentType = lineParts[1];
  }
}
import {SdpAVMediaSection} from "../../../../inerfaces/Sdp";

export const rtcpFbParser = (section:SdpAVMediaSection, line:string)=>{
  const lineParts = line.split(' ');
  const payloadType = parseInt(lineParts[0]);
  const fmtpSection = section.fmt?.find(fmtp=>fmtp.payloadType === payloadType);
  if(fmtpSection){
    if(!fmtpSection.rtcpFeedback){
      fmtpSection.rtcpFeedback = [];
    }
    fmtpSection.rtcpFeedback.push(lineParts[1]);
  }
}
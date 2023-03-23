import {SdpAVMediaSection} from "../../../../inerfaces/Sdp";

export const fmtpParser = (section:SdpAVMediaSection, line:string)=>{
  const lineParts = line.split(' ');
  const payloadType = parseInt(lineParts[0]);
  const fmtSection = section.fmt?.find(fmtp=>fmtp.payloadType === payloadType);
  if(fmtSection){
    if(!fmtSection.formatParameters){
      fmtSection.formatParameters = {};
    }
    const params = lineParts[1].split(';').map(paramValue=>paramValue.split('='));
    for(const param of params){
      fmtSection.formatParameters[param[0]] = (typeof param[1] !=='undefined')?param[1] : 'unknown';
    }
  }
}
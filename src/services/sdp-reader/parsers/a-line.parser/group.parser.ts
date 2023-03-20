import {Sdp, SdpGroup} from "../../../../inerfaces/Sdp";

export const groupParser = (section:Sdp, value: string)=>{
  if(!section.group){
    section.group = [];
  }
  const [token,...mids] = value.split(' ');
  const availableTokens:SdpGroup["token"][] = ['LS','FID','SRF','ANAT','FEC','DDP','BUNDLE'];
  if(availableTokens.includes(token as SdpGroup["token"])) {
    section.group.push({
      token: token as SdpGroup["token"],
      mids
    })
  }
  // else ignore unknown group;
}
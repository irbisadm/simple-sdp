import {Sdp, SdpMediaSection} from "../../inerfaces/Sdp";
import {vLineParser} from "./parsers/v-line.parser";
import {oLineParser} from "./parsers/o-line.parser";
import {sLineParser} from "./parsers/s-line.parser";
import {tLineParser} from "./parsers/t-line.parser";
import {rLineParser} from "./parsers/r-line.parser";
import {iLineParser} from "./parsers/i-line.parser";
import {uLineParser} from "./parsers/u-line.parser";
import {eLineParser} from "./parsers/e-line.parser";
import {pLineParser} from "./parsers/p-line.parser";
import {kLineParser} from "./parsers/k-line.parser";
import {mLineParser} from "./parsers/m-line.parser";
import {bLineParser} from "./parsers/b-line.parser";
import {cLineParser} from "./parsers/c-line.parser";
import {aLineParser} from "./parsers/a-line.parser";

const parse = (sdp: string): Sdp => {
  const sdpLines = sdp.split("\r\n");
  const parsedSdp:Sdp = {};
  let activeSection:SdpMediaSection|null = null;
  sdpLines.forEach((line, idx)=>{
    if(line.length === 0){
      if(idx !== sdpLines.length-1){
        throw new Error(`Empty line at "${idx}" after ${sdpLines[idx-1]}`);
      }
      return;
    }
    if(line[1] !== '='){
      throw new Error(`Invalid line structure in line "${line}"`);
    }
    switch (line[0]){
      case 'v':
        parsedSdp.protocolVersion = vLineParser(line);
        break;
      case 'o':
        parsedSdp.origin = oLineParser(line);
        break;
      case 's':
        parsedSdp.sessionName = sLineParser(line);
        break;
      case 't':
        if(!parsedSdp.timing){
          parsedSdp.timing = [];
        }
        parsedSdp.timing.push(tLineParser(line));
        break;
      case 'r':
        if(!parsedSdp.repeat){
          parsedSdp.repeat = [];
        }
        parsedSdp.repeat.push(rLineParser(line))
        break;
      case 'i':
        parsedSdp.sessionInformation = iLineParser(line);
        break;
      case 'u':
        parsedSdp.sessionInformation = uLineParser(line);
        break;
      case 'e':
        parsedSdp.emailAddress = eLineParser(line);
        break;
      case 'p':
        parsedSdp.phoneNumber = pLineParser(line);
        break;
      case 'k':
        if(!parsedSdp.encryptionKeys){
          parsedSdp.encryptionKeys = [];
        }
        parsedSdp.encryptionKeys.push(kLineParser(line));
        break;
      case 'm':
        const mediaSection = mLineParser(line);
        activeSection = mediaSection;
        if(!parsedSdp.media){
          parsedSdp.media = [];
        }
        parsedSdp.media.push(mediaSection);
        break;
      case 'b':
        if(!activeSection){
          parsedSdp.bandwidthInformation = bLineParser(line);
        } else {
          activeSection.bandwidthInformation = bLineParser(line);
        }
        break;
      case 'c':
        if(!activeSection){
          parsedSdp.connectionInformation = cLineParser(line);
        } else {
          activeSection.connectionInformation = cLineParser(line);
        }
        break;
      case 'a':
        if(!activeSection){
          aLineParser(parsedSdp,line);
        } else {
          aLineParser(activeSection,line);
        }
        break;
      default:
        throw Error(`Unknown line type "${line[0]}"`);
    }
  });
  return parsedSdp;
}

const isValid = (sdp: string, writeLog=false): boolean => {
  try{
    parse(sdp);
    return true;
  } catch (e){
    if(writeLog){
      console.error(e);
    }
    return false
  }
}

const sdpReader = {
  parse,
  isValid
}

export {sdpReader}
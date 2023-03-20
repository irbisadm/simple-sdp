import {sdpReader} from "./index";
import {simpleTest} from "../../../assets/testSdp";

describe('sdpReader tests',()=>{
  test('parse valid sdp',()=>{
    const {sdp} = simpleTest[0].offer;
    const sdpLines = sdp.split("\r\n");
    console.log(sdpLines);
    const parsedSdp = sdpReader.parse(sdp);
    console.log(JSON.stringify(parsedSdp, null, 2));
  })
})
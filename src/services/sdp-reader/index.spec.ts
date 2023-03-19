import {sdpReader} from "./sdpReader";
import {simpleTest} from "../../../assets/testSdp";

describe('sdpReader tests',()=>{
  test('parse valid sdp',()=>{
    sdpReader.parse(simpleTest[0].offer.sdp);
  })
})
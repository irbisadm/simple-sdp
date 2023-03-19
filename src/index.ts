import {sdpReader} from './services/sdp-reader/sdpReader';
import {Sdp, SdpMediaSection, SdpPair, SdpOrigin, SdpTiming, SdpRepeatTimes, SdpEncryptionKey} from "./inerfaces/Sdp";

const version = '__lib_version__'; // Version will be injected on the build

export {version, sdpReader, Sdp, SdpMediaSection, SdpPair, SdpOrigin, SdpTiming, SdpRepeatTimes, SdpEncryptionKey}
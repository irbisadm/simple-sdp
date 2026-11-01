import {sdpReader} from './services/sdp-reader';
import {sdpWriter} from './services/sdp-writer';
import {SdpParseError} from './errors';

export * from './interfaces/Sdp';

const version = '__lib_version__'; // Version will be injected on the build

export {version, sdpReader, sdpWriter, SdpParseError}

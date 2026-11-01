import {sdpReader} from './services/sdp-reader';
import {sdpWriter} from './services/sdp-writer';
import {sdpValidator, SdpIssue, SdpIssueCode, SdpValidateOptions} from './services/sdp-validator';
import {SdpParseError} from './errors';

export * from './interfaces/Sdp';

const version = '__lib_version__'; // Version will be injected on the build

export {version, sdpReader, sdpWriter, sdpValidator, SdpParseError, SdpIssue, SdpIssueCode, SdpValidateOptions}

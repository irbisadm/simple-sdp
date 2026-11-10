import {sdpReader} from './services/sdp-reader';
import {sdpWriter} from './services/sdp-writer';
import {sdpValidator, SdpIssue, SdpIssueCode, SdpValidateOptions} from './services/sdp-validator';
import {sdpResolver} from './services/sdp-resolver';
import {sdpNegotiator} from './services/sdp-negotiator';
import {SdpParseError} from './errors';

export * from './interfaces/Sdp';
export * from './interfaces/Resolved';

const version = '__lib_version__'; // Version will be injected on the build

export {
  version, sdpReader, sdpWriter, sdpValidator, sdpResolver, sdpNegotiator, SdpParseError,
  SdpIssue, SdpIssueCode, SdpValidateOptions,
}

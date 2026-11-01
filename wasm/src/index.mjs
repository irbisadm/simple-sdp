// @irbisadm/simple-sdp/wasm — the API of the main entry point, run by the WebAssembly build
// (assembly/). Published as wasm/dist/index.mjs next to simple-sdp.mjs and simple-sdp.wasm.
import {parse as rawParse, write as rawWrite, validate as rawValidate, validateModel as rawValidateModel, VERSION}
  from './simple-sdp.mjs';
import {SdpParseError} from '../../dist/index.mjs';

export {SdpParseError};

const parse = (sdp) => {
  const result = JSON.parse(rawParse(sdp));
  if (result.error) {
    throw new SdpParseError(result.error.reason, result.error.lineNumber, result.error.line);
  }
  return result.sdp;
};

const isValid = (sdp, writeLog = false) => {
  try {
    parse(sdp);
    return true;
  } catch (e) {
    if (writeLog) {
      console.error(e);
    }
    return false;
  }
};

const write = (sdp) => {
  const result = JSON.parse(rawWrite(JSON.stringify(sdp)));
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.sdp;
};

const validate = (input, options = {}) => {
  const type = options.type ?? null;
  const result = JSON.parse(typeof input === 'string'
    ? rawValidate(input, type)
    : rawValidateModel(JSON.stringify(input), type));
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.issues;
};

export const sdpReader = {parse, isValid};
export const sdpWriter = {write};
export const sdpValidator = {validate};
export const version = VERSION.value;

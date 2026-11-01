// The public API of src/ implemented on top of the WebAssembly build (C ABI, UTF-8),
// so that the TypeScript test suites can run unchanged against the AssemblyScript port.
import fs from 'fs';
import path from 'path';
import {SdpParseError} from '../src/errors';
import type {Sdp} from '../src/interfaces/Sdp';
import type {SdpIssue, SdpValidateOptions} from '../src/services/sdp-validator';

export * from '../src/interfaces/Sdp';
export {SdpParseError};

const WASM = process.env.SDP_WASM ?? path.join(__dirname, '../wasm/build/simple-sdp.wasm');

interface Exports {
  memory: WebAssembly.Memory;
  sdp_alloc(len: number): number;
  sdp_free(ptr: number): void;
  sdp_len(ptr: number): number;
  sdp_parse(ptr: number, len: number): number;
  sdp_write(ptr: number, len: number): number;
  sdp_validate(ptr: number, len: number, type: number): number;
  sdp_validate_model(ptr: number, len: number, type: number): number;
}

const ex = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(WASM)), {}).exports as unknown as Exports;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const call = (fn: (ptr: number, len: number, ...rest: number[]) => number, text: string, ...rest: number[]): any => {
  const bytes = encoder.encode(text);
  const ptr = ex.sdp_alloc(bytes.length);
  new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
  const res = fn(ptr, bytes.length, ...rest);
  ex.sdp_free(ptr);
  const out = decoder.decode(new Uint8Array(ex.memory.buffer, res, ex.sdp_len(res)));
  ex.sdp_free(res);
  return JSON.parse(out);
};

const typeCode = (type?: string) => type === 'offer' ? 1 : type === 'answer' ? 2 : 0;

const parse = (sdp: string): Sdp => {
  const result = call(ex.sdp_parse, sdp);
  if (result.error) {
    throw new SdpParseError(result.error.reason, result.error.lineNumber, result.error.line);
  }
  return result.sdp;
};

const isValid = (sdp: string, writeLog = false): boolean => {
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

const write = (sdp: Sdp): string => {
  const result = call(ex.sdp_write, JSON.stringify(sdp));
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.sdp;
};

const validate = (input: Sdp | string, options: SdpValidateOptions = {}): SdpIssue[] => {
  const result = typeof input === 'string'
    ? call(ex.sdp_validate, input, typeCode(options.type))
    : call(ex.sdp_validate_model, JSON.stringify(input), typeCode(options.type));
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.issues;
};

export const sdpReader = {parse, isValid};
export const sdpWriter = {write};
export const sdpValidator = {validate};
export const version = '1.0.1';

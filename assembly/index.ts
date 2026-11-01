// simple-sdp for WebAssembly (AssemblyScript port of src/).
//
// Every operation takes and returns text. Results are JSON envelopes:
//   parse         -> {"sdp": <model>}  | {"error": {"message", "reason", "lineNumber", "line"}}
//   write         -> {"sdp": "<text>"} | {"error": {"message"}}
//   validate      -> {"issues": [...]}
//   validateModel -> {"issues": [...]} | {"error": {"message"}}
// <model> has the shape of the TypeScript `Sdp` interface.
//
// Two ways to call the module:
//   1. String API (`parse`, `write`, ...) through the generated ESM bindings (JS hosts).
//   2. C ABI (`sdp_*`) with UTF-8 buffers, for any wasm runtime (WasmKit, Chicory, WAMR, ...):
//        ptr = sdp_alloc(len); write UTF-8 bytes to memory[ptr..ptr+len)
//        res = sdp_parse(ptr, len); sdp_free(ptr)
//        read sdp_len(res) bytes at res (UTF-8 JSON); sdp_free(res)

import {LastParse, parse as parseSdp} from './reader';
import {write as writeSdp} from './writer';
import {Issue, validate as validateSdp} from './validator';
import {issuesToJson, sdpFromJson, sdpToJson} from './serialize';
import {JsonObject, parseJson, quote} from './json';
import {resetError, takeError} from './util';

export const VERSION = '1.0.1';

// Memory: the module uses the minimal runtime, whose GC runs only when __collect() is
// called and does not scan the stack. Every export collects right before it returns, when
// the only live object is its result, kept reachable through `Kept.result` (string API)
// or pinned (C ABI).

class Kept {
  static result: string = '';
}

/** Frees the call's garbage and returns `result`, which stays valid until the next call */
function done(result: string): string {
  Kept.result = result;
  __collect();
  return result;
}

function errorJson(message: string): string {
  return '{"error":' + new JsonObject().str('message', message).toString() + '}';
}

/** Parses SDP text into the JSON model */
function parseImpl(sdp: string): string {
  const result = parseSdp(sdp);
  if (result === null) {
    const e = LastParse.error!;
    return '{"error":' + new JsonObject()
      .str('message', e.message).str('reason', e.reason).num('lineNumber', e.lineNumber).str('line', e.line)
      .toString() + '}';
  }
  return '{"sdp":' + sdpToJson(result) + '}';
}

/** True if `parse` accepts the text */
export function isValid(sdp: string): bool {
  const valid = parseSdp(sdp) !== null;
  __collect();
  return valid;
}

/** Serializes a JSON model into SDP text */
function writeImpl(model: string): string {
  resetError();
  const json = parseJson(model);
  if (json === null) {
    return errorJson(takeError());
  }
  const sdp = sdpFromJson(json);
  if (sdp === null) {
    return errorJson(takeError());
  }
  const text = writeSdp(sdp);
  if (text === null) {
    return errorJson(takeError());
  }
  return '{"sdp":' + quote(text) + '}';
}

/** Validates SDP text. `type`: null | 'offer' | 'answer' */
function validateImpl(sdp: string, type: string | null = null): string {
  const parsed = parseSdp(sdp);
  if (parsed === null) {
    const e = LastParse.error!;
    return '{"issues":' + issuesToJson([new Issue('error', 'parse-error', e.message, -1, e.lineNumber)]) + '}';
  }
  return '{"issues":' + issuesToJson(validateSdp(parsed, type === null ? '' : type)) + '}';
}

/** Validates a JSON model. `type`: null | 'offer' | 'answer' */
function validateModelImpl(model: string, type: string | null = null): string {
  resetError();
  const json = parseJson(model);
  if (json === null) {
    return errorJson(takeError());
  }
  const sdp = sdpFromJson(json);
  if (sdp === null) {
    return errorJson(takeError());
  }
  return '{"issues":' + issuesToJson(validateSdp(sdp, type === null ? '' : type)) + '}';
}

/** Parses SDP text into the JSON model */
export function parse(sdp: string): string {
  return done(parseImpl(sdp));
}

/** Serializes a JSON model into SDP text */
export function write(model: string): string {
  return done(writeImpl(model));
}

/** Validates SDP text. `type`: null | 'offer' | 'answer' */
export function validate(sdp: string, type: string | null = null): string {
  return done(validateImpl(sdp, type));
}

/** Validates a JSON model. `type`: null | 'offer' | 'answer' */
export function validateModel(model: string, type: string | null = null): string {
  return done(validateModelImpl(model, type));
}

// ---------------------------------------------------------------------------
// C ABI
// ---------------------------------------------------------------------------

/** Allocates a pinned buffer of `len` bytes; release it with sdp_free */
export function sdp_alloc(len: i32): usize {
  const buf = changetype<usize>(new ArrayBuffer(len));
  __pin(buf);
  return buf;
}

/** Releases a buffer returned by sdp_alloc or by an sdp_* operation */
export function sdp_free(ptr: usize): void {
  __unpin(ptr);
}

/** Byte length of a buffer returned by sdp_alloc or by an sdp_* operation */
export function sdp_len(ptr: usize): i32 {
  return changetype<ArrayBuffer>(ptr).byteLength;
}

function input(ptr: usize, len: i32): string {
  return String.UTF8.decodeUnsafe(ptr, <usize>len);
}

/** Encodes and pins the result, then frees everything else the call allocated */
function output(result: string): usize {
  const buf = changetype<usize>(String.UTF8.encode(result));
  __pin(buf);
  __collect();
  return buf;
}

function typeName(type: i32): string {
  return type == 1 ? 'offer' : type == 2 ? 'answer' : '';
}

export function sdp_parse(ptr: usize, len: i32): usize {
  return output(parseImpl(input(ptr, len)));
}

export function sdp_write(ptr: usize, len: i32): usize {
  return output(writeImpl(input(ptr, len)));
}

/** `type`: 0 = none, 1 = offer, 2 = answer */
export function sdp_validate(ptr: usize, len: i32, type: i32): usize {
  return output(validateImpl(input(ptr, len), typeName(type)));
}

/** `type`: 0 = none, 1 = offer, 2 = answer */
export function sdp_validate_model(ptr: usize, len: i32, type: i32): usize {
  return output(validateModelImpl(input(ptr, len), typeName(type)));
}


/** The library version as a UTF-8 buffer; release it with sdp_free */
export function sdp_version(): usize {
  return output(VERSION);
}

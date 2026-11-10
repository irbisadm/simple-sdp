// Checks the `@irbisadm/simple-sdp/wasm` entry point of the npm package (wasm/dist) against
// the main entry point, through the package's own exports map. Needs `yarn asbuild && yarn build`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as ts from '@irbisadm/simple-sdp';
import * as wasm from '@irbisadm/simple-sdp/wasm';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '../test/fixtures');
const plain = (value) => JSON.parse(JSON.stringify(value));
const outcome = (fn) => {
  try {
    return {value: plain(fn())};
  } catch (e) {
    return {error: e.message, parseError: e instanceof ts.SdpParseError};
  }
};

const names = fs.readdirSync(fixtures).filter(f => f.endsWith('.sdp'));
for (const name of names) {
  const text = fs.readFileSync(path.join(fixtures, name), 'utf8');
  const type = name.includes('answer') ? 'answer' : 'offer';
  const model = ts.sdpReader.parse(text);
  assert.deepEqual(plain(wasm.sdpReader.parse(text)), plain(model), name);
  assert.equal(wasm.sdpWriter.write(model), ts.sdpWriter.write(model), name);
  assert.deepEqual(wasm.sdpValidator.validate(text, {type}), ts.sdpValidator.validate(text, {type}), name);
  assert.deepEqual(wasm.sdpValidator.validate(model), ts.sdpValidator.validate(model), name);
}

for (const text of ['', 'v=1\r\n', 'v=0\r\ns=-\r\no=- 1 1 IN IP4 h\r\nt=0 0\r\n', 'v=0\r\no=- 1 1 IN IP4 h\r\ns=-\r\nt=0 0\r\na=constructor\r\n']) {
  assert.deepEqual(outcome(() => wasm.sdpReader.parse(text)), outcome(() => ts.sdpReader.parse(text)), JSON.stringify(text));
  assert.equal(wasm.sdpReader.isValid(text), ts.sdpReader.isValid(text));
}
const lenientFixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '../test/fixtures-lenient');
const lenientTexts = [
  ...names.map(name => fs.readFileSync(path.join(fixtures, name), 'utf8')),
  ...fs.readdirSync(lenientFixtures).filter(f => f.endsWith('.sdp')).map(f => fs.readFileSync(path.join(lenientFixtures, f), 'utf8')),
  '', 'garbage', 'v=0\r\ns=-\r\no=- 1 1 IN IP4 h\r\nt=0 0\r\nm=audio x RTP/AVP 0\r\n',
];
for (const text of lenientTexts) {
  const result = ts.sdpReader.parseLenient(text);
  assert.deepEqual(plain(wasm.sdpReader.parseLenient(text)), plain(result), JSON.stringify(text));
  assert.equal(wasm.sdpReader.isComplete(result.sdp), ts.sdpReader.isComplete(result.sdp));
  assert.deepEqual(wasm.sdpValidator.validate(text, {lenient: true}), ts.sdpValidator.validate(text, {lenient: true}));
  assert.deepEqual(plain(wasm.sdpResolver.resolve(result.sdp)), plain(ts.sdpResolver.resolve(result.sdp)));
  assert.deepEqual(plain(wasm.sdpNegotiator.negotiate(result.sdp, result.sdp)), plain(ts.sdpNegotiator.negotiate(result.sdp, result.sdp)));
}
assert.deepEqual(outcome(() => wasm.sdpWriter.write({media: []})), outcome(() => ts.sdpWriter.write({media: []})));
assert.equal(wasm.version, ts.version);

console.log(`@irbisadm/simple-sdp/wasm matches the main entry point on ${names.length} fixtures (version ${wasm.version})`);

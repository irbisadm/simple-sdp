#!/usr/bin/env node
// Copies the release build of the AssemblyScript port into the mobile packages,
// which ship it as a resource. Run by `yarn asbuild`; CI checks that the copies are current.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'wasm/build/simple-sdp.wasm');
const targets = [
  'platforms/apple/Sources/SimpleSdp/Resources/simple-sdp.wasm',
  'platforms/kotlin/simple-sdp/src/main/wasm/simple-sdp.wasm',
];

const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const asVersion = /export const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(root, 'assembly/index.ts'), 'utf8'))?.[1];
if (asVersion !== pkgVersion) {
  console.error(`assembly/index.ts VERSION is ${asVersion}, package.json version is ${pkgVersion}`);
  process.exit(1);
}

for (const target of targets) {
  fs.mkdirSync(path.dirname(path.join(root, target)), {recursive: true});
  fs.copyFileSync(source, path.join(root, target));
  console.log(`${target} (${fs.statSync(source).size} bytes)`);
}

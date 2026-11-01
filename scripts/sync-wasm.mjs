#!/usr/bin/env node
// Copies the release build of the AssemblyScript port into the mobile packages, which ship
// it as a resource (CI checks that these committed copies are current), and assembles
// wasm/dist, the `@irbisadm/simple-sdp/wasm` entry point of the npm package.
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
const kotlinVersion = /val libraryVersion = "([^"]+)"/.exec(
  fs.readFileSync(path.join(root, 'platforms/kotlin/simple-sdp/build.gradle.kts'), 'utf8'))?.[1];
for (const [file, version] of [['assembly/index.ts', asVersion], ['platforms/kotlin/simple-sdp/build.gradle.kts', kotlinVersion]]) {
  if (version !== pkgVersion) {
    console.error(`${file} has version ${version}, package.json has ${pkgVersion}`);
    process.exit(1);
  }
}

for (const target of targets) {
  fs.mkdirSync(path.dirname(path.join(root, target)), {recursive: true});
  fs.copyFileSync(source, path.join(root, target));
  console.log(`${target} (${fs.statSync(source).size} bytes)`);
}

const dist = path.join(root, 'wasm/dist');
fs.rmSync(dist, {recursive: true, force: true});
fs.mkdirSync(dist, {recursive: true});
for (const [from, to] of [
  ['wasm/build/simple-sdp.wasm', 'simple-sdp.wasm'],
  ['wasm/build/simple-sdp.js', 'simple-sdp.mjs'],
  ['wasm/src/index.mjs', 'index.mjs'],
  ['wasm/src/index.d.ts', 'index.d.ts'],
]) {
  fs.copyFileSync(path.join(root, from), path.join(dist, to));
}
console.log(`wasm/dist: ${fs.readdirSync(dist).join(', ')}`);

#!/usr/bin/env node
// Captures real offer/answer SDPs from a locally installed browser.
//
//   node scripts/capture-browser-sdp/capture.mjs chrome  /usr/bin/google-chrome-stable
//   node scripts/capture-browser-sdp/capture.mjs firefox /usr/bin/firefox
//   node scripts/capture-browser-sdp/capture.mjs safari --serve   # open the printed URL manually
//
// Writes test/fixtures/<browser>-<scenario>-<offer|answer>.sdp (CRLF, as emitted
// by the browser) and prints the browser user agent. The SDP is not modified.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const [, , browser, binary] = process.argv;
if (!browser || !binary) {
  console.error('usage: capture.mjs <name> <path-to-binary | --serve>');
  process.exit(1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../test/fixtures');
const page = fs.readFileSync(path.join(here, 'page.html'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sdp-capture-${browser}-`));

let child;
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, {'content-type': 'text/html'}).end(page);
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.writeHead(204).end();
    const result = JSON.parse(body);
    console.log(`user agent: ${result.userAgent}`);
    for (const [scenario, pair] of Object.entries(result.scenarios)) {
      if (pair.error) {
        console.error(`${scenario}: ${pair.error}`);
        continue;
      }
      for (const kind of ['offer', 'answer']) {
        const file = path.join(outDir, `${browser}-${scenario}-${kind}.sdp`);
        fs.writeFileSync(file, pair[kind]);
        console.log(`wrote ${path.relative(process.cwd(), file)}`);
      }
    }
    child?.kill();
    server.close();
    if (!child) fs.rmSync(profile, {recursive: true, force: true});
  });
});

server.listen(binary === '--serve' ? 8642 : 0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  if (binary === '--serve') {
    console.log(`open ${url} in ${browser}`);
    return;
  }
  const args = browser === 'firefox'
    ? ['--headless', '-no-remote', '-profile', profile, url]
    : ['--headless=new', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, '--autoplay-policy=no-user-gesture-required', url];
  child = spawn(binary, args, {stdio: 'ignore'});
  child.on('exit', () => fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5}));
  setTimeout(() => {
    console.error('timeout');
    child.kill();
    process.exit(1);
  }, 60000).unref();
});

#!/usr/bin/env node
// Runs the library over public SDP collections and captures, and reports where it breaks
// its own rules. The data is downloaded into .cache/external-sdp (git-ignored) and stays
// out of this repository: much of it has a license that does not fit here, or none at all.
// This is a manual check, not part of `yarn test`, CI or the release process.
//
//   yarn asbuild && yarn build && yarn check:external [--only set1,set2]
//
// Captures need `tshark`; without it those sets are skipped. Downloaded files are only read
// as data, never executed. The last recorded result is in the README ("Checked against public
// SDP sets").
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import * as ts from '../../dist/index.mjs';
import * as wasm from '../../wasm/dist/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.cache/external-sdp');

// ---------------------------------------------------------------------------
// Sources. A GitHub source is pinned to a commit, so a run can be repeated.
// ---------------------------------------------------------------------------

const WIKI = 'https://wiki.wireshark.org/SampleCaptures';
const WIKI_CAPTURES = /^(aaa\.pcap|SIP_CALL_RTP_G711.*|SIP_DTMF2\.cap|DTMFsipinfo\.pcap|h223-over-rtp\.pcap\.gz|h263-over-rtp\.pcap|metasploit-sip-invite-spoof\.pcap|FAX-Call-t38-CA-TDM-SIP-FB-1\.pcap|Asterisk_ZFONE_XLITE\.pcap|MagicJack-_pwr_up\.pcap|MagicJack-_short_call\.pcap|sip-rtp-.*\.pcap)$/;

const CAPTURE = /\.(pcap|pcapng|cap)(\.gz)?$/;

const SETS = [
  {name: 'sdp-transform', repo: 'clux/sdp-transform', commit: '8e39bde153ecf10e0b9d885cff9bb58fafbb10bd', dir: 'test', match: /\.sdp$/, read: wholeFile},
  {name: 'libwebrtc-corpus', repo: 'webrtc-sdk/webrtc', commit: '9c3a1386f07e4348c28cd85c066821cebc3b56e4', dir: 'test/fuzzers/corpora/sdp-corpus', match: /\.sdp$/, read: wholeFile},
  {name: 'mozilla-webrtc-sdp', repo: 'mozilla/webrtc-sdp', commit: 'a3f731fce84bb6bb66b90674a8787eead4bca78e', dir: 'examples/sdps', match: /\.sdp$/, read: wholeFile},
  {name: 'pjproject', repo: 'pjsip/pjproject', commit: 'c0261ff0bf94a3f7bd67661573597dafe69725be', dir: 'tests/pjsua/scripts-sendto', match: /\.py$/, read: pythonStrings},
  {name: 'rtpengine', repo: 'sipwise/rtpengine', commit: '89589b77e404e64159b8be97a7e6fa59f46898b8', dir: 't', match: /\.pl$/, read: perlHeredocs},
  {name: 'semantic-sdp', repo: 'medooze/semantic-sdp-js', commit: '0904b508f5168f750e662e76c98e1d6b20a00709', dir: 'test', match: /\.js$/, read: jsStrings},
  {name: 'goffinet-captures', repo: 'goffinet/sip_captures', commit: '4a2ba0037b8db5410876d83e1fe794d81ebbc0c5', dir: '', match: CAPTURE, read: captureBodies},
  {name: 'sngrep-captures', repo: 'irontec/sngrep', commit: '07a063c37c17d7b051300935cde5952345975135', dir: 'tests', match: CAPTURE, read: captureBodies},
  {name: 'wireshark-captures', repo: 'wireshark/wireshark', commit: '70a8e4b49b3615ee3916b74bd847b92a857cb115', dir: 'test/captures', match: CAPTURE, read: captureBodies},
  {name: 'malcolm-sip', files: ['https://raw.githubusercontent.com/idaholab/Malcolm-Test-Artifacts/573476b208839243d14ae85d26601f0b6995e621/pcap/protocols/SIP.pcap'], match: CAPTURE, read: captureBodies},
  {name: 'wireshark-wiki', wiki: true, match: CAPTURE, read: captureBodies},
];

// ---------------------------------------------------------------------------
// Extraction: each `read` returns the session descriptions found in one file
// ---------------------------------------------------------------------------

async function wholeFile(file) {
  return [new TextDecoder().decode(fs.readFileSync(file))];
}

/** `"""\nv=0\n..."""` */
async function pythonStrings(file) {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/"""\s*\n(v=[\s\S]*?)"""/g)].map(m => m[1]);
}

/**
 * `<<SDP ... SDP` of the rtpengine tests: the input, then a dashed line and the expected
 * output with placeholders, which is not SDP. Inputs with Perl variables and heredocs that
 * hold only such an expected output (`SDP_VERSION`, `PORT`) are left out.
 */
async function perlHeredocs(file) {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/<<SDP\b[^\n]*\n([\s\S]*?)\nSDP$/gm)]
    .map(m => m[1].split(/^-{5,}$/m)[0])
    .filter(sdp => sdp.startsWith('v=') && !sdp.includes('$') && !/SDP_VERSION|\bPORT\b/.test(sdp));
}

/** `"v=0\r\n" + "o=...\r\n" + ...` and template strings */
async function jsStrings(file) {
  const text = fs.readFileSync(file, 'utf8');
  const concatenated = [...text.matchAll(/"v=0[^"\n]*"(?:\s*\+\s*"(?:[^"\\\n]|\\.)*")*/g)].map(m => {
    const parts = m[0].match(/"(?:[^"\\\n]|\\.)*"/g);
    return parts.map(part => JSON.parse(part)).join('');
  });
  const templates = [...text.matchAll(/`(v=0[^`$]*)`/g)].map(m => m[1]);
  return [...concatenated, ...templates];
}

/** tshark does not finish on some files of the Wireshark test set */
const TSHARK_TIMEOUT_MS = 60_000;
const timedOut = [];

function run(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'ignore'], timeout: TSHARK_TIMEOUT_MS, killSignal: 'SIGKILL'});
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.on('error', () => resolve(null));
    child.on('close', (code, signal) => {
      if (signal) {
        timedOut.push(args[1]);
      }
      resolve(code === 0 ? Buffer.concat(chunks).toString() : null);
    });
  });
}

/** SIP bodies with Content-Type application/sdp; tshark reassembles TCP and IP fragments */
async function captureBodies(file) {
  const stored = `${file}.bodies.json`;
  if (fs.existsSync(stored)) {
    return JSON.parse(fs.readFileSync(stored, 'utf8'));
  }
  const out = await run('tshark', ['-r', file, '-Y', 'sip.msg_body', '-T', 'fields', '-e', 'sip.Content-Type', '-e', 'sip.msg_body']);
  if (out === null) {
    return [];
  }
  const bodies = [];
  for (const line of out.split('\n')) {
    const [type, hex] = line.split('\t');
    if (hex && /^application\/sdp/i.test(type.trim())) {
      bodies.push(new TextDecoder().decode(Buffer.from(hex.replace(/[:,]/g, ''), 'hex')));
    }
  }
  fs.writeFileSync(stored, JSON.stringify(bodies)); // tshark takes minutes over a large set
  return bodies;
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

const USER_AGENT = {headers: {'user-agent': 'simple-sdp-check-external'}};

async function download(url, target) {
  let response = await fetch(url, USER_AGENT);
  for (let retry = 0; response.status === 429 && retry < 5; retry++) { // the wiki limits the rate
    await new Promise(resolve => setTimeout(resolve, 20_000));
    response = await fetch(url, USER_AGENT);
  }
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

/** Extracts one directory of a commit; nothing in it is executed */
async function fetchRepo(set, target) {
  const response = await fetch(`https://codeload.github.com/${set.repo}/tar.gz/${set.commit}`, USER_AGENT);
  if (!response.ok) {
    throw new Error(`${set.repo}: HTTP ${response.status}`);
  }
  const top = `${set.repo.split('/')[1]}-${set.commit}`;
  const member = set.dir ? `${top}/${set.dir}` : top;
  const strip = member.split('/').length;
  fs.mkdirSync(target, {recursive: true});
  await new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xzf', '-', '-C', target, `--strip-components=${strip}`, member], {stdio: ['pipe', 'ignore', 'inherit']});
    tar.on('error', reject);
    tar.on('close', code => code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`)));
    Readable.fromWeb(response.body).pipe(tar.stdin);
  });
}

async function fetchWiki(target) {
  const response = await fetch(WIKI, USER_AGENT);
  const page = await response.text();
  const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(href => WIKI_CAPTURES.test(path.basename(href)));
  for (const href of new Set(hrefs)) {
    try {
      await download(new URL(href, WIKI).href, path.join(target, path.basename(href)));
    } catch (e) {
      console.log(`not downloaded: ${e.message}`); // the wiki has broken links
    }
  }
}

async function ensure(set) {
  const dir = path.join(cache, 'sets', set.name);
  const done = path.join(dir, '.done');
  if (!fs.existsSync(done)) {
    fs.rmSync(dir, {recursive: true, force: true});
    if (set.repo) {
      await fetchRepo(set, dir);
    } else if (set.wiki) {
      await fetchWiki(dir);
    } else {
      for (const url of set.files) {
        await download(url, path.join(dir, path.basename(url)));
      }
    }
    fs.writeFileSync(done, '');
  }
  return dir;
}

function listFiles(dir, match) {
  return fs.readdirSync(dir, {recursive: true, withFileTypes: true})
    .filter(entry => entry.isFile() && match.test(entry.name))
    .map(entry => path.join(entry.parentPath ?? entry.path, entry.name))
    .sort();
}

/** Runs `fn` over `items`, a few at a time */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({length: limit}, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

// ---------------------------------------------------------------------------
// Checks. A rejection by strict mode is a statistic; a broken rule is a problem.
// ---------------------------------------------------------------------------

const plain = value => JSON.parse(JSON.stringify(value));
const outcome = fn => {
  try {
    return {value: plain(fn())};
  } catch (e) {
    return {error: e.message};
  }
};
const STRUCTURAL = new Set(['empty-line', 'malformed-line', 'unknown-line-type', 'out-of-order', 'wrong-scope', 'duplicate-line', 'trailing-whitespace']);
const shape = reason => reason.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N');

function check(text, problem, changed) {
  const strict = outcome(() => ts.sdpReader.parse(text));
  let error = null;
  try {
    ts.sdpReader.parse(text);
  } catch (e) {
    error = e;
  }

  let lenient;
  try {
    lenient = ts.sdpReader.parseLenient(text);
  } catch (e) {
    problem('parseLenient threw', e.message);
    return {error};
  }
  const {sdp: model, warnings} = lenient;
  // Where lenient mode sees other lines than strict mode, the rules below do not apply
  const loneCr = /\r(?!\n)/.test(text);
  const trimmed = /[ \t](\r?\n|$)/.test(text);

  if (error && !loneCr && !trimmed) {
    const first = warnings[0];
    if (!first || first.lineNumber !== error.lineNumber || first.reason !== error.reason) {
      problem('first warning differs from the strict error', `${error.lineNumber}: ${error.reason} / ${first?.lineNumber}: ${first?.reason}`);
    }
  }
  if (!error && !loneCr && !trimmed) {
    if (warnings.length) {
      problem('warnings on a description strict accepts', warnings[0].reason);
    }
    try {
      assert.deepEqual(plain(model), strict.value);
    } catch {
      problem('lenient model differs from the strict model', '');
    }
  }
  if (error && !warnings.length && !loneCr) {
    problem('no warnings on a description strict rejects', error.reason);
  }
  if (!error) {
    const written = outcome(() => ts.sdpWriter.write(strict.value));
    const counts = new Map();
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
    for (const line of (written.value ?? '').split('\r\n').filter(Boolean)) {
      counts.set(line, (counts.get(line) ?? 0) - 1);
    }
    for (const [line, count] of counts) {
      if (count > 0) { // a statistic: the writer normalizes on purpose, e.g. spaces in fmtp
        changed.push(line.startsWith('a=') ? line.split(/[: ]/)[0] : line.slice(0, 2));
      }
    }
    const again = outcome(() => ts.sdpReader.parse(ts.sdpWriter.write(strict.value)));
    try {
      assert.deepEqual(again.value, strict.value);
    } catch {
      problem('parse(write(parse(x))) differs from parse(x)', again.error ?? '');
    }
  }
  if (warnings.every(w => STRUCTURAL.has(w.code)) && ts.sdpReader.isComplete(model)) {
    const repaired = outcome(() => ts.sdpReader.parse(ts.sdpWriter.write(model)));
    if (repaired.error) {
      problem('repair property', repaired.error);
    }
  }
  for (const options of [{}, {lenient: true}, {type: 'answer'}]) {
    const issues = outcome(() => ts.sdpValidator.validate(text, options));
    if (issues.error) {
      problem('validate threw', issues.error);
    }
    try {
      assert.deepEqual(outcome(() => wasm.sdpValidator.validate(text, options)), issues);
    } catch {
      problem('wasm differs: validate', JSON.stringify(options));
    }
  }
  try {
    assert.deepEqual(outcome(() => wasm.sdpReader.parse(text)), strict);
  } catch {
    problem('wasm differs: parse', '');
  }
  try {
    assert.deepEqual(outcome(() => wasm.sdpReader.parseLenient(text)), {value: plain(lenient)});
  } catch {
    problem('wasm differs: parseLenient', '');
  }
  try {
    assert.deepEqual(outcome(() => wasm.sdpWriter.write(plain(model))), outcome(() => ts.sdpWriter.write(plain(model))));
  } catch {
    problem('wasm differs: write of the lenient model', '');
  }
  return {error, warnings};
}

// ---------------------------------------------------------------------------

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const hasTshark = (await run('tshark', ['-v'])) !== null;
const report = {version: ts.version, date: new Date().toISOString(), sets: []};
let problems = 0;

for (const set of SETS.filter(s => !only || only.includes(s.name))) {
  if (set.read === captureBodies && !hasTshark) {
    console.log(`\n## ${set.name}: skipped, tshark is not installed`);
    continue;
  }
  let dir;
  try {
    dir = await ensure(set);
  } catch (e) {
    console.log(`\n## ${set.name}: download failed: ${e.message}`);
    report.sets.push({name: set.name, failed: e.message});
    continue;
  }
  const files = listFiles(dir, set.match);
  const found = await mapLimit(files, 8, async file => ({file: path.relative(dir, file), bodies: await set.read(file)}));
  const seen = new Set();
  const result = {
    name: set.name, source: set.repo ? `${set.repo}@${set.commit}` : (set.files?.[0] ?? WIKI), files: files.length,
    filesWithSdp: 0, total: 0, unique: 0, accepted: 0, rejected: 0, reasons: {}, codes: {}, changedByWrite: {}, rejections: [], problems: [],
  };
  for (const {file, bodies} of found) {
    result.filesWithSdp += bodies.length ? 1 : 0;
    for (const text of bodies) {
      result.total++;
      const hash = crypto.createHash('sha256').update(text).digest('hex');
      if (seen.has(hash)) {
        continue;
      }
      seen.add(hash);
      result.unique++;
      const changedLines = [];
      const {error, warnings} = check(text, (rule, detail) => {
        problems++;
        result.problems.push({file, hash, rule, detail});
      }, changedLines);
      if (error) {
        result.rejected++;
        const key = shape(error.reason);
        result.reasons[key] = (result.reasons[key] ?? 0) + 1;
        result.rejections.push({file, hash, lineNumber: error.lineNumber, line: error.line, reason: error.reason});
      } else {
        result.accepted++;
      }
      for (const line of changedLines) {
        result.changedByWrite[line] = (result.changedByWrite[line] ?? 0) + 1;
      }
      for (const w of warnings ?? []) {
        result.codes[w.code] = (result.codes[w.code] ?? 0) + 1;
      }
    }
  }
  report.sets.push(result);
  console.log(`\n## ${set.name}: ${files.length} files, ${result.filesWithSdp} with SDP, ${result.total} descriptions, ${result.unique} unique; strict accepts ${result.accepted}, rejects ${result.rejected}; problems ${result.problems.length}`);
  for (const [reason, count] of Object.entries(result.reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(count).padStart(5)}  ${reason}`);
  }
  if (Object.keys(result.changedByWrite).length) {
    console.log(`   lines changed by write: ${JSON.stringify(result.changedByWrite)}`);
  }
  for (const p of result.problems.slice(0, 20)) {
    console.log(`   PROBLEM ${p.rule}: ${p.file} ${p.detail}`);
  }
}

fs.mkdirSync(cache, {recursive: true});
fs.writeFileSync(path.join(cache, 'report.json'), JSON.stringify(report, null, 2));
report.timedOut = timedOut.map(file => path.relative(cache, file));
for (const file of report.timedOut) {
  console.log(`tshark timed out, not checked: ${file}`);
}
console.log(`\nVersion ${ts.version}. Problems: ${problems}. Full report: ${path.relative(root, path.join(cache, 'report.json'))}`);
process.exit(problems ? 1 : 0);

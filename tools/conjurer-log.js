#!/usr/bin/env node
// Reads Conjurer's log straight out of the game's saved variables, so a test session can be
// looked at without copying anything out of the chat window.
//
// The client writes the log at every /reload and logout to
//   <WoW>/_classic_beta_/WTF/Account/<account>/SavedVariables/Conjurer.lua
// and each character's settings to
//   <WoW>/_classic_beta_/WTF/Account/<account>/<realm>/<character>/SavedVariables/Conjurer.lua
//
//   node tools/conjurer-log.js                 the latest session, and the latest debug report
//   node tools/conjurer-log.js --last 300      the last 300 lines, across sessions
//   node tools/conjurer-log.js --session all   every session kept (the log keeps 800 lines)
//   node tools/conjurer-log.js --session 12    one session
//   node tools/conjurer-log.js --db            each character's Conjurer settings as well
//   node tools/conjurer-log.js --json          everything as JSON
//   node tools/conjurer-log.js --file <path>   read this file instead of looking for it
//   node tools/conjurer-log.js --wow <path>    the game folder holding _classic_beta_
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] || true) : null; };
const has = name => args.includes(name);

// ------------------------------------------------------------------
// A reader for the saved variables format: "Name = value" lines, where a value is a table,
// a string, a number, true, false or nil. Written for what the client emits, nothing more.
// ------------------------------------------------------------------
function parseSavedVariables(text) {
  let i = 0;
  const out = {};
  const fail = what => { throw new Error(what + ' at character ' + i + ': ' + JSON.stringify(text.slice(i, i + 40))); };
  const skip = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text.startsWith('--', i)) { while (i < text.length && text[i] !== '\n') i++; continue; }
      break;
    }
  };
  const name = () => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i, i + 200));
    if (!m) fail('expected a name');
    i += m[0].length;
    return m[0];
  };
  const string = () => {
    const quote = text[i++];
    let s = '';
    while (i < text.length && text[i] !== quote) {
      let c = text[i++];
      if (c === '\\') {
        c = text[i++];
        if (c === 'n') s += '\n';
        else if (c === 't') s += '\t';
        else if (c === 'r') s += '\r';
        else if (c === '\n') s += '\n';
        else if (/[0-9]/.test(c)) {
          let digits = c;
          while (digits.length < 3 && /[0-9]/.test(text[i])) digits += text[i++];
          s += String.fromCharCode(parseInt(digits, 10));
        } else s += c;
      } else s += c;
    }
    i++;
    return s;
  };
  const value = () => {
    skip();
    const c = text[i];
    if (c === '{') return table();
    if (c === '"' || c === "'") return string();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('nil', i)) { i += 3; return null; }
    const m = /^-?(?:0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+)/.exec(text.slice(i, i + 64));
    if (m) { i += m[0].length; return Number(m[0]); }
    fail('unexpected value');
  };
  const table = () => {
    i++; // {
    const obj = {};
    let n = 0;
    let arrayOnly = true;
    for (;;) {
      skip();
      if (text[i] === '}') { i++; break; }
      let key;
      if (text[i] === '[') {
        i++;
        key = value();
        skip();
        if (text[i] !== ']') fail('expected ]');
        i++;
        skip();
        if (text[i] !== '=') fail('expected =');
        i++;
        if (typeof key !== 'number') arrayOnly = false;
        obj[key] = value();
      } else if (/[A-Za-z_]/.test(text[i]) && /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(text.slice(i, i + 200))) {
        key = name();
        skip();
        i++; // =
        arrayOnly = false;
        obj[key] = value();
      } else {
        n++;
        obj[n] = value();
      }
      skip();
      if (text[i] === ',' || text[i] === ';') i++;
    }
    const keys = Object.keys(obj);
    if (arrayOnly && keys.every((k, idx) => Number(k) === idx + 1)) return keys.map(k => obj[k]);
    return obj;
  };
  for (;;) {
    skip();
    if (i >= text.length) break;
    const key = name();
    skip();
    if (text[i] !== '=') fail('expected =');
    i++;
    out[key] = value();
  }
  return out;
}

// ------------------------------------------------------------------
// Finding the files
// ------------------------------------------------------------------
function wowRoots() {
  const given = opt('--wow');
  const candidates = given ? [given] : [
    'C:/Program Files (x86)/World of Warcraft',
    'C:/Program Files/World of Warcraft',
    'D:/World of Warcraft',
  ];
  return candidates.map(r => path.join(r, '_classic_beta_', 'WTF', 'Account')).filter(p => fs.existsSync(p));
}

function findLogFiles() {
  const found = [];
  for (const accounts of wowRoots()) {
    for (const account of fs.readdirSync(accounts)) {
      const file = path.join(accounts, account, 'SavedVariables', 'Conjurer.lua');
      if (account !== 'SavedVariables' && fs.existsSync(file)) found.push(file);
    }
  }
  return found;
}

function findCharacterFiles() {
  const found = [];
  for (const accounts of wowRoots()) {
    for (const account of fs.readdirSync(accounts)) {
      const accountDir = path.join(accounts, account);
      if (account === 'SavedVariables' || !fs.statSync(accountDir).isDirectory()) continue;
      for (const realm of fs.readdirSync(accountDir)) {
        const realmDir = path.join(accountDir, realm);
        if (realm === 'SavedVariables' || !fs.statSync(realmDir).isDirectory()) continue;
        for (const character of fs.readdirSync(realmDir)) {
          const file = path.join(realmDir, character, 'SavedVariables', 'Conjurer.lua');
          if (fs.existsSync(file)) found.push({ file, character: character + ' (' + realm + ')' });
        }
      }
    }
  }
  return found;
}

function age(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return s + ' seconds ago';
  if (s < 5400) return Math.round(s / 60) + ' minutes ago';
  if (s < 172800) return Math.round(s / 3600) + ' hours ago';
  return Math.round(s / 86400) + ' days ago';
}

// ------------------------------------------------------------------
// Printing
// ------------------------------------------------------------------
function main() {
  const file = opt('--file') || findLogFiles().sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!file || !fs.existsSync(file)) {
    console.log('No Conjurer log found. It is written when the game saves: type /reload in game (or log out) first.');
    process.exitCode = 1;
    return;
  }
  const stat = fs.statSync(file);
  const data = parseSavedVariables(fs.readFileSync(file, 'utf8'));
  const log = data.ConjurerLog || {};
  const entries = Array.isArray(log.entries) ? log.entries : Object.values(log.entries || {});

  if (has('--json')) {
    const out = { file, written: stat.mtime.toISOString(), log };
    if (has('--db')) out.characters = findCharacterFiles().map(c => ({ character: c.character, db: parseSavedVariables(fs.readFileSync(c.file, 'utf8')).ConjurerDB }));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log('Conjurer log: ' + file);
  console.log('written ' + stat.mtime.toLocaleString() + ' (' + age(Date.now() - stat.mtimeMs) + '); version '
    + log.version + ', session ' + log.session + ', ' + entries.length + ' lines kept');

  const sessionOf = line => { const m = /^#(\d+) /.exec(line); return m ? Number(m[1]) : null; };
  let lines;
  const last = opt('--last');
  const session = opt('--session');
  if (last) {
    lines = entries.slice(-Number(last));
  } else if (session === 'all') {
    lines = entries;
  } else {
    const wanted = session ? Number(session) : log.session;
    lines = entries.filter(l => sessionOf(l) === wanted);
    if (lines.length === 0 && entries.length) {
      // The current session has written nothing yet: show the one before it.
      const previous = sessionOf(entries[entries.length - 1]);
      lines = entries.filter(l => sessionOf(l) === previous);
    }
  }
  console.log('');
  for (const line of lines) console.log(line);

  if (Array.isArray(log.report) && !has('--no-report')) {
    console.log('');
    console.log('--- debug report, ' + (log.reportAt || '?') + ' ---');
    for (const line of log.report) console.log(line);
  }

  if (has('--db')) {
    for (const c of findCharacterFiles()) {
      console.log('');
      console.log('--- ConjurerDB for ' + c.character + ' ---');
      const db = parseSavedVariables(fs.readFileSync(c.file, 'utf8')).ConjurerDB;
      console.log(JSON.stringify(db, null, 2));
    }
  }
}

if (require.main === module) main();
module.exports = { parseSavedVariables };

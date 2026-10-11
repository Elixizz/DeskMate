#!/usr/bin/env node
// Rebuilds the verified-plugin store in site/plugins from verified-plugins/: one zip per plugin plus index.json.
//
//   node tools/build-store.js [--skip gmail,other]   (--skip leaves plugins that aren't ready out of the store)
//
// Then upload site/ to deskmate.lapistudios.com (see site/README in the repo, or ask).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const BASE_URL = 'https://deskmate.lapistudios.com/plugins/';
const root = path.join(__dirname, '..');
const src = path.join(root, 'verified-plugins');
const out = path.join(root, 'site', 'plugins');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const skipAt = process.argv.indexOf('--skip');
const skip = new Set(skipAt > 0 ? (process.argv[skipAt + 1] || '').split(',') : []);

const plugins = [];
for (const name of fs.readdirSync(src).sort()) {
  const dir = path.join(src, name);
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) continue;
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (skip.has(m.id) || skip.has(name)) { console.log(`skipped ${m.id}`); continue; }
  const zip = new AdmZip();
  (function add(rel) {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) add(r);
      else zip.addFile(r, fs.readFileSync(path.join(dir, r)));
    }
  })('');
  const buf = zip.toBuffer();
  const file = `${m.id}-${m.version}.zip`;
  fs.writeFileSync(path.join(out, file), buf);
  plugins.push({
    id: m.id, name: m.name, version: m.version, author: m.author || '', description: m.description || '',
    permissions: m.permissions || [], download: BASE_URL + file, sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  });
  console.log(`packed ${file} (${(buf.length / 1024).toFixed(1)} KB)`);
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ name: 'DeskMate verified plugins', plugins }, null, 2) + '\n');
console.log(`wrote site/plugins/index.json with ${plugins.length} plugins`);

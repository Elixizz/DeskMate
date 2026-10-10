#!/usr/bin/env node
// Packs a plugin folder into a zip for the Deskmate store and prints the entry to add to the store's index.json.
//
//   node tools/pack-plugin.js <plugin-folder> [--url https://your-host/deskmate/plugins/] [--out dist]
//
// Upload the zip next to your index.json (or wherever --url points) and paste the printed entry into
// index.json's "plugins" list. Deskmate checks the zip against the sha256 before installing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : def; };
const baseUrl = opt('--url', '');
const outDir = path.resolve(opt('--out', 'dist'));
const dir = args[0] && path.resolve(args[0]);
if (!dir || !fs.existsSync(path.join(dir, 'manifest.json'))) {
  console.error('Usage: node tools/pack-plugin.js <plugin-folder> [--url https://host/path/] [--out dist]');
  process.exit(1);
}

const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
for (const k of ['id', 'name', 'version']) if (!m[k]) { console.error(`manifest.json is missing "${k}"`); process.exit(1); }

const zip = new AdmZip();
(function add(rel) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(e.name) || e.name.startsWith('.')) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) add(r);
    else zip.addFile(r, fs.readFileSync(path.join(dir, r)));
  }
})('');
const buf = zip.toBuffer();
fs.mkdirSync(outDir, { recursive: true });
const name = `${m.id}-${m.version}.zip`;
fs.writeFileSync(path.join(outDir, name), buf);

const entry = {
  id: m.id, name: m.name, version: m.version, author: m.author || '', description: m.description || '',
  permissions: m.permissions || [],
  download: (baseUrl && !baseUrl.endsWith('/') ? baseUrl + '/' : baseUrl) + name,
  sha256: crypto.createHash('sha256').update(buf).digest('hex'),
};
console.log(`Wrote ${path.join(outDir, name)} (${(buf.length / 1024).toFixed(1)} KB)\n\nAdd this to index.json "plugins":\n`);
console.log(JSON.stringify(entry, null, 2));

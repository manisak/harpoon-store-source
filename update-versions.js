// Updates current_version for all apps from their release sources.
// Uses data/github-token (if present) for GitHub API (5000/h).
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const http = require('https');
const path = require('path');

let GH_TOKEN = '';
try { GH_TOKEN = fs.readFileSync(path.join(__dirname, 'data', 'github-token'), 'utf8').trim(); } catch {}
const db = new sqlite3.Database(path.join(__dirname, 'data', 'store.db'));

function get(url) {
  return new Promise(r => {
    const headers = { 'User-Agent': 'harpoon-store-versions' };
    if (/api\.github\.com/.test(url) && GH_TOKEN) headers.Authorization = 'Bearer ' + GH_TOKEN;
    const q = http.get(url, { headers }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { r({ status: res.statusCode, json: JSON.parse(b), body: b }); } catch { r({ status: res.statusCode, json: null, body: b }); } }); });
    q.on('error', () => r({ status: 0, json: null, body: '' }));
    q.setTimeout(20000, () => { q.destroy(); r({ status: 0, json: null, body: '' }); });
  });
}
function parseTag(tag) { return String(tag || '').replace(/^[vV]/, ''); }

(async () => {
  const [host, user, pass] = ['localhost', 'store', 'x']; // unused, silence
  await new Promise(r => db.run('ALTER TABLE apps ADD COLUMN current_version TEXT', () => r()));
  await new Promise(r => db.run("ALTER TABLE apps ADD COLUMN version_checked_at TEXT", () => r())); // ignore dup errors
  const apps = await new Promise((res, rej) => db.all("SELECT id, name, repo_url FROM apps WHERE status='approved'", (e, r) => e ? rej(e) : res(r)));
  let ok = 0, none = 0;
  for (const a of apps) {
    let ver = null, m;
    const url = a.repo_url;
    if ((m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/i))) {
      const r = await get(`https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest`);
      if (r.status === 200 && r.json && r.json.tag_name) ver = parseTag(r.json.tag_name);
    } else if ((m = url.match(/^https:\/\/codeberg\.org\/([^/]+)\/([^/#?]+)/i))) {
      const r = await get(`https://codeberg.org/api/v1/repos/${m[1]}/${m[2]}/releases?limit=1`);
      if (r.status === 200 && Array.isArray(r.json) && r.json[0]) ver = parseTag(r.json[0].tag_name);
    } else if ((m = url.match(/^https:\/\/gitlab\.com\/([^/]+)\/([^/#?]+)/i))) {
      const r = await get(`https://gitlab.com/api/v4/projects/${encodeURIComponent(m[1] + '/' + m[2])}/releases`);
      if (r.status === 200 && Array.isArray(r.json) && r.json[0]) ver = parseTag(r.json[0].tag_name);
    } else if ((m = url.match(/sailfishos-chum\.github\.io\/apps\/([^/?#]+)/i))) {
      const r = await get(`https://sailfishos-chum.github.io/apps/${decodeURIComponent(m[1]).replace(/\/$/, '')}/`);
      const mm = (r.body || '').match(/Version[^d]{0,40}(\d+\.\d+[\w.\\-]*\d)/i);
      if (mm) ver = mm[1];
    }
    if (ver) {
      await new Promise(r => db.run(`UPDATE apps SET current_version=?, version_checked_at=datetime('now') WHERE id=?`, ver, a.id, e => e ? rej(e) : r()));
      ok++;
    } else { none++; await new Promise(r => db.run(`UPDATE apps SET version_checked_at=datetime('now') WHERE id=?`, a.id, e => e ? rej(e) : r())); }
  }
  console.log('versions updated:', ok, 'no version found:', none);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

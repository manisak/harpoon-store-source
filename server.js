'use strict';
// Harpoon Store – community app listing with QR codes for Harpoon
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const httpc = require('https');
const QRCode = require('qrcode')

const PORT = process.env.PORT || 8080;
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(path.join(DATA_DIR, 'store.db'));
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    passhash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    repo_url TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    package_name TEXT NOT NULL DEFAULT '',
    category_id INTEGER NOT NULL REFERENCES categories(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1', () => {});
  db.run('ALTER TABLE users ADD COLUMN note TEXT', () => {});
  db.run('ALTER TABLE apps ADD COLUMN icon_file TEXT', () => {});
  db.run(`CREATE TABLE IF NOT EXISTS reset_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  fs.mkdirSync(path.join(DATA_DIR, 'icons'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'shots'), { recursive: true });
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    q_id INTEGER NOT NULL REFERENCES questions(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS app_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(app_id, user_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    file TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Seed categories
  const cats = [
    ['general', 'General'], ['education', 'Education'], ['entertainment', 'Entertainment'],
    ['games', 'Games'], ['graphics', 'Graphics'], ['maps', 'Maps & Travel'],
    ['multimedia', 'Multimedia'], ['network', 'Network & Communication'],
    ['office', 'Office'], ['productivity', 'Productivity'], ['science', 'Science'],
    ['utilities', 'Utilities'], ['other', 'Other'],
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO categories (slug, name) VALUES (?, ?)');
  for (const [slug, name] of cats) stmt.run(slug, name);
  stmt.finalize();
});

function hash(pw, salt) { return crypto.scryptSync(pw, salt, 32).toString('hex'); }

const ICON_DIR = path.join(DATA_DIR, 'icons');
const SHOT_DIR = path.join(DATA_DIR, 'shots');
function sniffImg(buf) {
  if (buf.length > 2 * 1024 * 1024) return null;
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
const shotUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2.5 * 1024 * 1024, files: 6 } });
async function saveShots(appId, req) {
  const saved = [];
  const list = Array.isArray(req.files || []) ? (req.files || []) : ((req.files && req.files.screenshots) || []);
  for (const f of list) {
    if (!f.size) continue;
    const ext = sniffImg(f.buffer);
    if (!ext) continue;
    const name = `shot-${appId}-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
    fs.writeFileSync(path.join(SHOT_DIR, name), f.buffer);
    await dbRun('INSERT INTO screenshots (app_id, file) VALUES (?,?)', appId, name);
    saved.push(name);
  }
  return saved;
}

function sniffIcon(buf) {
  if (buf.length > 256 * 1024) return null;
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
// fields: icon_file (upload) takes precedence over icon_url
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2.5 * 1024 * 1024, files: 8 } });
async function saveIcon(req) {
  const iconFile = (req.files && req.files.icon_file && req.files.icon_file[0]) || req.file;
  if (iconFile && iconFile.size) {
    const ext = sniffIcon(iconFile.buffer);
    if (!ext) return 'INVALID';
    const name = `app-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
    fs.writeFileSync(path.join(ICON_DIR, name), iconFile.buffer);
    return name;
  }
  const u = String(req.body.icon_url || '').trim();
  if (!u) return null;
  try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) throw 0; return x.href; } catch { return 'INVALID'; }
}
async function setIcon(appId, value) {
  if (value !== 'INVALID') await dbRun('UPDATE apps SET icon_file=?, updated_at=datetime(\'now\') WHERE id=?', value, appId);
}

const SECRET_FILE = path.join(DATA_DIR, 'session-secret');
const SECRET = process.env.SESSION_SECRET || (fs.existsSync(SECRET_FILE) ? fs.readFileSync(SECRET_FILE, 'utf8') : crypto.randomBytes(32).toString('hex'));
if (!process.env.SESSION_SECRET) fs.writeFileSync(SECRET_FILE, SECRET);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: DATA_DIR }),
  secret: SECRET,
  resave: false, saveUninitialized: false, cookie: { maxAge: 30 * 24 * 3600 * 1000 },
}));
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' translate.google.com; img-src 'self' data:; frame-src translate.googleapis.com; connect-src 'self' translate.googleapis.com"); next(); });
app.use((req, res, next) => { res.locals.user = req.session.user || null; res.locals.cur = req.originalUrl; global.__cur = req.originalUrl; next(); });

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function addLang(url, lang) {
  const u = String(url).replace(/([?&])lang=(fi|de|fr|it)(&|$)/g, (m, a, b, c) => (c === '&' ? a : a === '?' ? '?' : ''));
  return u + (u.includes('?') ? '&' : '?') + 'lang=' + lang;
}
function curHasLang() { return false; }
// Build the QR payload from an app entry
function harpoonPayload(a) {
  if (a.source || a.package_name) {
    let link = 'harpoon://add?url=' + encodeURIComponent(a.repo_url);
    if (a.source) link += '&source=' + encodeURIComponent(a.source);
    if (a.package_name) link += '&package=' + encodeURIComponent(a.package_name);
    return link;
  }
  return a.repo_url; // plain repo URL – shortest code wins
}

const layout = (title, body, user) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – Harpoon Store</title>
<meta name="description" content="Community store for Sailfish OS apps: QR codes that let you add and update apps directly with Harpoon.">
<style>
:root { --bg:#101418; --card:#1a2027; --line:#2a333d; --accent:#f2953c; --text:#e5e9ee; --muted:#98a2ad; }
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,sans-serif}
a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
header{background:var(--card);border-bottom:1px solid var(--line);padding:.8rem 1.2rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center}
header .brand{font-weight:700;font-size:1.15rem;color:var(--text)}
header .spacer{flex:1}
main{max-width:1000px;margin:0 auto;padding:1.2rem}
.cats{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0}
.cat{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.3rem .9rem;color:var(--text);font-size:.92rem}
.cat.active{background:var(--accent);border-color:var(--accent);color:#000;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1rem;display:flex;flex-direction:column;gap:.4rem}
.card h3{margin:0;font-size:1.05rem}
.card p{margin:0;color:var(--muted);font-size:.9rem;overflow-wrap:anywhere}
.badge{display:inline-block;border-radius:6px;padding:.05rem .5rem;font-size:.78rem;background:var(--line)}
.badge.pending{background:#6a4e00;color:#ffd469}
.badge.approved{background:#14491e;color:#7ee38d}
.detail{display:grid;grid-template-columns:1fr auto;gap:1.5rem;align-items:start}
@media(max-width:640px){.detail{grid-template-columns:1fr}}
.qrbox{background:#fff;padding:14px;border-radius:12px;display:inline-block}
input,select,textarea,button{font:inherit;border-radius:8px;border:1px solid var(--line);background:#0c1013;color:var(--text);padding:.5rem .7rem;width:100%}
button{background:var(--accent);color:#000;font-weight:600;border:0;cursor:pointer;width:auto;padding:.55rem 1.2rem}
button:hover{filter:brightness(1.08)} button.ghost{background:var(--line);color:var(--text)}
form{max-width:520px;display:grid;gap:.8rem} label{font-size:.9rem;color:var(--muted)}
.small{font-size:.85rem;color:var(--muted)} code{background:#0c1013;padding:.1rem .4rem;border-radius:6px;word-break:break-all}
.err{color:#ff7b72;margin:0 0 .8rem}
table{border-collapse:collapse;width:100%} th,td{border:1px solid var(--line);padding:.5rem;text-align:left;font-size:.92rem}
</style></head><body>
<header>
  <a class="brand" href="/">⚓ Harpoon Store</a>
  <span class="small">💬 <a href="/forum">Community</a></span>
  <span class="small" style="font-size:.9rem">🌐 <a href="${esc(addLang(global.__cur || '/', 'de'))}">DE</a>
  <a href="${esc(addLang(global.__cur || '/', 'fr'))}">FR</a>
  <a href="${esc(addLang(global.__cur || '/', 'it'))}">IT</a>
  <a href="${esc(addLang(global.__cur || '/', 'fi'))}">FI</a>
  <a href="${esc(String(global.__cur || '/').replace(/([?&])lang=(fi|de|fr|it)(&|$)/, '$1'))}">EN</a></span>
  <span class="spacer"></span>
  ${user ? `<a href="/add">Submit app</a><a href="/mine">My apps</a>${user.role === 'admin' ? '<a href="/admin" style="background:var(--accent);color:#000;padding:.35rem .9rem;border-radius:8px;font-weight:600">🛡️ Admin</a>' : ''}<span class="small">hi, ${esc(user.username)}${user.role === 'admin' ? ' (admin)' : ''}</span><a href="/logout">Log out</a>`
       : `<a href="/login">Log in</a> <a class="ghost" style="width:auto;display:inline-block;padding:.35rem .9rem;border-radius:8px;background:var(--line);color:var(--text)" href="/register">Register</a>`}
</header>
<main>${body}</main>
<footer style="max-width:1000px;margin:2rem auto 1.5rem;padding:0 1.2rem;color:var(--muted);font-size:.8rem">
Disclaimer: This is a community index, provided as-is. The operator does not host, build, review or endorse any app listed here; apps are published by their respective developers on third-party platforms (GitHub, Codeberg, etc.). Use at your own risk – no warranty of any kind, no liability for damage, data loss or content of linked third-party software.<br>
Sailfish OS & Jolla: <a href="https://jolla.com/">jolla.com</a> · Tips & help: <a href="https://forum.sailfishos.org/">forum.sailfishos.org</a> · Source code: <a href="https://github.com/manisak/harpoon-store-source">github.com/manisak/harpoon-store-source</a>
</footer>
</body></html>`;

app.get('/mine', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const mine = await dbAll(`SELECT a.*, c.name AS cat, c.slug AS cat_slug FROM apps a JOIN categories c ON c.id=a.category_id WHERE a.user_id=? ORDER BY a.id DESC`, res.locals.user.id);
    res.send(layout('My apps', `
<h2>My apps (${mine.length})</h2>
<p class="small">Your overview – click a name to edit, change the icon or publish/remove.</p>
${mine.length ? `<div class="grid">${mine.map(a => `
<div class="card"><div style="display:flex;gap:.6rem;align-items:center">${iconTile(a, 36)}<h3 style="margin:0"><a href="/app/${a.id}">${esc(a.name)}</a></h3></div>
<div><span class="badge ${a.status}">${a.status}</span> <span class="badge">${esc(a.cat)}</span></div>
<div style="display:flex;gap:.5rem;flex-wrap:wrap">
<a href="/app/${a.id}/edit" style="background:var(--accent);color:#000;padding:.35rem .8rem;border-radius:8px;font-weight:600">✎ Edit</a>
<a class="badge" href="/?cat=${a.cat_slug}">in store view</a>
</div></div>`).join('')}</div>`
: `<p>No apps yet. <a href="/add">Publish your first one!</a></p>`}`, res.locals.user));
  } catch (e) { next(e); }
});

app.get('/check-status', (req, res) => {
  const msg = req.query.u ? '' : `<form action="/check-status" method="get" style="display:grid;gap:.6rem">
  <label>Username<input name="u" required maxlength="32" autocomplete="off"></label>
  <button style="width:fit-content">Check status</button>
</form>`;
  res.send(layout('Check status', `
<h2>Check your registration status</h2>
${msg}`, res.locals.user));
});
app.get('/check-status/result', async (req, res, next) => {
  try {
    const username = String(req.query.u || '').trim();
    const u = username ? await dbGet('SELECT username, active, created_at FROM users WHERE username=?', username) : null;
    let body;
    if (!u) body = `<p class="err">No pending registration found for this username.</p><p class="small">Check the spelling, or register first: <a href="/register">/register</a></p>`;
    else if (u.active) body = `<p>✅ <b>${esc(u.username)}</b> is activated – you can log in now: <a href="/login">/login</a></p>`;
    else body = `<p>⏳ <b>${esc(u.username)}</b> is still waiting for admin approval (registered ${esc((u.created_at || '').slice(0, 10))}). Check again later.</p>`;
    res.send(layout('Check status', `${body}<p class="small"><a href="/check-status">Check another username</a></p>`, res.locals.user));
  } catch (e) { next(e); }
});

// ---------- translation (server-side via LibreTranslate) ----------
const LIBRE = process.env.LIBRE_URL || 'https://translate.manisak.com';
const LANGS = ['de', 'fr', 'it', 'fi'];
const CACHE_FILE = path.join(DATA_DIR, 'lang-cache.json');
let langCache = {};
try { langCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch {}
function cacheSave() { fs.writeFileSync(CACHE_FILE, JSON.stringify(langCache)); }
function libreTranslate(texts, lang) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ q: texts, source: 'en', target: lang, format: 'text' });
    const req = httpc.request(LIBRE + '/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 120000,
    }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(payload); req.end();
  });
}
const TRANSLATE_SKIP = new Set(['script', 'style', 'select', 'option', 'textarea']);
async function translateHtml(html, lang) {
  if (!LANGS.includes(lang)) return html;
  const tagRe = new RegExp(`(<(${[...TRANSLATE_SKIP].join('|')})[\\s\\S]*?<\\/\\2>)|(>([^<]{1,2000})<)`, 'g');
  const nodes = [];
  html.replace(tagRe, (m, skipped, _t2, _m3, text) => {
    if (skipped) return m;
    const t = text && text.trim();
    if (t && /[A-Za-z]/.test(t) && !/^&/.test(t)) nodes.push(t);
    return m;
  });
  const pending = [];
  for (const t of nodes) if (!langCache[lang + ':' + t]) pending.push(t);
  if (pending.length) {
    const out = await libreTranslate(pending, lang);
    const arr = out.translatedText || [];
    pending.forEach((src, i) => { langCache[lang + ':' + src] = (arr[i] !== undefined ? arr[i] : src); });
    cacheSave();
  }
  return html.replace(tagRe, (m, skipped) => {
    if (skipped) return m;
    return m.replace(/>([^<]{1,2000})</, (m2, inner) => {
      const t = inner.trim();
      if (!(t && /[A-Za-z]/.test(t)) || /^&/.test(t)) return m2;
      const hit = langCache[lang + ':' + t];
      return hit ? '>' + esc(hit) + '<' : m2;
    });
  }).replace(/<html/, '<html lang="' + lang + '"');
}
// wrap res.send for GET HTML pages
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const qs = require('querystring');
  const q = qs.parse(req.url.split('?')[1]);
  const lang = (q.lang || (req.headers.cookie || '').match(/sitelang=(fi|de|fr|it)/)?.[1] || '').slice(0, 2);
  if (!LANGS.includes(lang)) return next();
  const orig = res.send.bind(res);
  res.send = function (body) {
    if (typeof body === 'string' && body.startsWith('<!doctype html')) {
      translateHtml(body, lang)
        .then(t => orig(t))
        .catch(() => orig(body));
      return this;
    }
    return orig(body);
  };
  next();
});

function dbAll(sql, ...p) { return new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r))); }
function dbGet(sql, ...p) { return new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r))); }
function dbRun(sql, ...p) { return new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this.lastID); })); }
// star metrics renderer
function rmetrics(rstats) {
  if (!rstats || !rstats.n) return 'No ratings yet';
  const full = Math.round(rstats.avg);
  return '★'.repeat(full) + '☆'.repeat(5 - full) + ' ' + rstats.avg.toFixed(1) + ' / 5 · ' + rstats.n + ' rating(s)';
}
function normRepo(u) {
  try { const x = new URL(u); x.hash = ''; return (x.host + x.pathname + x.search).toLowerCase(); } catch { return String(u).toLowerCase(); }
}
async function findDup(urlObj, req) {
  const norm = normRepo(urlObj.href).replace(/\//g, '').replace(/\?/g, '|');
  const pkg = String(req.body.package_name || '').toUpperCase();
  return await dbGet("SELECT id, name, status FROM apps WHERE (REPLACE(REPLACE(REPLACE(REPLACE(LOWER(repo_url), 'https://', ''), 'http://', ''), '/', ''), '?', '|') = ? OR (? != '' AND package_name != '' AND UPPER(package_name) = UPPER(?))) AND id != ? LIMIT 1",
    norm, pkg, pkg, Number(req.body.exclude_id) || 0);
}

// ---------- routes ----------

app.get('/', async (req, res, next) => {
  try {
    const catSlug = req.query.cat || '';
    const q = (req.query.q || '').trim();
    const pendingReq = res.locals.user?.role === 'admin'
      ? await dbGet("SELECT (SELECT COUNT(*) FROM users WHERE active=0) AS u, (SELECT COUNT(*) FROM apps WHERE status='pending') AS a")
      : null;
    const adminBanner = pendingReq && (pendingReq.u || pendingReq.a)
      ? `<p style="background:#6a4e00;color:#ffd469;border-radius:10px;padding:.6rem 1rem"><b>${pendingReq.u} registration(s)</b> and <b>${pendingReq.a} app submission(s)</b> awaiting review – <a style="color:#ffd469;text-decoration:underline" href="/admin">go to Admin</a></p>`
      : '';
    const cats = await dbAll('SELECT * FROM categories ORDER BY name');
    let where = ["a.status='approved'"], params = [];
    if (catSlug) { const c = cats.find(c => c.slug === catSlug); if (c) { where.push('a.category_id=?'); params.push(c.id); } }
    if (q) { where.push('(a.name LIKE ? OR a.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const apps = await dbAll(
      `SELECT a.*, c.name AS cat FROM apps a JOIN categories c ON c.id=a.category_id
       WHERE ${where.join(' AND ')} ORDER BY a.name COLLATE NOCASE`, ...params);
    let newestBlock = '';
    if (!q && !catSlug) {
      const newest = await dbAll(
        `SELECT a.id, a.name, a.repo_url, a.icon_file, c.slug AS cat_slug, c.name AS cat, a.created_at
         FROM apps a JOIN categories c ON c.id=a.category_id WHERE a.status='approved' ORDER BY a.id DESC LIMIT 12`);
      if (newest.length) {
        newestBlock = `
<h2 style="margin:.4rem 0 .6rem">🆕 Newest 12 apps</h2>
<div class="grid" style="margin-bottom:1.4rem">${newest.map(a => `
<div class="card"><div style="display:flex;gap:.6rem;align-items:center"><a href="/app/${a.id}">${iconTile(a, 36)}</a><h3 style="margin:0"><a href="/app/${a.id}">${esc(a.name)}</a></h3></div>
<div><a class="badge" href="/?cat=${a.cat_slug}">${esc(a.cat)}</a></div>
<p class="small">added ${esc((a.created_at || '').slice(0, 10))}</p></div>`).join('')}</div>
<h2 style="margin:.2rem 0 .6rem">All apps</h2>`;
      }
    }
    const catList = cats.map(c => `<a class="cat${c.slug === catSlug ? ' active' : ''}" href="/?cat=${c.slug}">${esc(c.name)}</a>`).join('');
    const cards = apps.length ? apps.map(a => `
<div class="card"><div style="display:flex;gap:.6rem;align-items:center"><a href="/app/${a.id}">${iconTile(a)}</a><h3 style="margin:0"><a href="/app/${a.id}">${esc(a.name)}</a></h3></div>
<div><span class="badge">${esc(a.cat)}</span></div>
<p>${esc(a.description.split('\n')[0].slice(0, 160))}</p>
<p class="small">${esc(new URL(a.repo_url).host)}</p></div>`).join('')
      : `<p class="small">No apps here yet. ${q || catSlug ? '' : '<a href="/add">Submit the first one!</a>'}</p>`;
    res.send(layout(catSlug ? cats.find(c => c.slug === catSlug)?.name || 'Apps' : 'Apps', `
${adminBanner}
<p style="margin:.3rem 0 .9rem;color:var(--muted)"><b style="color:var(--text)">Sailfish OS apps, straight from the developers.</b><br>
Browse community apps and scan the QR code on an app's page with <a href="https://github.com/JuhaniLehtimaeki/Harpoon">Harpoon</a> to add and install it. Updates keep coming straight from the app's own releases.</p>
<div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.9rem 1.1rem;margin:0 0 1rem">
<b>ℹ️ Legal notice – what this site is (and is not)</b>
<p style="margin:.4rem 0 0;color:var(--muted);font-size:.95">This website is a <b>directory</b>: it lists applications and links to the repositories where their developers publish them. <b>This site is not the source of the apps themselves</b> — all software remains exclusively distributed by its respective developers on third-party platforms (GitHub, Codeberg, GitLab, etc.). The operator of this site neither hosts, builds, reviews, endorses nor warrants any listed application and assumes no liability for its content, downloads or use.</p>
<b style="display:block;margin-top:.7rem">How to get Sailfish OS apps safely</b>
<ul style="margin:.5rem 0 0;padding-left:1.2rem;color:var(--muted);font-size:.95">
<li>Apps listed here require <a href="https://github.com/JuhaniLehtimaeki/Harpoon">Harpoon</a> by <b>Juhani Lehtimaeki</b> – install Harpoon first, then scan an app's QR code.</li>
<li>The safest source for apps remains the <b>official Jolla Store</b> (built into Sailfish OS, reviewed by Jolla).</li><li>Other established stores: <a href="https://openrepos.net/">OpenRepos</a> and <a href="https://sailfishos-chum.github.io/">SailfishOS:Chum</a>.</li>
<li>This store is <a href="https://github.com/manisak/harpoon-store-source">open source</a> — the source code of the website itself lives on GitHub.</li>
<li>New to Sailfish OS? <a href="https://jolla.com/">jolla.com</a> explains what Sailfish OS and Jolla are; for tips and help visit the <a href="https://forum.sailfishos.org/">Sailfish OS Forum</a>.</li>
</ul>
</div>
<div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.9rem 1.1rem;margin:0 0 1rem">
<b>🏪 Other app stores for Sailfish OS</b>
<ul style="margin:.5rem 0 0;padding-left:1.2rem;color:var(--muted);font-size:.95">
<li><a href="https://harbour.jolla.com/">Jolla Store</a> – built into Sailfish OS, reviewed by Jolla; the safest choice.</li>
<li><a href="https://openrepos.net/">OpenRepos</a> – community repository of developer-uploaded RPM packages, long-established.</li>
<li><a href="https://sailfishos-chum.github.io/">SailfishOS:Chum</a> – community store with web storefront and the Chum GUI client.</li>
</ul>
</div>
<form action="/" method="get" style="display:flex;gap:.5rem;max-width:none;margin:.5rem 0">
  <input type="search" name="q" placeholder="Search apps…" value="${esc(q)}" style="flex:1">
  <input type="hidden" name="cat" value="${esc(catSlug)}"><button>Search</button>
</form>
<div class="cats">${catList}</div>
<div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.9rem 1.1rem;margin:0 0 1rem">
<b>🏪 Store clients – download</b>
<p class="small" style="margin:.4rem 0 .6rem">Client apps to install other stores on your phone:</p>
<div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center">
<a href="https://github.com/JuhaniLehtimaeki/Harpoon/releases/latest" class="badge" style="font-size:.9rem;padding:.45rem .9rem">⚓ Download Harpoon (RPM)</a>
<a href="https://github.com/sailfishos-chum/sailfishos-chum-gui/releases" class="badge" style="font-size:.9rem;padding:.45rem .9rem">📦 Download Chum GUI (RPM)</a>
<a href="https://openrepos.net/" class="badge" style="font-size:.9rem;padding:.45rem .9rem">🌐 OpenRepos (browser)</a>
</div>
<p class="small" style="margin-top:.5rem">After installation, these clients find, install and update apps directly on the phone. The Jolla Store is already built into Sailfish OS.</p>
</div>
${newestBlock}
<div class="grid">${cards}</div>`, res.locals.user));
  } catch (e) { next(e); }
});

app.get('/app/:id/icon', async (req, res) => {
  const a = await dbGet('SELECT icon_file FROM apps WHERE id=?', req.params.id);
  if (!a || !a.icon_file) return res.sendStatus(404);
  if (/^https?:/.test(a.icon_file)) return res.redirect(a.icon_file);
  const p = path.join(ICON_DIR, path.basename(a.icon_file));
  if (!fs.existsSync(p)) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=3600');
  const mt = path.extname(p) === '.jpg' || path.extname(p) === '.jpeg' ? 'image/jpeg' : path.extname(p) === '.webp' ? 'image/webp' : 'image/png';
  res.type(mt).send(fs.readFileSync(p));
});

app.post('/app/:id/icon', upload.single('icon_file'), async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const a = await dbGet('SELECT * FROM apps WHERE id=?', req.params.id);
    if (!a) return res.status(404).send(layout('Not found', '<p>App not found.</p>', res.locals.user));
    if (a.user_id !== res.locals.user.id && res.locals.user.role !== 'admin')
      return res.status(403).send(layout('Forbidden', '<p>Only the maintainer or an admin can change the icon.</p>', res.locals.user));
    const value = await saveIcon(req);
    if (value === 'INVALID') return res.redirect('/app/' + a.id);
    await setIcon(a.id, value);
    if (a.icon_file && /^app-/.test(String(a.icon_file))) { try { fs.unlinkSync(path.join(ICON_DIR, path.basename(a.icon_file))); } catch {} }
    res.redirect('/app/' + a.id);
  } catch (e) { next(e); }
});

app.get('/app/:id', async (req, res, next) => {
  try {
    const a = await dbGet(`SELECT a.*, c.slug AS cat_slug, c.name AS cat, u.username AS owner
      FROM apps a JOIN categories c ON c.id=a.category_id JOIN users u ON u.id=a.user_id WHERE a.id=?`, req.params.id);
    if (!a || (a.status !== 'approved' && res.locals.user?.role !== 'admin' && res.locals.user?.id !== a.user_id))
      return res.status(404).send(layout('Not found', '<p>App not found.</p>', res.locals.user));
    const payload = harpoonPayload(a);
    const shots = await dbAll('SELECT id FROM screenshots WHERE app_id=? ORDER BY id', a.id);
    const rstats = await dbGet('SELECT AVG(stars) AS avg, COUNT(*) AS n FROM ratings WHERE app_id=?', a.id);
    const myRating = res.locals.user ? await dbGet('SELECT stars FROM ratings WHERE app_id=? AND user_id=?', a.id, res.locals.user.id) : null;
    const ratingRow = rmetrics(rstats);
    const contribs = await dbAll('SELECT login FROM contributors WHERE app_id=? ORDER BY id LIMIT 12', a.id);
    const contribNote = contribs.length ? '<p class="small">With contributions from: ' + contribs.map(c => '<a href="https://github.com/' + esc(c.login) + '">' + esc(c.login) + '</a>').join(', ') + '</p>' : '';
    const isManager = !!(res.locals.user && (res.locals.user.id === a.user_id || res.locals.user.role === 'admin'));
    const contribRefresh = isManager && a.repo_url.toLowerCase().includes('github.com') ? '<form action="/app/' + a.id + '/contributors" method="post" style="margin:.3rem 0"><button class="ghost" style="font-size:.8rem;padding:.2rem .6rem">↻ Fetch contributors</button></form>' : '';
    const pkgs = await dbAll('SELECT * FROM app_packages WHERE app_id=? ORDER BY id', a.id);
    const pkgBlock = pkgs.length ? '<h3 style="margin-top:1rem">Install options — choose what to install</h3><div class="card">' + pkgs.map(p => '<div style="display:flex;gap:.5rem;align-items:center;margin:.3rem 0"><span>☑</span><a href="' + esc(p.url) + '">' + esc(p.label) + '</a>' + (isManager ? '<form style="display:inline" action="/app/pkg/' + p.id + '/remove" method="post"><button class="ghost" style="font-size:.7rem;padding:.05rem .4rem">✕</button></form>' : '') + '</div>').join('') + '<p class="small">Download and install the chosen packages (e.g. via Settings → Transfers). Several checkboxes can be combined.</p></div>' : '';
    const pkgForm = isManager ? '<form action="/app/' + a.id + '/pkg" method="post" style="display:flex;gap:.4rem;max-width:none;margin:.4rem 0"><input name="label" placeholder="Label (e.g. RAWfish CLI aarch64)" maxlength="60" style="flex:1"><input name="url" type="url" placeholder="Download URL (.rpm)" style="flex:1"><button>Add</button></form>' : '';
    const comments = await dbAll('SELECT ac.*, u.username FROM app_comments ac JOIN users u ON u.id=ac.user_id WHERE ac.app_id=? ORDER BY ac.id DESC', a.id);
    const isAdminU = !!(res.locals.user && res.locals.user.role === 'admin');
    const commentCards = comments.map(function (c2) { var canDel = isAdminU || (res.locals.user && res.locals.user.id === c2.user_id); return '<div class="card"><p style="white-space:pre-wrap">' + esc(c2.body) + '</p><p class="small">— ' + esc(c2.username) + ', ' + esc((c2.created_at || '').slice(0, 10)) + (canDel ? ' <form style="display:inline;margin-left:.5rem" action="/app/comment/' + c2.id + '/delete" method="post" onsubmit="return confirm(\'Delete this comment?\')"><button class="ghost" style="font-size:.75rem;padding:.1rem .45rem">✕</button></form>' : '') + '</p></div>'; }).join('');
    const commentsBlock = '<h3 style="margin-top:1.2rem">Comments (' + comments.length + ')</h3>' + (comments.length ? commentCards : '<p class="small">No comments yet.</p>') + (res.locals.user ? '<h3>Add a comment</h3><form action="/app/' + a.id + '/comment" method="post"><textarea name="body" rows="3" required maxlength="2000" style="width:100%"></textarea><br><button style="margin-top:.4rem">Post comment</button></form>' : '<p class="small"><a href="/login">Log in</a> to comment.</p>');
    const canManage = res.locals.user && (res.locals.user.id === a.user_id || res.locals.user.role === 'admin');
    const shotsBlock = shots.length ? `
<h3>Screenshots</h3>
<div style="display:flex;gap:.7rem;flex-wrap:wrap">${shots.map(s => `<div style="text-align:center"><a href="/app/${a.id}/shot/${s.id}"><img alt="screenshot" src="/app/${a.id}/shot/${s.id}" style="height:180px;border-radius:10px;border:1px solid var(--line)"></a>
${canManage ? `<form action="/app/${a.id}/shot/${s.id}/delete" method="post" onsubmit="return confirm('Delete this screenshot?')" style="margin-top:.3rem"><button class="ghost" style="font-size:.8rem;padding:.15rem .5rem">✕</button></form>` : ''}
</div>`).join('')}</div>` : '';
    res.send(layout(a.name, `
<p><a href="/?cat=${a.cat_slug}">← ${esc(a.cat)}</a></p>
<div class="detail">
  <div>
    <h2 style="margin-top:0"><span style="vertical-align:middle;margin-right:.4rem">${iconTile(a, 56)}</span>${esc(a.name)}</h2>
    <span class="badge">${esc(a.cat)}</span> ${a.status !== 'approved' ? `<span class="badge pending">${a.status}</span>` : ''}
    <p style="white-space:pre-wrap">${esc(a.description)}</p>
        ${(a.current_version) ? '<p style="margin:.4rem 0;font-size:1rem"><b>Current version:</b> ' + esc(a.current_version) + ' <span class="small">(checked ' + esc((a.version_checked_at || '').slice(0, 10)) + ')</span></p>' : ''}
    <p style="margin-top:.6rem;font-size:1.05rem"><b>Rating:</b> ${ratingRow}</p>
    <p class="small" style="margin-top:.3rem">Your rating — click a star button:</p>
    ${(res.locals.user) ? '<form action="/app/${a.id}/rate" method="post" style="display:flex;gap:.4rem;max-width:none;margin:.2rem 0">' + [1, 2, 3, 4, 5].map(function (i) { return '<button name="stars" value="' + i + '" class="ghost" style="padding:.2rem .6rem;' + ((myRating && myRating.stars === i) ? 'background:var(--accent);color:#000' : '') + '">★ ' + i + '</button>'; }).join("") + '</form>' : '<p class="small"><a href="/login">Log in</a> to rate this app.</p>'}
    <p class="small">Requireshref="https://github.com/JuhaniLehtimaeki/Harpoon">Harpoon</a> by <b>Juhani Lehtimaeki</b>. Source: <a href="${esc(a.repo_url)}">${esc(a.repo_url)}</a><br>
    This page is maintained by · You can download the app directly through the source link above, or simply scan the QR code on this page with Harpoon and install it ${esc(a.owner)} · The app itself is often also downloadable on OpenRepos and/or SailfishOS:Chum, or straight from the source link below · The safest way to get apps is the official <b>Jolla Store</b>; other stores: <a href="https://openrepos.net/">OpenRepos</a>, <a href="https://sailfishos-chum.github.io/">SailfishOS:Chum</a>. Apps are published by third-party developers – the store operator neither hosts nor reviews them. Install at your own risk.</p>
  </div>
  <div>
    <div class="qrbox"><img alt="QR code" src="/app/${a.id}/qr"></div>
    <p class="small">Scan with Harpoon (Scan QR code) to add this app.</p>
    ${(res.locals.user && (res.locals.user.id === a.user_id || res.locals.user.role === 'admin'))
      ? `<a href="/app/${a.id}/edit" style="display:inline-block;background:var(--accent);color:#000;padding:.45rem 1rem;border-radius:8px;font-weight:600">✎ Edit app</a>
    <form action="/app/${a.id}/delete" method="post" onsubmit="return confirm('Remove this app completely?')" style="margin-top:.5rem"><button class="ghost">Remove app</button></form>
    <form action="/app/${a.id}/icon" method="post" enctype="multipart/form-data" style="margin-top:.6rem">
      <label class="small">Change icon (PNG/JPG/WebP ≤ 256 KB, or URL)</label>
      <input type="file" name="icon_file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" style="font-size:.85rem">
      <input name="icon_url" type="url" placeholder="or icon URL" style="font-size:.85rem;margin-top:.4rem">
      <button style="margin-top:.4rem">Save icon</button>
    </form>
    <h3 style="margin-top:1rem">Screenshots</h3>
    <form action="/app/${a.id}/shots" method="post" enctype="multipart/form-data" style="display:grid;gap:.4rem">
      <p class="small">Up to <b>6 images per upload</b>, <b>8 per app in total</b>. PNG/JPG/WebP only, max <b>2 MB each</b>.</p>
      <input type="file" name="screenshots" accept=".png,.jpg,.jpeg,.webp,image/*" multiple style="font-size:.85rem">
      <button class="ghost" style="width:fit-content;padding:.35rem .8rem">Upload screenshots</button>
    </form>` : ''}
  </div>
</div>
${shotsBlock}<p class="small" style="margin-top:1rem">${contribNote}${contribRefresh}</p>${pkgBlock}${pkgForm}${commentsBlock}`, res.locals.user));
  } catch (e) { next(e); }
});

app.get('/app/:id/qr', async (req, res) => {
  const a = await dbGet('SELECT * FROM apps WHERE id=?', req.params.id);
  if (!a) return res.sendStatus(404);
  res.type('image/png');
  QRCode.toBuffer(harpoonPayload(a), { width: 420, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
    .then(b => res.send(b)).catch(() => res.sendStatus(500));
});

app.get('/register', (req, res) => {
  res.send(layout('Register', `
<h2>Register</h2>
<form action="/register" method="post">
  <label>Username<input name="username" required pattern="[A-Za-z0-9_-]{3,32}" autocomplete="username"></label>
  <label>Password (min. 8 chars)<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
  <label>Account type<select name="accounttype" style="width:100%"><option value="user">User – browse, rate and comment</option><option value="developer">App developer – publish apps</option></select></label>
  <label>Message to the admin <span class="small">(required – who are you, which apps do you want to submit…)</span><textarea name="note" rows="3" maxlength="500" required></textarea></label>
  ${errorHtml(req)}<button>Create account</button>
</form>`, res.locals.user));
});

app.post('/register', authLimit, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const accounttype = (req.body.accounttype === 'developer') ? 'developer' : 'user';
    const note = String(req.body.note || '').trim();
    const err = !/^[A-Za-z0-9._-]{3,32}$/.test(username || '') ? 'Username must be 3–32 letters, digits, dots, _ or -.'
      : (password || '').length < 8 ? 'Password too short.'
      : note.length < 10 ? 'Message to the admin is required (at least 10 characters) – tell us who you are and what you want to publish.' : null;
    if (err) return res.send(layout('Register', `
<h2>Register</h2>
<p class="err">${esc(err)}</p>
<form action="/register" method="post">
  <label>Username<input name="username" required pattern="[A-Za-z0-9._-]{3,32}" autocomplete="username" value="${esc(username || '')}"></label>
  <label>Password (min. 8 chars)<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
  <label>Account type<select name="accounttype" style="width:100%"><option value="user" ${accounttype === 'user' ? 'selected' : ''}>User – browse, rate and comment</option><option value="developer" ${accounttype === 'developer' ? 'selected' : ''}>App developer – publish apps</option></select></label>
  <label>Message to the admin <span class="small">(required – who are you, which apps do you want to submit…)</span><textarea name="note" rows="3" maxlength="500" required>${esc(note)}</textarea></label>
  <button>Create account</button>
</form>`, res.locals.user));
    const exists = await dbGet('SELECT id FROM users WHERE username=?', username);
    if (exists) return res.redirect('/register');
    // First user becomes admin
    const one = await dbGet('SELECT id FROM users LIMIT 1');
    const isActiveOne = one ? 0 : 1; // 1 only for the very first user (becomes admin)
    const salt = crypto.randomBytes(16).toString('hex');
    const id = await dbRun('INSERT INTO users (username, passhash, salt, role, active, note) VALUES (?,?,?,?,?,?)',
      username, hash(password, salt), salt, one ? accounttype : 'admin', isActiveOne,
      String((req.body.note || '').trim()).slice(0, 500));
    if (isActiveOne) {
      req.session.user = { id, username, role: 'admin' };
      return res.redirect('/');
    }
    res.send(layout('Registered', '\n<h2>Account created</h2>\n<p>Your request has been sent to the admin for approval. You will be able to\nlog in as soon as the admin activates your account.</p>\n<p class="small">You can check the current status any time: <a href="/check-status">check registration status</a> · <a href="/login">Back to login</a></p>', null));
  } catch (e) { next(e); }
});

app.get('/login', (req, res) => {
  const notice = req.query.pending === '1'
    ? '<p class="err">Your account is still waiting for admin approval.</p>'
    : req.query.invalid === '1' ? '<p class="err">Wrong username or password.</p>' : '';
  res.send(layout('Log in', `
<h2>Log in</h2>
<form action="/login" method="post">
  <label>Username<input name="username" required autocomplete="username"></label>
  <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
  ${notice}${errorHtml(req)}<button>Log in</button>
</form><p class="small">Forgot your password? <a href="/forgot">Reset password</a> · No account? <a href="/register">Register</a> · <a href="/check-status">Check registration status</a></p>`, res.locals.user));
});

app.post('/login', authLimit, async (req, res, next) => {
  try {
    const u = await dbGet('SELECT * FROM users WHERE username=?', req.body.username || '');
    const ok = u && crypto.timingSafeEqual(Buffer.from(hash(req.body.password || '', u.salt), 'hex'), Buffer.from(u.passhash, 'hex'));
    if (!ok) return res.redirect('/login?invalid=1');
    if (ok && !u.active) return res.redirect('/login?pending=1');
    req.session.user = { id: u.id, username: u.username, role: u.role };
    res.redirect('/');
  } catch (e) { next(e); }
});

app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

const authTries = new Map(); // ip -> {n, ts}
// simple rate limit for /login and /register: max 8 attempts per 10 min per IP
function authLimit(req, res, next) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const e = authTries.get(ip) || { n: 0, ts: now };
  if (now - e.ts > 10 * 60 * 1000) { e.n = 0; e.ts = now; }
  e.n += 1; authTries.set(ip, e);
  if (e.n > 8) return res.status(429).send(layout('Too many attempts', '<p>Too many login/registration attempts. Try again later.</p>', res.locals.user));
  Object.defineProperty(req, 'authLimitOk', { value: true });
  next();
}
// password reset
function oneTimeToken() { return crypto.randomBytes(24).toString('hex'); }

app.get('/forgot', (req, res) => {
  res.send(layout('Forgot password', `
<h2>Forgot password</h2>
<p class="small">Enter your username. The admin decides on your request; once approved, you receive a one-time code to set a new password <a href="/reset">here</a>.</p>
<form action="/forgot" method="post">
  <label>Username<input name="username" required autocomplete="username"></label>
  <button>Request reset</button>
</form>`, res.locals.user));
});

app.post('/forgot', authLimit, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const u = await dbGet('SELECT id FROM users WHERE username=?', username);
    if (u) await dbRun(`INSERT INTO reset_requests (username, token) VALUES (?,?)`, username, oneTimeToken());
    res.send(layout('Request received', `
<h2>Request received</h2>
<p>Your reset request has been sent to the admin. Once approved, the admin gives you a one-time code – enter it at <a href="/reset">/reset</a> together with your username.</p>
<p class="small"><a href="/login">Back to login</a></p>`, res.locals.user));
  } catch (e) { next(e); }
});

app.get('/reset', (req, res) => {
  res.send(layout('Reset password', `
<h2>Set a new password</h2>
${errorHtml(req)}
<form action="/reset" method="post">
  <label>Username<input name="username" required autocomplete="username"></label>
  <label>One-time code from the admin<input name="token" required autocomplete="off"></label>
  <label>New password (min. 8)<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
  <button>Save password</button>
</form>`, res.locals.user));
});

app.post('/reset', authLimit, async (req, res, next) => {
  try {
    const { username, token, password } = req.body;
    const rr = await dbGet("SELECT * FROM reset_requests WHERE username=? AND token=? AND status='approved'", String(username || '').trim(), String(token || '').trim());
    if (!rr) return res.redirect('/reset');
    if (String(password || '').length < 8) return res.redirect('/reset');
    const u = await dbGet('SELECT * FROM users WHERE username=?', rr.username);
    if (!u) { await dbRun("UPDATE reset_requests SET status='used' WHERE id=?", rr.id); return res.redirect('/login'); }
    const salt = crypto.randomBytes(16).toString('hex');
    await dbRun('UPDATE users SET passhash=?, salt=?, active=1 WHERE id=?', hash(password, salt), salt, u.id);
    await dbRun("UPDATE reset_requests SET status='used' WHERE id=?", rr.id);
    req.session.user = { id: u.id, username: u.username, role: u.role };
    res.send(layout('Password updated', `<h2>Password updated ✅</h2><p>You are logged in.</p><p><a href="/">Back to the store</a></p>`, res.locals.user));
  } catch (e) { next(e); }
});

const SOURCES = ['', 'GitHub', 'Forgejo', 'GitLab', 'SourceHut', 'Tangled', 'SourceForge', 'Jenkins', 'HTML', 'DirectLink', 'RpmMdRepo'];

<!-- add -->
app.get('/add', (req, res) => {
  if (!res.locals.user) return res.redirect('/login');
  dbAll('SELECT * FROM categories ORDER BY name').then(cats =>
    res.send(layout('Submit app', `
<h2>Submit an app</h2>
<form action="/add" method="post" enctype="multipart/form-data">
  <label>App name<input name="name" required maxlength="100"></label>
  <label>Description<textarea name="description" rows="4" required maxlength="2000"></textarea></label>
  <label>App icon (PNG/JPG/WebP, max. 256 KB) <input type="file" name="icon_file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"></label>
  <label>Screenshots (optional, up to 6 at once, 8 per app in total, PNG/JPG/WebP ≤ 2 MB each) <input type="file" name="screenshots" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" multiple></label>
  <label>…or icon URL <span class="small">(used when no file is uploaded)</span><input name="icon_url" type="url" placeholder="https://…/icon.png"></label>
  <label>Repository URL${errorHtml(req)}<input name="repo_url" type="url" required placeholder="https://github.com/you/harbour-yourapp"></label>
  <p class="small">By submitting, you confirm you are the app's maintainer (or authorised by them) and accept that the community store only links to your releases – the operator is not responsible for your app's content.</p>
  <label>Source type <span class="small">(only needed when Harpoon can't tell from the URL, e.g. self-hosted or RpmMdRepo)</span>
    <select name="source">${SOURCES.map(s => `<option value="${s}">${s || '(auto)'}</option>`).join('')}</select></label>
  <label>RPM package name <span class="small">(required for RpmMdRepo)</span><input name="package_name" maxlength="100"></label>
  <label>Category<select name="category_id" required>${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
  <button>Publish app</button>
</form>`, res.locals.user)));
});

app.post('/add', upload.fields([{ name: 'icon_file', maxCount: 1 }, { name: 'screenshots', maxCount: 6 }]), async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    if (!['developer', 'admin'].includes(res.locals.user.role)) return res.status(403).send(layout('Developers only', '<p>Only developer accounts can publish apps. Your account type: <b>' + esc(res.locals.user.role) + '</b>. Contact the admin to upgrade your account.</p>', res.locals.user));
    const { name, description, repo_url, source, package_name, category_id } = req.body;
    const iconValue = await saveIcon(req);
    if (iconValue === 'INVALID') return res.redirect('/add');
    let url;
    try { url = new URL(repo_url); if (!/^https?:$/.test(url.protocol)) throw 0; } catch { return res.redirect('/add'); }
    const dup = await findDup(url, req);
    if (dup) return res.send(layout('Duplicate', `
<h2>Already in the store 🙁</h2>
<p>This app is already listed as <a href="/app/${dup.id}"><b>${esc(dup.name)}</b></a> (URL: <code>${esc(normRepo(url))}</code>).</p>
<p>Each app should be listed only once. If this entry is yours but wrong, you can edit it on its page; otherwise contact the admin.</p>
<p><a href="/add">Back to the submission form</a> · <a href="/">Back to the store</a></p>`, res.locals.user));
    if (!/^$|^[ -~]{1,100}$/.test(package_name || '')) return res.redirect('/add');
    const status = 'approved'; // registered users may publish without admin approval
    const id = await dbRun(
      `INSERT INTO apps (name, description, repo_url, source, package_name, category_id, user_id, status, icon_file) VALUES (?,?,?,?,?,?,?,?,?)`,
      String(name).trim(), String(description).trim(), url.href, SOURCES.includes(source) ? source : '',
      package_name || '', Number(category_id) || 0, res.locals.user.id, status, iconValue);
    req.params.id = id; // for saveShots naming
    await saveShots(id, req);
    const cats = await dbAll('SELECT * FROM categories');
    res.send(layout('Submitted', `
<h2>Submitted 🎉</h2>
<div class="detail">
<div><p>Your app <b>${esc(name)}</b> ${status === 'approved' ? 'is live. Registered users can publish without admin approval.' : 'is waiting for review.'}</p>
<p class="small">QR payload: <code>${esc(harpoonPayload({ repo_url: url.href, source, package_name }))}</code></p>
<p><a href="/app/${id}">Open the app page</a></p></div>
<div style="grid-template-columns:1fr;display:grid"></div>
</div><a href="/add">Submit another</a> · <a href="${'/?cat=' + (cats.find(c => c.id == category_id)?.slug || '')}">Browse</a>`, res.locals.user));
  } catch (e) { next(e); }
});

// screenshots
app.post('/app/:id/shots', shotUpload.array('screenshots', 6), async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const a = await dbGet('SELECT * FROM apps WHERE id=?', req.params.id);
    if (!a) return res.status(404).send(layout('Not found', '<p>App not found.</p>', res.locals.user));
    if (a.user_id !== res.locals.user.id && res.locals.user.role !== 'admin')
      return res.status(403).send(layout('Forbidden', '<p>Only the maintainer or an admin can add screenshots.</p>', res.locals.user));
    const count = (await dbGet('SELECT COUNT(*) AS c FROM screenshots WHERE app_id=?', a.id)).c;
    req.files = (req.files || []).slice(0, Math.max(0, 8 - count));
    await saveShots(a.id, req);
    res.redirect('/app/' + a.id);
  } catch (e) { next(e); }
});
app.get('/app/:id/shot/:sid', async (req, res) => {
  const s = await dbGet('SELECT file FROM screenshots WHERE id=? AND app_id=?', req.params.sid, req.params.id);
  if (!s) return res.sendStatus(404);
  const p = path.join(SHOT_DIR, path.basename(s.file));
  if (!fs.existsSync(p)) return res.sendStatus(404);
  const mt = path.extname(p) === '.jpg' || path.extname(p) === '.jpeg' ? 'image/jpeg' : path.extname(p) === '.webp' ? 'image/webp' : 'image/png';
  res.set('Cache-Control', 'public, max-age=3600');
  res.type(mt).send(fs.readFileSync(p));
});
app.post('/app/:id/shot/:sid/delete', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const a = await dbGet('SELECT * FROM apps WHERE id=?', req.params.id);
    if (!a) return res.sendStatus(404);
    if (a.user_id !== res.locals.user.id && res.locals.user.role !== 'admin') return res.sendStatus(403);
    const s = await dbGet('SELECT * FROM screenshots WHERE id=? AND app_id=?', req.params.sid, req.params.id);
    if (s) {
      try { fs.unlinkSync(path.join(SHOT_DIR, path.basename(s.file))); } catch {}
      await dbRun('DELETE FROM screenshots WHERE id=?', s.id);
    }
    res.redirect('/app/' + a.id);
  } catch (e) { next(e); }
});

app.get('/app/:id/edit', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const a = await dbGet('SELECT * FROM apps WHERE id=?', req.params.id);
    if (!a) return res.status(404).send(layout('Not found', '<p>App not found.</p>', res.locals.user));
    if (a.user_id !== res.locals.user.id && res.locals.user.role !== 'admin')
      return res.status(403).send(layout('Forbidden', '<p>Only the maintainer or an admin can edit this app.</p>', res.locals.user));
    const cats = await dbAll('SELECT * FROM categories ORDER BY name');
    res.send(layout('Edit app', `
<p><a href="/app/${a.id}">← Back to ${esc(a.name)}</a></p>
<h2>Edit app</h2>
<form action="/app/${a.id}/edit" method="post">
  <label>App name<input name="name" required maxlength="100" value="${esc(a.name)}"></label>
  <label>Description<textarea name="description" rows="4" required maxlength="2000">${esc(a.description)}</textarea></label>
  <label>Repository URL<input name="repo_url" type="url" required value="${esc(a.repo_url)}"></label>
  <label>Source type <span class="small">(only when Harpoon can't tell from the URL)</span>
    <select name="source">${SOURCES.map(s => `<option value="${s}"${s === a.source ? ' selected' : ''}>${s || '(auto)'}</option>`).join('')}</select></label>
  <label>RPM package name<input name="package_name" maxlength="100" value="${esc(a.package_name)}"></label>
  <label>Category<select name="category_id" required>${cats.map(c => `<option value="${c.id}"${c.id === a.category_id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
  <p class="small">The icon is managed separately on the app page.</p>
  <button>Save changes</button>
</form>`, res.locals.user));
  } catch (e) { next(e); }
});

app.post('/app/:id/edit', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const a = await dbGet('SELECT * FROM apps WHERE id=?', req.params.id);
    if (!a) return res.status(404).send(layout('Not found', '<p>App not found.</p>', res.locals.user));
    if (a.user_id !== res.locals.user.id && res.locals.user.role !== 'admin')
      return res.status(403).send(layout('Forbidden', '<p>Only the maintainer or an admin can edit this app.</p>', res.locals.user));
    const { name, description, repo_url, source, package_name, category_id } = req.body;
    let url;
    try { url = new URL(repo_url); if (!/^https?:$/.test(url.protocol)) throw 0; } catch { return res.redirect('/app/' + a.id + '/edit'); }
    const dup = await findDup(url, req);
    if (dup && String(dup.id) !== String(a.id)) return res.send(layout('Duplicate', `
<h2>Already in the store 🙁</h2>
<p>Another app already uses this repository: <a href="/app/${dup.id}"><b>${esc(dup.name)}</b></a>.</p>
<p>Please use a different repository URL.</p>
<p><a href="/app/${a.id}/edit">Back to editing</a></p>`, res.locals.user));
    if (!/^$|^[ -~]{1,100}$/.test(package_name || '')) return res.redirect('/app/' + a.id + '/edit');
    await dbRun(`UPDATE apps SET name=?, description=?, repo_url=?, source=?, package_name=?, category_id=?, updated_at=datetime('now') WHERE id=?`,
      String(name).trim(), String(description).trim(), url.href, SOURCES.includes(source) ? source : '',
      package_name || '', Number(category_id) || 0, a.id);
    res.redirect('/app/' + a.id);
  } catch (e) { next(e); }
});

app.post('/app/:id/delete', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const a = await dbGet('SELECT * FROM apps WHERE id=?', req.params.id);
    if (!a) return res.status(404).send(layout('Not found', '<p>App not found.</p>', res.locals.user));
    const allowed = a.user_id === res.locals.user.id || res.locals.user.role === 'admin';
    if (allowed) {
      if (a.icon_file && /^app-/.test(String(a.icon_file))) { try { fs.unlinkSync(path.join(ICON_DIR, path.basename(a.icon_file))); } catch {} }
      await dbRun('DELETE FROM apps WHERE id=?', a.id);
    } else {
      return res.status(403).send(layout('Forbidden', '<p>Only the maintainer or an admin can remove this app.</p>', res.locals.user));
    }
    res.send(layout('Removed', `<h2>Removed</h2><p><b>${esc(a.name)}</b> was removed from the store.</p><p><a href="/">Back to the store</a> · <a href="/add">Submit another app</a></p>`, res.locals.user));
  } catch (e) { next(e); }
});

// Admin
const adminNav = `<p style="display:flex;gap:.6rem;flex-wrap:wrap">` +
  [['Pending', '/admin'], ['All apps', '/admin/apps']].map(([l, href]) => `<a href="${href}" class="badge" style="font-size:1rem;padding:.4rem 1rem">${l}</a>`).join(' ') + `</p>`;
app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const pendingApps = await dbAll(`SELECT a.*, c.name AS cat, u.username AS owner FROM apps a
      JOIN categories c ON c.id=a.category_id JOIN users u ON u.id=a.user_id WHERE a.status!='approved' ORDER BY a.id DESC`);
    const users = await dbAll('SELECT * FROM users ORDER BY id');
    const rrs = await dbAll("SELECT * FROM reset_requests WHERE status!='used' ORDER BY id DESC");
    res.send(layout('Admin', `
${adminNav}
<h2>Admin – pending apps</h2>
${pendingApps.length ? `<table><tr><th>App</th><th>Category</th><th>By</th><th>Status</th><th></th></tr>
${pendingApps.map(a => `
<tr><td><a href="/app/${a.id}">${esc(a.name)}</a></td><td>${esc(a.cat)}</td><td>${esc(a.owner)}</td>
<td><span class="badge ${a.status}">${a.status}</span></td>
<td style="white-space:nowrap">${a.status !== 'approved' ? `<form style="display:inline" action="/admin/approve/${a.id}" method="post"><button>Approve</button></form>` : ''}
<form style="display:inline" action="/admin/delete-app/${a.id}" method="post" onsubmit="return confirm('Delete app ${esc(a.name)} permanently?')"><button class="ghost">Delete</button></form></td></tr>`).join('')}
</table>` : '<p class="small">Nothing pending – registered users publish directly.</p>'}
<h2>Password reset requests</h2>
${rrs.length ? `<table><tr><th>Username</th><th>Requested</th><th>Status</th><th>Code</th><th></th></tr>
${rrs.map(x => `<tr><td>${esc(x.username)}</td><td>${esc(x.created_at)}</td><td><span class="badge approved">${x.status}</span></td><td style="max-width:260px">${x.status === 'approved' ? `<code>${esc(x.token)}</code>` : ''}</td>
<td style="white-space:nowrap">${x.status === 'pending' ? `<form style="display:inline" action="/admin/reset-approve/${x.id}" method="post" onsubmit="return confirm('Approve password reset for ${esc(x.username)}? Then hand the code to the user.')"><button>Approve</button></form>` : ''}</td></tr>`).join('')}
</table>` : '<p class="small">No open reset requests.</p>'}
<p class="small">Approve a request, then send the user the displayed one-time code (valid until used) – they enter it on /reset with their username to set a new password.</p>
<h2>Registrations</h2>
<table><tr><th>User</th><th>Message</th><th>Role</th><th>Status</th><th></th></tr>
${users.map(u => `<tr><td>${esc(u.username)}</td>
<td style="max-width:280px">${esc(u.note || '')}</td>
<td>${esc(u.role)}</td>
<td>${u.active ? '<span class="badge approved">active</span>' : '<span class="badge pending">inactive</span>'}</td>
<td>${u.active ? '' : `<form style="display:inline" action="/admin/activate/${u.id}" method="post"><button>Activate</button></form>`}
<form style="display:inline" action="/admin/deactivate/${u.id}" method="post"><button class="ghost">Deactivate</button></form>
${u.role !== 'admin' ? `<form style="display:inline" action="/admin/role/${u.id}${u.role === 'developer' ? '' : '/developer'}" method="post"><button class="ghost">Set ${u.role === 'developer' ? 'user' : 'developer'}</button></form>
<form style="display:inline" action="/admin/delete-user/${u.id}" method="post" onsubmit="return confirm('Delete user ${esc(u.username)} and all their apps?')"><button class="ghost">Delete</button></form>` : ''}</td></tr>`).join('')}
</table>`, res.locals.user));
  } catch (e) { next(e); }
});

app.get('/admin/apps', requireAdmin, async (req, res, next) => {
  try {
    const sort = req.query.sort === 'user' ? 'ORDER BY a.user_id, a.name COLLATE NOCASE' : 'ORDER BY a.id DESC';
    const sortLabel = req.query.sort === 'user' ? 'owner' : 'newest';
    const apps = await dbAll(`SELECT a.*, c.name AS cat, u.username AS owner FROM apps a
      JOIN categories c ON c.id=a.category_id JOIN users u ON u.id=a.user_id ${sort}`);
    const sortToggle = sort === 'user'
      ? '<a href="/admin/apps" class="badge" style="font-size:.9rem;padding:.4rem 1rem">↕ Sort: newest first</a>'
      : '<a href="/admin/apps?sort=user" class="badge" style="font-size:.9rem;padding:.4rem 1rem">↕ Sort: by owner</a>';
    res.send(layout('Admin – all apps', `
${adminNav}
<h2>All apps (${apps.length})</h2>
<div id="appsort">${sortToggle}</div>
<table><tr><th>App</th><th>Category</th><th>By</th><th>Status</th><th></th></tr>
${apps.map(a => `
<tr><td><a href="/app/${a.id}">${esc(a.name)}</a></td><td>${esc(a.cat)}</td><td>${esc(a.owner)}</td>
<td><span class="badge ${a.status}">${a.status}</span></td>
<td style="white-space:nowrap">${a.status === 'hidden' ? `<form style="display:inline" action="/admin/unhide/${a.id}" method="post"><button>Unhide</button></form>` : `<form style="display:inline" action="/admin/hide/${a.id}" method="post"><button class="ghost">Hide</button></form>`}
<form style="display:inline" action="/admin/delete-app/${a.id}" method="post" onsubmit="return confirm('Delete app ${esc(a.name)} permanently?')"><button class="ghost">Delete</button></form></td></tr>`).join('')}
</table>
<p class="small">Registered users publish without prior approval – use Hide to temporarily remove an app from the store or Delete for good.</p>`, res.locals.user));
  } catch (e) { next(e); }
});
function requireAdmin(req, res, next) {
  if (res.locals.user?.role === 'admin') return next();
  res.status(403).send(layout('Forbidden', '<p>Admins only.</p>', res.locals.user));
}
app.post('/admin/reset-approve/:id', requireAdmin, async (req, res) => {
  await dbRun(`UPDATE reset_requests SET status='approved' WHERE id=? AND status='pending'`, req.params.id);
  res.redirect('/admin');
});
app.post('/admin/activate/:id', requireAdmin, async (req, res) => {
  await dbRun(`UPDATE users SET active=1 WHERE id=?`, req.params.id);
  res.redirect('/admin');
});
app.post('/admin/deactivate/:id', requireAdmin, async (req, res) => {
  await dbRun(`UPDATE users SET active=0 WHERE id=?`, req.params.id);
  res.redirect('/admin');
});
app.post('/admin/role/:id/developer', requireAdmin, async (req, res) => {
  await dbRun(`UPDATE users SET role='developer' WHERE id=? AND role!='admin'`, req.params.id);
  res.redirect('/admin');
});
app.post('/admin/role/:id', requireAdmin, async (req, res) => {
  await dbRun(`UPDATE users SET role='user' WHERE id=? AND role!='admin'`, req.params.id);
  res.redirect('/admin');
});
app.post('/admin/delete-user/:id', requireAdmin, async (req, res, next) => {
  try {
    const u = await dbGet('SELECT * FROM users WHERE id=?', req.params.id);
    if (u && u.role !== 'admin') {
      await dbRun('DELETE FROM apps WHERE user_id=?', u.id);
      await dbRun('DELETE FROM users WHERE id=?', u.id);
    }
    res.redirect('/admin');
  } catch (e) { next(e); }
});
app.post('/admin/approve/:id', requireAdmin, async (req, res) => {
  await dbRun(`UPDATE apps SET status='approved', updated_at=datetime('now') WHERE id=?`, req.params.id);
  res.redirect('/admin');
});
app.post('/admin/delete-app/:id', requireAdmin, async (req, res, next) => {
  try {
    const a = await dbGet('SELECT * FROM apps WHERE id=?', req.params.id);
    if (a) {
      if (a.icon_file && /^app-/.test(String(a.icon_file))) { try { fs.unlinkSync(path.join(ICON_DIR, path.basename(a.icon_file))); } catch {} }
      await dbRun('DELETE FROM apps WHERE id=?', a.id);
    }
    res.redirect('/admin/apps');
  } catch (e) { next(e); }
});
app.post('/admin/unhide/:id', requireAdmin, async (req, res) => {
  await dbRun(`UPDATE apps SET status='approved', updated_at=datetime('now') WHERE id=?`, req.params.id);
  res.redirect('/admin/apps');
});
app.post('/admin/hide/:id', requireAdmin, async (req, res) => {
  await dbRun(`UPDATE apps SET status='hidden', updated_at=datetime('now') WHERE id=?`, req.params.id);
  res.redirect('/admin/apps');
});

function errorHtml(req) {
  return ''; // simple flow: invalid input just re-renders via redirect
}

// Icon tile: uploaded/local file or remote URL, letter fallback
function iconTile(a, size = 44) {
  const s = `width:${size}px;height:${size}px`;
  if (a.icon_file && /^app-/.test(String(a.icon_file))) return `<img src="/app/${a.id}/icon" alt="" style="${s};border-radius:10px;flex:none">`;
  if (a.icon_file && /^https?:/.test(a.icon_file)) return `<img src="${esc(a.icon_file)}" alt="" style="${s};border-radius:10px;object-fit:cover;flex:none">`;
  const ch = esc(String(a.name || '?').trim()[0] || '?').toUpperCase();
  return `<span style="${s};border-radius:10px;background:var(--line);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.5)}px;flex:none">${ch}</span>`;
}

// temporary download route with expiring token
const DL_FILE = '/home/manisak/.openclaw/media/outbound/hstore_source.zip';
const DL_TOKENS = {};
function dlTokenFile() { try { return fs.readFileSync(path.join(__dirname, 'data', 'download-token'), 'utf8').trim(); } catch { return null; } }
app.get('/download/source/:token', function (req, res) {
  const t = DL_TOKENS[req.params.token] || ((req.params.token === dlTokenFile()) ? { exp: Date.now() + 86400000 } : null);
  if (!t || Date.now() > t.exp || !fs.existsSync(DL_FILE)) return res.sendStatus(404);
  res.set('Content-Type', 'application/zip');
  res.set('Content-Disposition', 'attachment; filename="harpoon-store-source.zip"');
  res.set('Cache-Control', 'no-store');
  res.send(fs.readFileSync(DL_FILE));
});
setInterval(function () {
  for (const k of Object.keys(DL_TOKENS)) if (Date.now() > DL_TOKENS[k].exp + 3600000) delete DL_TOKENS[k];
}, 3600000);

app.post('/app/:id/rate', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const stars = Math.round(Number(req.body.stars));
    if (!(stars >= 1 && stars <= 5)) return res.redirect('/app/' + req.params.id);
    await dbRun(`INSERT INTO ratings (app_id, user_id, stars, created_at) VALUES (?,?,?,datetime('now'))
      ON CONFLICT(app_id, user_id) DO UPDATE SET stars=excluded.stars, created_at=excluded.created_at`, req.params.id, res.locals.user.id, stars);
    res.redirect('/app/' + req.params.id);
  } catch (e) { next(e); }
});

app.post('/app/:id/comment', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const body = String(req.body.body || '').trim().slice(0, 2000);
    const a = await dbGet('SELECT id FROM apps WHERE id=?', req.params.id);
    if (!a) return res.sendStatus(404);
    if (body) await dbRun("INSERT INTO app_comments (app_id, user_id, body, created_at) VALUES (?,?,?,datetime('now'))", a.id, res.locals.user.id, body);
    res.redirect('/app/' + req.params.id);
  } catch (e) { next(e); }
});

app.post('/app/comment/:id/delete', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const c2 = await dbGet('SELECT ac.*, a.user_id AS maintainer FROM app_comments ac JOIN apps a ON a.id=ac.app_id WHERE ac.id=?', req.params.id);
    if (!c2) return res.sendStatus(404);
    if (res.locals.user.id === c2.user_id || res.locals.user.id === c2.maintainer || res.locals.user.role === 'admin') {
      await dbRun('DELETE FROM app_comments WHERE id=?', c2.id);
      return res.redirect('/app/' + c2.app_id);
    }
    res.sendStatus(403);
  } catch (e) { next(e); }
});

app.post('/app/:id/contributors', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const a = await dbGet('SELECT * FROM apps WHERE id=?', req.params.id);
    if (!a) return res.sendStatus(404);
    if (a.user_id !== res.locals.user.id && res.locals.user.role !== 'admin') return res.sendStatus(403);
    const m = a.repo_url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (!m) return res.send(layout('Contributors', '<p>Contributor lookup works only for GitHub repositories.</p><p><a href="/app/' + a.id + '">Back</a></p>', res.locals.user));
    new Promise(function (done) {
      const q = httpc.get('https://api.github.com/repos/' + m[1] + '/' + m[2] + '/contributors?per_page=12', { headers: { 'User-Agent': 'harpoon-store', Accept: 'application/vnd.github+json' } }, function (r) {
        let b = ''; r.on('data', function (c) { b += c; });
        r.on('end', function () { try { done(r.statusCode === 200 ? JSON.parse(b) : []); } catch (e) { done([]); } });
      });
      q.on('error', function () { done([]); });
      q.setTimeout(20000, function () { q.destroy(); done([]); });
    }).then(async function (list) {
      if (list && list.length) {
        for (const c of list) { if (c.login) await dbRun('INSERT INTO contributors (app_id, login) VALUES (?,?) ON CONFLICT(app_id, login) DO NOTHING', a.id, c.login); }
      }
      res.redirect('/app/' + a.id);
    });
  } catch (e) { next(e); }
});

app.post('/app/:id/pkg', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const a = await dbGet('SELECT * FROM apps WHERE id=?', req.params.id);
    if (!a) return res.sendStatus(404);
    if (a.user_id !== res.locals.user.id && res.locals.user.role !== 'admin') return res.sendStatus(403);
    const label = String(req.body.label || '').trim().slice(0, 60);
    let url = String(req.body.url || '').trim(); let protoOk = false;
    try { const x = new URL(url); protoOk = /^https?:$/.test(x.protocol); } catch {}
    if (label && protoOk) await dbRun('INSERT INTO app_packages (app_id, label, url) VALUES (?,?,?) ON CONFLICT(app_id, label) DO NOTHING', a.id, label, url);
    res.redirect('/app/' + a.id);
  } catch (e) { next(e); }
});

app.post('/app/pkg/:id/remove', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.redirect('/login');
    const p = await dbGet('SELECT ap.*, a.user_id AS maintainer FROM app_packages ap JOIN apps a ON a.id=ap.app_id WHERE ap.id=?', req.params.id);
    if (!p) return res.sendStatus(404);
    if (res.locals.user.id === p.maintainer || res.locals.user.role === 'admin') { await dbRun('DELETE FROM app_packages WHERE id=?', p.id); return res.redirect('/app/' + p.app_id); }
    res.sendStatus(403);
  } catch (e) { next(e); }
});

app.get('/download/source/link', function (req, res) {
  if (!res.locals.user || res.locals.user.role !== 'admin') return res.sendStatus(403);
  const t = crypto.randomBytes(18).toString('hex');
  DL_TOKENS[t] = { exp: Date.now() + 86400000 };
  res.send('<p>Download link (24 h gültig):</p><p><a href="download/source/' + t + '">/download/source/' + t + '</a></p>');
});

// debug receiver for the mobile client
const DBG_LOG = path.join(DATA_DIR, 'client-debug.log');
app.post('/api/debug', function (req, res) {
  fs.appendFileSync(DBG_LOG, new Date().toISOString() + ' ' + JSON.stringify(req.body) + '\n');
  res.status(200).json({ ok: true });
});

// ---------- public JSON API for the mobile client ----------
// categories endpoint
app.get('/api/categories.json', function (req, res) {
  db.all('SELECT c.id, c.slug, c.name, (SELECT COUNT(*) FROM apps WHERE category_id=c.id AND status=\'approved\') AS count FROM categories c ORDER BY c.name', [], function (e, rows) {
    if (e) return res.status(500).json({ error: String(e) });
    res.json({ categories: rows });
  });
});

app.get('/api/apps.json', async (req, res, next) => {
  try {
    const catSlug = (req.query.cat || '').trim();
    const whereClauses = ["a.status='approved'"];
    const qParams = [];
    if (catSlug) {
      const cRow = await dbGet('SELECT id FROM categories WHERE slug=?', catSlug);
      if (!cRow) return res.json({ categories: [], apps: [] });
      whereClauses.push('a.category_id=?');
      qParams.push(cRow.id);
    }
    const apps = await dbAll(`SELECT a.id, a.name, a.icon_file, a.source, a.description, a.repo_url, a.current_version, a.version_checked_at, c.name AS category, c.slug AS cat_slug,
      u.username AS owner, u.id AS owner_id,
      (SELECT AVG(stars) FROM ratings WHERE app_id=a.id) AS rating,
      (SELECT COUNT(*) FROM ratings WHERE app_id=a.id) AS ratings FROM apps a
      JOIN categories c ON c.id=a.category_id
      JOIN users u ON u.id=a.user_id
      WHERE ${whereClauses.join(' AND ')} ORDER BY a.id DESC`, ...qParams);
    const meta = await dbAll('SELECT app_id, file FROM screenshots ORDER BY id');
    const shots = {};
    for (const s of meta) (shots[s.app_id] = shots[s.app_id] || []).push('/api/app/' + s.app_id + '/shot/' + s.file);
    const contribRows = await dbAll('SELECT app_id, login FROM contributors ORDER BY id');
    const contribs = {};
    for (const r of contribRows) (contribs[r.app_id] = contribs[r.app_id] || []).push(r.login);
    const categoriesOut = await dbAll('SELECT c.id, c.slug, c.name, (SELECT COUNT(*) FROM apps WHERE category_id=c.id AND status=\'approved\') AS count FROM categories c ORDER BY c.name');
    res.json({ categories: categoriesOut, apps: apps.map(a => ({
      id: a.id, name: a.name,
      iconUrl: a.icon_file ? "/app/" + a.id + "/icon" : null,
      description: String(a.description).split("\\n")[0].slice(0, 180),
      repo_url: a.repo_url,
      current_version: a.current_version,
      version_checked_at: a.version_checked_at,
      category: a.category, cat_slug: a.cat_slug,
      rating: a.rating, ratings: a.ratings,
      owner: a.owner, owner_id: a.owner_id,
      contributors: contribs[a.id] || [],
      screenshots: shots[a.id] || [], source: a.source || ""
    })) });
  } catch (e) { next(e); }
});

app.get('/api/app/:id.json', async (req, res, next) => {
  try {
    const a = await dbGet(`SELECT a.*, c.slug AS cat_slug, c.name AS category, u.username AS owner, u.id AS owner_id
      FROM apps a JOIN categories c ON c.id=a.category_id JOIN users u ON u.id=a.user_id
      WHERE a.id=? AND a.status='approved'`, req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    const shots = await dbAll('SELECT id, file FROM screenshots WHERE app_id=? ORDER BY id', a.id);
    const rstats = await dbGet('SELECT AVG(stars) AS avg, COUNT(*) AS n FROM ratings WHERE app_id=?', a.id);
    const contribs = await dbAll('SELECT login FROM contributors WHERE app_id=? ORDER BY id LIMIT 24', a.id);
    const comments = await dbAll('SELECT ac.id, ac.body, ac.created_at, u.username FROM app_comments ac JOIN users u ON u.id=ac.user_id WHERE ac.app_id=? ORDER BY ac.id DESC LIMIT 30', a.id);
    const pkgs = await dbAll('SELECT id, label, url FROM app_packages WHERE app_id=? ORDER BY id', a.id);
    const otherByOwner = await dbAll('SELECT id, name FROM apps WHERE user_id=? AND id<>? AND status=\'approved\' ORDER BY name LIMIT 8', a.user_id, a.id);
    res.json({
      id: a.id, name: a.name,
      description: a.description,
      repo_url: a.repo_url,
      current_version: a.current_version,
      version_checked_at: a.version_checked_at,
      category: a.category, cat_slug: a.cat_slug,
      iconUrl: a.icon_file ? ('/app/' + a.id + '/icon') : null,
      rating: rstats?.avg || null, ratings: rstats?.n || 0,
      owner: a.owner, owner_id: a.owner_id,
      contributors: contribs.map(c => c.login),
      screenshots: shots.map(s => '/api/app/' + a.id + '/shot/' + s.file),
      packages: pkgs,
      comments: comments.map(c => ({ id: c.id, body: c.body, username: c.username, created_at: c.created_at })),
      more_from_developer: otherByOwner
    });
  } catch (e) { next(e); }
});

app.get('/api/developer/:username.json', async (req, res, next) => {
  try {
    const u = await dbGet('SELECT id, username, role, created_at FROM users WHERE username=?', req.params.username);
    if (!u) return res.status(404).json({ error: 'not found' });
    const apps = await dbAll(`SELECT a.id, a.name, a.icon_file, a.source, a.current_version, c.name AS category,
      (SELECT AVG(stars) FROM ratings WHERE app_id=a.id) AS rating,
      (SELECT COUNT(*) FROM ratings WHERE app_id=a.id) AS ratings
      FROM apps a JOIN categories c ON c.id=a.category_id
      WHERE a.user_id=? AND a.status='approved' ORDER BY a.name`, u.id);
    const total = await dbGet('SELECT COUNT(*) AS n FROM apps WHERE user_id=? AND status=\'approved\'', u.id);
    res.json({
      username: u.username, role: u.role, member_since: u.created_at,
      app_count: total?.n || 0,
      apps: apps.map(a => ({
        id: a.id, name: a.name,
        iconUrl: a.icon_file ? ('/app/' + a.id + '/icon') : null,
        category: a.category, current_version: a.current_version,
        rating: a.rating, ratings: a.ratings
      }))
    });
  } catch (e) { next(e); }
});
app.get('/api/app/:id/shot/:file', async (req, res) => {
  const s = await dbGet('SELECT file FROM screenshots WHERE app_id=? AND file=?', req.params.id, req.params.file);
  if (!s) return res.sendStatus(404);
  const p = path.join(SHOT_DIR, path.basename(s.file));
  if (!fs.existsSync(p)) return res.sendStatus(404);
  res.type(path.extname(p) === '.jpg' || path.extname(p) === '.jpeg' ? 'image/jpeg' : path.extname(p) === '.webp' ? 'image/webp' : 'image/png').send(fs.readFileSync(p));
});

require('./forum')(app, { esc, dbAll, dbGet, dbRun, layout });

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(layout('Error', '<p>Something went wrong.</p>', req.session?.user));
});

app.listen(PORT, () => console.log(`Harpoon Store listening on http://0.0.0.0:${PORT}`));

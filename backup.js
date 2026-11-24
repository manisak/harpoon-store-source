#!/usr/bin/env node
// VACUUM INTO makes a clean, consistent online backup of the live DB
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const BK = '/home/manisak/backups/harpoon-store';
fs.mkdirSync(BK, { recursive: true });
const d = new Date();
const dest = path.join(BK, `store-${d.toISOString().slice(0, 10)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.db`);
if (fs.existsSync(dest)) { console.log('backup already exists:', dest); process.exit(0); }
const db = new sqlite3.Database(path.join(__dirname, 'data', 'store.db'), sqlite3.OPEN_READONLY);
db.run(`VACUUM INTO ?`, dest, (err) => {
  db.close();
  if (err) { console.error('backup failed', err); process.exit(1); }
  const files = fs.readdirSync(BK).filter(f => f.startsWith('store-')).sort().reverse();
  for (const f of files.slice(14)) { try { fs.unlinkSync(path.join(BK, f)); } catch {} }
  console.log('backup ok:', dest, fs.statSync(dest).size, 'bytes, retained:', Math.min(files.length, 14));
});

// PNG -> WebP（保留 alpha），用 CDP 调 canvas.toDataURL
// node tools/to-webp.mjs
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = 'D:/AI/project/littlegame/prototype/assets/';
const QUALITY = 0.82;

const profile = mkdtempSync(join(tmpdir(), 'webp-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=9341',
  `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9341/json/new?about:blank', { method: 'PUT' });
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('chrome not ready');
}

let id = 0;
const pending = new Map();
const send = (ws, method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});

const files = readdirSync(DIR).filter((f) => f.endsWith('.bin.png'));
if (!files.length) { console.log('没有 .bin.png 待转换'); process.exit(0); }

const ws = new WebSocket(await wsUrl());
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
await send(ws, 'Page.enable');

let totalIn = 0, totalOut = 0;

for (const f of files) {
  const base = f.replace(/\.bin\.png$/, '');
  const buf = readFileSync(DIR + f);
  totalIn += buf.length;
  const dataUrl = 'data:image/png;base64,' + buf.toString('base64');

  const expr = `(async () => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = ${JSON.stringify(dataUrl)}; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', ${QUALITY});
  })()`;

  const r = await send(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  const url = r && r.result && r.result.value;
  if (!url || !url.startsWith('data:image/webp')) {
    console.log('FAIL', base, JSON.stringify(r && r.result).slice(0, 200));
    continue;
  }
  const out = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(DIR + base + '.webp', out);
  totalOut += out.length;
  console.log(`${base.padEnd(14)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB -> ${(out.length / 1024).toFixed(0).padStart(4)} KB`);
}

console.log(`\n合计 ${(totalIn / 1024 / 1024).toFixed(2)} MB -> ${(totalOut / 1024 / 1024).toFixed(2)} MB`);

ws.close();
chrome.kill();
process.exit(0);

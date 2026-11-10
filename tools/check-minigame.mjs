// 抓小游戏预览页的控制台输出：node tools/check-minigame.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'file:///D:/AI/project/littlegame/minigame/preview.html?debug=1&mute=1';
const OUT_PNG = 'D:/AI/project/littlegame/minigame/_rank.png';

const profile = mkdtempSync(join(tmpdir(), 'mg-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--allow-file-access-from-files',
  '--remote-debugging-port=9355',
  `--user-data-dir=${profile}`,
  '--window-size=414,896',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9355/json/new?about:blank', { method: 'PUT' });
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

const ws = new WebSocket(await wsUrl());
await new Promise((r) => (ws.onopen = r));

const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    logs.push(`[${m.params.type}] ${text}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push(`[EXCEPTION] ${d.text} ${d.exception?.description ?? ''}`);
  }
  if (m.method === 'Log.entryAdded') {
    const en = m.params.entry;
    if (en.level === 'error' || en.level === 'warning') logs.push(`[${en.level}] ${en.text}`);
  }
};

await send(ws, 'Runtime.enable');
await send(ws, 'Log.enable');
await send(ws, 'Page.enable');
await send(ws, 'Emulation.setDeviceMetricsOverride', {
  width: 414, height: 896, deviceScaleFactor: 2, mobile: true
});
await send(ws, 'Page.navigate', { url: URL });
await sleep(3500);

// 模拟一次拖动，验证 wx 触摸通道是否接上
const before = await send(ws, 'Runtime.evaluate', {
  expression: `window.__cw ? JSON.stringify({p: window.__cw.progress, s: window.__cw.state}) : 'no-debug'`,
  returnByValue: true
});
await send(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: 120, y: 500, button: 'left', clickCount: 1 });
for (let i = 0; i < 24; i++) {
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: 120 + i * 10, y: 500 + Math.sin(i / 3) * 30, button: 'left' });
  await sleep(30);
}
await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: 350, y: 500, button: 'left', clickCount: 1 });
await sleep(400);
const after = await send(ws, 'Runtime.evaluate', {
  expression: `window.__cw ? JSON.stringify({p: window.__cw.progress, s: window.__cw.state}) : 'no-debug'`,
  returnByValue: true
});
console.log('触摸前:', before.result?.value);
console.log('触摸后:', after.result?.value);

const probe = await send(ws, 'Runtime.evaluate', {
  expression: `JSON.stringify({
    href: location.href,
    ready: document.readyState,
    scripts: Array.from(document.scripts).map(s => s.src),
    wx: typeof wx,
    cw: typeof window.CW,
    imgs: typeof window.CW_IMG,
    env: window.__WX_ENV || null,
    canvases: document.querySelectorAll('canvas').length,
    canvasSize: (() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; })(),
    centerPixel: (() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      const g = c.getContext('2d');
      const d = g.getImageData(Math.floor(c.width/2), Math.floor(c.height/2), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    })()
  })`,
  returnByValue: true
});

if (process.argv[2] === 'done') {
  // 直接做完一关，看结算卡的分享入口
  await send(ws, 'Runtime.evaluate', {
    expression: `(async () => {
      const cw = window.__cw;
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const sleep = ms => new Promise(res => setTimeout(res, ms));
      const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
        clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1
      }));
      const kite = setInterval(() => cw.refill(), 100);
      const B = cw.level.bounds;
      ev('pointerdown', 20, r.height * 0.35);
      for (let p = 0; p < 6; p++) {
        for (let i = 0; i <= 16; i++) {
          const y = (B.y + B.h * i / 16) * r.height;
          for (let s = 0; s <= 20; s++) {
            ev('pointermove', (B.x + B.w * s / 20) * r.width, y);
            await sleep(8);
          }
        }
      }
      ev('pointerup', 0, 0);
      clearInterval(kite);
      await sleep(2000);
      return cw.state;
    })()`,
    awaitPromise: true, returnByValue: true
  });
  await sleep(500);
  console.log('结算后状态:', await send(ws, 'Runtime.evaluate', { expression: 'window.__cw.state', returnByValue: true }).then(r => r.result?.value));
  // 点"分享"（底部第 3 个入口）
  const clicked = await send(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const btn = window.__cw.buttons[6];
      if (!btn) return 'no-btn ' + window.__cw.buttons.length;
      const x = r.left + btn.x + btn.w / 2, y = r.top + btn.y + btn.h / 2;
      for (const t of ['pointerdown', 'pointerup']) {
        cv.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
      }
      return 'clicked';
    })()`,
    returnByValue: true
  });
  await send(ws, 'Runtime.evaluate', { expression: 'window.__cw.share()' });
  console.log('点击分享:', clicked.result?.value);
  await sleep(300);
  console.log('分享内容:', await send(ws, 'Runtime.evaluate', { expression: 'JSON.stringify(window.__lastShare)', returnByValue: true }).then(r => r.result?.value));
}

if (process.argv[2] === 'rank') {
  await send(ws, 'Runtime.evaluate', { expression: `window.__cw && window.__cw.openRank()` });
  await sleep(600);
}
const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT_PNG, Buffer.from(shot.data, 'base64'));
console.log('截图:', OUT_PNG);

console.log('日志:');
console.log(logs.length ? logs.join('\n') : '  (无输出)');
console.log('\n状态:', probe.result?.value);

ws.close();
chrome.kill();
process.exit(0);

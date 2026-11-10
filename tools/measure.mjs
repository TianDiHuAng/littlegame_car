// 测量每个关卡"洗完需要多少水"（1 级 / 5 级水枪各测一次），用于定水量预算
//   node tools/measure.mjs > measure.csv
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'file:///D:/AI/project/littlegame/prototype/index.html';

const profile = mkdtempSync(join(tmpdir(), 'cdp-m-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=9335',
  `--user-data-dir=${profile}`,
  '--mute-audio', '--window-size=480,900',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9335/json/new?about:blank', { method: 'PUT' });
      const j = await res.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('chrome not ready');
}

let id = 0;
const pending = new Map();
function send(ws, method, params = {}) {
  return new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

const RUN = `
(async () => {
  const cv = document.getElementById('game');
  const r = cv.getBoundingClientRect();
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
    clientX: r.left + x, clientY: r.top + y, bubbles: true,
    pointerId: 1, pointerType: 'touch', isPrimary: true
  }));
  const B = window.__cw.level.bounds;
  const br = window.__cw.brush;
  const x0 = (B.x + 0.01) * r.width, x1 = (B.x + B.w - 0.01) * r.width;
  const y0 = (B.y + 0.01) * r.height, y1 = (B.y + B.h - 0.01) * r.height;
  const step = Math.max(10, br * 0.7);
  const rows = Math.max(2, Math.ceil((y1 - y0) / step));
  const cols = Math.max(2, Math.ceil((x1 - x0) / step));

  const kite = setInterval(() => window.__cw.refill(), 120);
  ev('pointerdown', x0, y0);
  await sleep(20);

  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i <= rows; i++) {
      const y = y0 + (y1 - y0) * i / rows;
      const dir = i % 2 ? 1 : -1;
      for (let s = 0; s <= cols; s++) {
        const k = dir > 0 ? s / cols : 1 - s / cols;
        ev('pointermove', x0 + (x1 - x0) * k, y);
        await sleep(8);
        if (window.__cw.state !== 'play') { clearInterval(kite); ev('pointerup', 0, 0); return 'early'; }
      }
    }
  }
  clearInterval(kite);
  ev('pointerup', 0, 0);
  await sleep(2500);
  return 'ok';
})()`;

async function main() {
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };

  const evalPage = async (expr) => {
    const r = await send(ws, 'Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true
    });
    return r && r.result && r.result.value;
  };

  await send(ws, 'Page.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 480, height: 900, deviceScaleFactor: 1, mobile: true
  });

  console.log('lv,upgrade,waterSpent,progress,state,waterMax');

  for (let lv = 0; lv < 10; lv++) {
    for (const up of [1, 5]) {
      await send(ws, 'Page.navigate', { url: `${BASE}?lv=${lv}&debug=1&fresh=1&mute=1` });
      await sleep(1000);
      await evalPage(`(() => {
        const s = window.__cw.save;
        s.up.pressure = ${up}; s.up.nozzle = ${up}; s.up.detergent = ${up};
        return 'set';
      })()`);
      await sleep(120);
      await evalPage(RUN);
      const out = await evalPage(`JSON.stringify({
        spent: Math.round(window.__cw.waterSpent),
        prog: window.__cw.progress.toFixed(3),
        st: window.__cw.state,
        wm: window.__cw.waterMax
      })`);
      const o = JSON.parse(out || '{}');
      console.log([lv + 1, up, o.spent, o.prog, o.st, o.wm].join(','));
    }
  }

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });

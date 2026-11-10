// 用 CDP 真实驱动输入，给原型截图验证
//   node tools/shot.mjs <idle|half|full|jet|done|upgrade> <输出png> <关卡>
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'file:///D:/AI/project/littlegame/prototype/index.html';
const mode = process.argv[2] || 'idle';
const lv = process.argv[4] || '0';
const outFile = process.argv[3] || `D:/AI/project/littlegame/prototype/_shot_${mode}.png`;

const profile = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  '--remote-debugging-port=9334',
  `--user-data-dir=${profile}`,
  '--window-size=480,900',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9334/json/new?about:blank', { method: 'PUT' });
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

const SPRAY = (passes, keepDown) => `
(async () => {
  const cv = document.getElementById('game');
  if (!cv) return 'no canvas';
  const r = cv.getBoundingClientRect();
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
    clientX: r.left + x, clientY: r.top + y, bubbles: true,
    pointerId: 1, pointerType: 'touch', isPrimary: true
  }));
  const pad = 20;
  const x0 = pad, x1 = r.width - pad;
  const y0 = r.height * 0.30, y1 = r.height * 0.74;
  ev('pointerdown', x0, y0);
  await sleep(30);
  const rows = 18;
  for (let p = 0; p < ${passes}; p++) {
    for (let i = 0; i <= rows; i++) {
      const y = y0 + (y1 - y0) * i / rows;
      const dir = i % 2 ? 1 : -1;
      const steps = 26;
      for (let s = 0; s <= steps; s++) {
        const k = dir > 0 ? s / steps : 1 - s / steps;
        ev('pointermove', x0 + (x1 - x0) * k, y);
        await sleep(11);
      }
    }
  }
  ${keepDown ? '' : "ev('pointerup', 0, 0);"}
  return keepDown ? 'holding' : 'sprayed';
})()`;

const CLICK = (i) => `(() => {
  const cv = document.getElementById('game');
  const r = cv.getBoundingClientRect();
  const b = window.__cw.buttons[${i}];
  if (!b) return 'no button ' + ${i};
  const x = r.left + b.x + b.w / 2, y = r.top + b.y + b.h / 2;
  for (const t of ['pointerdown', 'pointerup']) {
    cv.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
  }
  return 'clicked ' + ${i};
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
  await send(ws, 'Page.navigate', { url: `${BASE}?lv=${lv}&debug=1&fresh=1&mute=1` });
  await sleep(1200);

  if (mode === 'foam') {
    console.log('toggle:', await evalPage(`(() => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const x = r.left + r.width * 0.321, y = r.top + r.height * 0.9256;
      for (const t of ['pointerdown', 'pointerup']) {
        cv.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
      }
      return 'tapped';
    })()`));
    await sleep(200);
    console.log('spray:', await evalPage(`(async () => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const sleep = ms => new Promise(res => setTimeout(res, ms));
      const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
        clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1
      }));
      ev('pointerdown', 40, r.height * 0.56);
      for (let i = 0; i < 26; i++) {
        ev('pointermove', 40 + i * 15, r.height * 0.56 + Math.sin(i / 2) * 30);
        await sleep(30);
      }
      return 'foamed';
    })()`));
    await sleep(120);
  } else if (mode === 'jetmax') {
    await evalPage('window.__cw.save.up.pressure = 5; window.__cw.save.up.nozzle = 5; "maxed"');
    console.log('spray:', await evalPage(SPRAY(0.3, true)));
    await sleep(120);
  } else if (mode === 'jet') {
    console.log('spray:', await evalPage(SPRAY(0.3, true)));
    await sleep(120);
  } else if (mode === 'half') {
    console.log('spray:', await evalPage(SPRAY(1, false)));
    await sleep(600);
  } else if (mode === 'pick') {
    console.log('click:', await evalPage(CLICK(0)));
    await sleep(400);
    console.log('state:', await evalPage('window.__cw.state'));
    await evalPage(SPRAY(5, false));
    await sleep(1600);
    console.log('after wash:', await evalPage('window.__cw.state'), 'water:', await evalPage('Math.round(window.__cw.water)'));
  } else if (mode === 'audio') {
    await evalPage(SPRAY(0.4, true));
    await sleep(500);
    console.log('按住时:', JSON.stringify(await evalPage('window.__cw.audio')));
    await evalPage(`(() => {
      const cv = document.getElementById('game');
      cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      return 'released';
    })()`);
    await sleep(700);
    console.log('松开后:', JSON.stringify(await evalPage('window.__cw.audio')));
  } else if (mode === 'scrapeui') {
    console.log('pick:', await evalPage(`(() => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const x = r.left + r.width * 0.5125, y = r.top + r.height * 0.9256;
      for (const t of ['pointerdown', 'pointerup']) {
        cv.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
      }
      return window.__cw.tool;
    })()`));
    await sleep(150);
    console.log('drag:', await evalPage(`(async () => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const sleep = ms => new Promise(res => setTimeout(res, ms));
      const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
        clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1
      }));
      ev('pointerdown', 150, 490);
      for (let i = 0; i < 14; i++) {
        const a = i * 0.8;
        ev('pointermove', 154 + Math.cos(a) * 10, 493 + Math.sin(a) * 10);
        await sleep(40);
      }
      return 'scrubbing';
    })()`));
    await sleep(100);
  } else if (mode === 'paintflow') {
    // 断水前先冲干净，再刮硬垢，看掉漆是否在刮掉后才出现
    console.log('刮前:', JSON.stringify(await evalPage('({crusts: window.__cw.crusts, paintAll: window.__cw.paint, paintVis: window.__cw.paintVisible, paintPos: window.__cw.paintPos})')));
    await evalPage(`(async () => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const sleep = ms => new Promise(res => setTimeout(res, ms));
      const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
        clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1
      }));
      const kite = setInterval(() => window.__cw.refill(), 100);
      // 先冲掉表面的泥（不碰硬垢）
      const B = window.__cw.level.bounds;
      const x0 = (B.x + 0.01) * r.width, x1 = (B.x + B.w - 0.01) * r.width;
      const y0 = (B.y + 0.01) * r.height, y1 = (B.y + B.h - 0.01) * r.height;
      const rows = 16;
      ev('pointerdown', x0, y0);
      for (let p = 0; p < 4; p++) {
        for (let i = 0; i <= rows; i++) {
          const y = y0 + (y1 - y0) * i / rows;
          const dir = i % 2 ? 1 : -1;
          for (let s = 0; s <= 22; s++) {
            const k = dir > 0 ? s / 22 : 1 - s / 22;
            ev('pointermove', x0 + (x1 - x0) * k, y);
            await sleep(9);
          }
        }
      }
      ev('pointerup', 0, 0);
      clearInterval(kite);
      return 'washed';
    })()`);
    await sleep(400);
    console.log('冲完（未刮）:', JSON.stringify(await evalPage('({state: window.__cw.state, crusts: window.__cw.crusts, paintAll: window.__cw.paint, paintVis: window.__cw.paintVisible})')));

    // 切到刮刀
    await evalPage(`(() => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const x = r.left + r.width * 0.5125, y = r.top + r.height * 0.9256;
      for (const t of ['pointerdown', 'pointerup']) {
        cv.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
      }
      return 'picked';
    })()`);
    await sleep(150);
    console.log('tool:', await evalPage('window.__cw.tool'));

    // 逐个刮硬垢
    await evalPage(`(async () => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const sleep = ms => new Promise(res => setTimeout(res, ms));
      const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
        clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1
      }));
      const spots = window.__cw.crustPos;
      for (const s of spots) {
        ev('pointerdown', s.x, s.y);
        for (let i = 0; i < 56; i++) {
          ev('pointermove', s.x + Math.cos(i) * 6, s.y + Math.sin(i) * 6);
          await sleep(50);
        }
        ev('pointerup', 0, 0);
      }
      return 'scraped ' + spots.length;
    })()`);
    await sleep(400);
    console.log('刮后:', JSON.stringify(await evalPage('({state: window.__cw.state, crusts: window.__cw.crusts, paintAll: window.__cw.paint, paintVis: window.__cw.paintVisible, paintPos: window.__cw.paintPos})')));
  } else if (mode === 'scrape') {
    console.log('spray:', await evalPage(SPRAY(5, false)));
    await sleep(900);
    console.log('刮前  crusts:', await evalPage('window.__cw.crusts'),
      ' paint全部:', await evalPage('window.__cw.paint'),
      ' 可见:', await evalPage('window.__cw.paintVisible'));
    console.log('pick tool:', await evalPage(`(() => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const x = r.left + r.width * 0.5125, y = r.top + r.height * 0.9256;
      for (const t of ['pointerdown', 'pointerup']) {
        cv.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
      }
      return 'ok';
    })()`));
    await sleep(150);
    console.log('buttons:', JSON.stringify(await evalPage('window.__cw.buttons.map(b => [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)])')));
    console.log('tool:', await evalPage('window.__cw.tool'));
    console.log('scrub:', await evalPage(`(async () => {
      const cv = document.getElementById('game');
      const r = cv.getBoundingClientRect();
      const sleep = ms => new Promise(res => setTimeout(res, ms));
      const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
        clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1
      }));
      ev('pointerdown', 150, 490);
      for (let i = 0; i < 40; i++) {
        const a = i * 0.7;
        ev('pointermove', 154 + Math.cos(a) * 8, 493 + Math.sin(a) * 8);
        await sleep(40);
      }
      ev('pointerup', 0, 0);
      return 'scrubbed';
    })()`));
    console.log('刮后  crusts:', await evalPage('window.__cw.crusts'),
      ' 可见:', await evalPage('window.__cw.paintVisible'));
    await sleep(1200);
    console.log('final state:', await evalPage('window.__cw.state'));
  } else if (mode === 'full' || mode === 'done' || mode === 'upgrade' || mode === 'compare' || mode === 'zen') {
    console.log('spray:', await evalPage(SPRAY(5, false)));
    await sleep(1400);
    if (mode === 'done' || mode === 'upgrade' || mode === 'compare' || mode === 'zen') {
      console.log('state:', await evalPage('window.__cw.state'));
      if (mode === 'upgrade') {
        console.log('click:', await evalPage(CLICK(2)));
        await sleep(500);
        console.log('state:', await evalPage('window.__cw.state'));
      }
      if (mode === 'compare') {
        console.log('click:', await evalPage(CLICK(3)));
        await sleep(400);
        console.log('state:', await evalPage('window.__cw.state'));
      }
      if (mode === 'zen') {
        console.log('click:', await evalPage(CLICK(4)));
        await sleep(500);
        console.log('state:', await evalPage('window.__cw.state'));
        await evalPage(SPRAY(0.35, true));
        await sleep(120);
      }
    }
  }

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
  console.log('saved', outFile);

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });

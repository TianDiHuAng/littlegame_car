// 第二套备案截图：泡沫 / 刮刀 / 洗前洗后对比
// node tools/make-filing-shots-2.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'D:/AI/project/littlegame/docs/filing/第二套';
const GAME = 'file:///D:/AI/project/littlegame/prototype/index.html';
const VW = 480, VH = 900, DPR = 2;

mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'filing2-'));
let chrome = null, ws = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanup() {
  try { if (ws) ws.close(); } catch (e) {}
  try { if (chrome) chrome.kill(); } catch (e) {}
}

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9388/json/new?about:blank', { method: 'PUT' });
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome 启动失败');
}

let id = 0;
const pending = new Map();
function send(method, params = {}, timeoutMs = 90000) {
  return new Promise((res) => {
    const i = ++id;
    const timer = setTimeout(() => {
      if (pending.has(i)) { pending.delete(i); console.log('  ! 超时:', method); res(undefined); }
    }, timeoutMs);
    pending.set(i, (v) => { clearTimeout(timer); res(v); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

async function evalPage(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, 180000);
  if (!r) return undefined;
  if (r.exceptionDetails) {
    console.log('  ! 异常:', r.exceptionDetails.exception && r.exceptionDetails.exception.description);
    return undefined;
  }
  return r.result && r.result.value;
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, 120000);
  if (!r || !r.data) { console.log('  ✗', name); return; }
  writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('  ✓', name + '.png');
}

// 在某个点按住并小幅晃动，让指针保持在按下状态（水柱/泡沫/刮刀环留在画面上）
const HOLD = (x, y, frames) => `
(async () => {
  const cv = document.getElementById('game');
  const r = cv.getBoundingClientRect();
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const ev = (t, px, py) => cv.dispatchEvent(new PointerEvent(t, {
    clientX: r.left + px, clientY: r.top + py, bubbles: true, pointerId: 1
  }));
  const px = ${x} * r.width, py = ${y} * r.height;
  ev('pointerdown', px - 30, py - 30);
  for (let i = 0; i < ${frames}; i++) {
    ev('pointermove', px + Math.cos(i * 0.9) * 26, py + Math.sin(i * 0.9) * 20);
    await sleep(40);
  }
  return 'held';
})()`;

try {
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--mute-audio', '--allow-file-access-from-files',
    '--remote-debugging-port=9388', `--user-data-dir=${profile}`,
    '--window-size=' + VW + ',' + VH, 'about:blank'
  ], { stdio: 'ignore' });

  ws = new WebSocket(await connect());
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: true });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(function(){var s=document.createElement('style');
      s.textContent='#stage{width:100vw!important;height:100vh!important;max-width:none!important;border-radius:0!important;box-shadow:none!important}';
      document.documentElement.appendChild(s);})();`
  });

  console.log('第二套 →', OUT);

  await send('Page.navigate', { url: GAME + '?lv=1&debug=1&mute=1&fresh=1' });
  await sleep(2400);
  const smoke = await evalPage('typeof window.__cw');
  if (smoke !== 'object') throw new Error('游戏没起来: ' + smoke);
  await evalPage(`document.getElementById('stage').style.width='100vw';
                  document.getElementById('stage').style.height='100vh';
                  window.dispatchEvent(new Event('resize'));`);
  await sleep(500);

  // ── 1) 泡沫洗厚泥（面包车，厚泥在下半身）
  console.log('→ 泡沫');
  await evalPage("window.__cw.setTool('foam')");
  await sleep(300);
  await evalPage(HOLD(0.30, 0.58, 22));
  await evalPage(HOLD(0.55, 0.62, 18));
  await sleep(200);
  await shot('A-泡沫洗厚泥');

  // ── 2) 刮刀刮硬垢（跑车，两处硬垢）
  console.log('→ 刮刀');
  await evalPage("document.getElementById('game').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}))");
  await evalPage('window.__cw.startLevel(3)');
  await sleep(700);
  await evalPage("window.__cw.setTool('scrape')");
  await sleep(300);
  const pos = await evalPage('JSON.stringify(window.__cw.crustPos[0])');
  const c = pos ? JSON.parse(pos) : null;
  if (c) {
    await evalPage(HOLD((c.x / VW).toFixed(4), (c.y / VH).toFixed(4), 20));
  }
  await sleep(200);
  await shot('B-刮刀除硬垢');
  await evalPage("document.getElementById('game').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}))");

  // ── 3) 洗前洗后对比（洗完后打开对比视图）
  console.log('→ 洗前洗后');
  await evalPage('window.__cw.startLevel(0)');
  await sleep(700);
  await evalPage(`
(async () => {
  const cv = document.getElementById('game');
  const r = cv.getBoundingClientRect();
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
    clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1
  }));
  const x0 = 20, x1 = r.width - 20, y0 = r.height * 0.30, y1 = r.height * 0.74;
  const kite = setInterval(() => window.__cw.refill(), 120);
  ev('pointerdown', x0, y0);
  for (let p = 0; p < 4; p++) {
    for (let i = 0; i <= 18; i++) {
      const y = y0 + (y1 - y0) * i / 18;
      const dir = i % 2 ? 1 : -1;
      for (let s = 0; s <= 26; s++) {
        const k = dir > 0 ? s / 26 : 1 - s / 26;
        ev('pointermove', x0 + (x1 - x0) * k, y);
        await sleep(9);
      }
    }
  }
  clearInterval(kite);
  ev('pointerup', 0, 0);
  return window.__cw.state;
})()`);
  await sleep(2600);
  console.log('  状态:', await evalPage('window.__cw.state'));
  await evalPage('window.__cw.openCompare()');
  await sleep(700);
  await shot('C-洗前洗后对比');

  console.log('\n完成，3 张。');
} catch (e) {
  console.log('失败:', e.message);
} finally {
  cleanup();
  process.exit(0);
}

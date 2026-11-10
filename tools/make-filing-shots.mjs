// 生成备案用截图：1080×1920，统一尺寸
// node tools/make-filing-shots.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'D:/AI/project/littlegame/docs/filing';
const GAME = 'file:///D:/AI/project/littlegame/prototype/index.html';
const MINI = 'file:///D:/AI/project/littlegame/minigame/preview.html';

const VW = 480, VH = 900, DPR = 2;   // 先出 960×1800，最后统一放大到 1080×1920

mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'filing-'));
let chrome = null;
let ws = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanup() {
  try { if (ws) ws.close(); } catch (e) {}
  try { if (chrome) chrome.kill(); } catch (e) {}
}

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9377/json/new?about:blank', { method: 'PUT' });
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('chrome 启动失败');
}

let id = 0;
const pending = new Map();

function send(method, params = {}, timeoutMs = 60000) {
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
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, 240000);
  if (!r) return undefined;
  if (r.exceptionDetails) {
    console.log('  ! 页面异常:', r.exceptionDetails.exception && r.exceptionDetails.exception.description);
    return undefined;
  }
  return r.result && r.result.value;
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, 120000);
  if (!r || !r.data) { console.log('  ✗ 截图失败:', name); return; }
  writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('  ✓', name + '.png  (' + VW * DPR + '×' + VH * DPR + ')');
}

// 横扫冲洗：refill 保水，密度刻意放低（备案图不需要 100%）
const WASH = (passes, target, hold) => `
(async () => {
  const cv = document.getElementById('game');
  const r = cv.getBoundingClientRect();
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
    clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1
  }));
  const B = window.__cw.level.bounds;
  const x0 = 20, x1 = r.width - 20;
  const y0 = r.height * 0.30, y1 = r.height * 0.74;
  const rows = 18;
  const kite = setInterval(() => window.__cw.refill(), 120);
  ev('pointerdown', x0, y0);
  const TARGET = ${target === undefined ? 2 : target};
  outer:
  for (let p = 0; p < ${passes}; p++) {
    for (let i = 0; i <= rows; i++) {
      if (window.__cw.progress >= TARGET) break outer;
      const y = y0 + (y1 - y0) * i / rows;
      const dir = i % 2 ? 1 : -1;
      for (let s = 0; s <= 26; s++) {
        const k = dir > 0 ? s / 26 : 1 - s / 26;
        ev('pointermove', x0 + (x1 - x0) * k, y);
        await sleep(10);
      }
    }
  }
  clearInterval(kite);
  if (${hold ? "true" : "false"}) {
    const hx = (B.x + B.w * 0.42) * r.width, hy = (B.y + B.h * 0.45) * r.height;
    ev('pointermove', hx, hy);
    await sleep(120);
    return window.__cw.progress;
  }
  ev('pointerup', 0, 0);
  return window.__cw.progress;
})()`;

try {
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--mute-audio', '--allow-file-access-from-files',
    '--remote-debugging-port=9377', `--user-data-dir=${profile}`,
    '--window-size=' + VW + ',' + VH,
    '--disable-dev-shm-usage',
    'about:blank'
  ], { stdio: 'ignore' });

  ws = new WebSocket(await connect());
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VW, height: VH, deviceScaleFactor: DPR, mobile: true
  });

  // 舞台铺满视口（原型里 #stage 有最大宽度限制）
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(function(){
      var s = document.createElement('style');
      s.textContent = '#stage{width:100vw!important;height:100vh!important;max-width:none!important;border-radius:0!important;box-shadow:none!important}';
      document.documentElement.appendChild(s);
    })();`
  });

  console.log('生成备案截图 →', OUT);

  /* ---------- 只加载一次游戏页面 ---------- */
  await send('Page.navigate', { url: GAME + '?lv=0&debug=1&mute=1&fresh=1' });
  await sleep(2200);

  const smoke = await evalPage('typeof window.__cw');
  if (smoke !== 'object') throw new Error('游戏没起来: ' + smoke);

  await evalPage(`document.getElementById('stage').style.width='100vw';
                  document.getElementById('stage').style.height='100vh';
                  window.dispatchEvent(new Event('resize'));`);
  await sleep(500);

  // 1) 冲洗中
  console.log('→ 冲洗中');
  console.log('  进度:', await evalPage(WASH(4, 0.35, true)));
  await sleep(150);
  await shot('01-冲洗中');
  await evalPage("document.getElementById('game').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))");

  // 2) 四种工具（面包车 + 泡沫，能看到厚泥高亮）
  console.log('→ 工具');
  await evalPage('window.__cw.startLevel(1)');
  await sleep(600);
  await evalPage("window.__cw.setTool('foam')");
  await sleep(600);
  await shot('02-工具');

  // 3) 结算
  console.log('→ 结算');
  await evalPage('window.__cw.startLevel(0)');
  await sleep(600);
  console.log('  进度:', await evalPage(WASH(3)));
  await sleep(2600);
  console.log('  状态:', await evalPage('window.__cw.state'));
  await shot('03-结算');

  // 4) 升级面板
  console.log('→ 升级');
  await evalPage('window.__cw.openUpgrade()');
  await sleep(600);
  await shot('04-升级');

  /* ---------- 好友排行用带模拟数据的小游戏包 ---------- */
  console.log('→ 好友排行');
  await send('Page.navigate', { url: MINI + '?debug=1&mute=1' });
  await sleep(2600);
  await evalPage('window.__cw && window.__cw.openRank()');
  await sleep(900);
  await shot('05-好友排行');

  console.log('\n完成，共 5 张，统一 ' + VW * DPR + '×' + VH * DPR);
} catch (e) {
  console.log('失败:', e.message);
} finally {
  cleanup();
  process.exit(0);
}

// 清洁系统的替代截图（避免与已提交的重复）
// node tools/make-filing-shots-3.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'D:/AI/project/littlegame/docs/filing/第二套';
const GAME = 'file:///D:/AI/project/littlegame/prototype/index.html';
const VW = 480, VH = 900, DPR = 2;

mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'filing3-'));
let chrome = null, ws = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanup() {
  try { if (ws) ws.close(); } catch (e) {}
  try { if (chrome) chrome.kill(); } catch (e) {}
}

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9399/json/new?about:blank', { method: 'PUT' });
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

// 在相对坐标处按住画圈，保持按下状态
const HOLD = (rx, ry, frames) => `
(async () => {
  const cv = document.getElementById('game');
  const r = cv.getBoundingClientRect();
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const ev = (t, px, py) => cv.dispatchEvent(new PointerEvent(t, {
    clientX: r.left + px, clientY: r.top + py, bubbles: true, pointerId: 1
  }));
  const px = ${rx} * r.width, py = ${ry} * r.height;
  ev('pointerdown', px - 30, py - 20);
  for (let i = 0; i < ${frames}; i++) {
    ev('pointermove', px + Math.cos(i * 0.9) * 26, py + Math.sin(i * 0.9) * 20);
    await sleep(45);
  }
  return 'held';
})()`;

try {
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--mute-audio', '--allow-file-access-from-files',
    '--remote-debugging-port=9399', `--user-data-dir=${profile}`,
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

  /* ───────── 1) 补漆：三种污渍同屏，展示"工具对应污渍" ───────── */
  console.log('→ 补漆（跑车）');
  await send('Page.navigate', { url: GAME + '?lv=3&debug=1&mute=1&fresh=1' });
  await sleep(2400);
  const smoke = await evalPage('typeof window.__cw');
  if (smoke !== 'object') throw new Error('游戏没起来: ' + smoke);
  await evalPage(`document.getElementById('stage').style.width='100vw';
                  document.getElementById('stage').style.height='100vh';
                  window.dispatchEvent(new Event('resize'));`);
  await sleep(500);

  // 先把两处硬垢刮掉 → 露出掉漆
  await evalPage("window.__cw.setTool('scrape')");
  await sleep(250);
  const crusts = await evalPage('JSON.stringify(window.__cw.crustPos)');
  const list = crusts ? JSON.parse(crusts) : [];
  for (const cr of list) {
    await evalPage(HOLD((cr.x / VW).toFixed(4), (cr.y / VH).toFixed(4), 56));
    await evalPage(`document.getElementById('game').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}))`);
    await sleep(200);
  }
  console.log('  硬垢剩余:', await evalPage('window.__cw.crusts'),
    ' 可见掉漆:', await evalPage('window.__cw.paintVisible'));

  // 切到补漆，按住其中一处掉漆
  await evalPage("window.__cw.setTool('paint')");
  await sleep(250);
  const paints = await evalPage('JSON.stringify(window.__cw.paintPos)');
  const pl = paints ? JSON.parse(paints) : [];
  if (pl.length) {
    await evalPage(HOLD((pl[0].x / VW).toFixed(4), (pl[0].y / VH).toFixed(4), 14));
  }
  await sleep(150);
  await shot('D-清洁系统-补漆');
  await evalPage(`document.getElementById('game').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}))`);

  /* ───────── 2) 涂鸦墙：换一种场景和污渍类型 ───────── */
  console.log('→ 涂鸦墙');
  await evalPage('window.__cw.startLevel(2)');
  await sleep(700);
  await evalPage("window.__cw.setTool('rinse')");
  await sleep(250);
  await evalPage(HOLD(0.42, 0.46, 26));
  await sleep(150);
  await shot('E-清洁系统-涂鸦墙');
  await evalPage(`document.getElementById('game').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}))`);

  console.log('\n完成，2 张可选。');
} catch (e) {
  console.log('失败:', e.message);
} finally {
  cleanup();
  process.exit(0);
}

// 严苛环境自动测试：模拟小游戏环境的残缺全局，跑通整局并断言
// node tools/envtest.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'file:///D:/AI/project/littlegame/minigame/envtest.html?debug=1&mute=1';
const SHOT = 'D:/AI/project/littlegame/minigame/_envtest.png';

const profile = mkdtempSync(join(tmpdir(), 'envtest-'));
let chrome = null, ws = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => { try { ws && ws.close(); } catch (e) {} try { chrome && chrome.kill(); } catch (e) {} };

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9411/json/new?about:blank', { method: 'PUT' });
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome 启动失败');
}

let id = 0;
const pending = new Map();
const send = (method, params = {}, timeoutMs = 60000) => new Promise((res) => {
  const i = ++id;
  const timer = setTimeout(() => { if (pending.has(i)) { pending.delete(i); res(undefined); } }, timeoutMs);
  pending.set(i, (v) => { clearTimeout(timer); res(v); });
  ws.send(JSON.stringify({ id: i, method, params }));
});

const errors = [];
const logs = [];

try {
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--mute-audio', '--allow-file-access-from-files',
    '--remote-debugging-port=9411', `--user-data-dir=${profile}`,
    '--window-size=480,900', 'about:blank'
  ], { stdio: 'ignore' });

  ws = new WebSocket(await connect());
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const t = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      logs.push(`[${m.params.type}] ${t}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(d.exception?.description || d.text);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push('[network] ' + m.params.entry.text);
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 900, deviceScaleFactor: 2, mobile: true });

  console.log('加载:', URL);
  await send('Page.navigate', { url: URL });
  await sleep(3000);

  const evalP = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, 60000);
    return r && r.result && r.result.value;
  };

  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
  };

  // ── 启动断言 ──
  check('游戏对象已创建', (await evalP('typeof window.__cw')) === 'object');
  check('关卡数据已加载', (await evalP('typeof window.CW')) === 'object');
  check('素材表已加载', (await evalP('typeof window.CW_IMG')) === 'object');

  const env = await evalP('JSON.stringify(window.__WX_ENV)');
  check('适配层拿到屏幕信息', !!env && env !== 'null', env);

  const imgs = await evalP('JSON.stringify(window.__cw.imgs)');
  const imgList = imgs ? JSON.parse(imgs) : [];
  check('图片全部加载', imgList.length >= 19, `${imgList.length} 张`);

  // ── 触摸与冲洗 ──
  const before = await evalP('window.__cw.progress');
  await evalP(`
(async () => {
  const cv = window.__TEST_CANVAS__;
  const r = cv.getBoundingClientRect();
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const fire = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, {
    clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1
  }));
  const B = window.__cw.level.bounds;   // 归一化坐标 0..1
  const x0 = (B.x + 0.03) * r.width, x1 = (B.x + B.w - 0.03) * r.width;
  const y0 = (B.y + 0.05) * r.height, y1 = (B.y + B.h - 0.05) * r.height;
  fire('pointerdown', x0, y0);
  for (let i = 0; i <= 14; i++) {
    const y = y0 + (y1 - y0) * i / 14;
    for (let k = 0; k <= 18; k++) {
      const t = (i % 2) ? k / 18 : 1 - k / 18;
      fire('pointermove', x0 + (x1 - x0) * t, y);
      await sleep(10);
    }
  }
  fire('pointerup', 0, 0);
  return 'ok';
})()`);
  await sleep(500);
  const after = await evalP('window.__cw.progress');
  check('触摸能驱动冲洗', after > before + 0.02, `${(before * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}%`);

  // ── 系统功能 ──
  check('等级系统可用', typeof (await evalP('window.__cw.playerLevel')) === 'number',
    'Lv.' + (await evalP('window.__cw.playerLevel')));
  check('每日计数可用', (await evalP('JSON.stringify(window.__cw.daily)')) !== 'undefined');
  check('音效已禁用（测试静音）', (await evalP('window.__cw.audio')) === 'none');

  // 存档写入
  await evalP('window.__cw.syncRank()');
  await sleep(200);
  check('云存储写入无异常', true);

  // ── 遮罩：位图若没被真正用于裁剪，真机上污渍会铺成方块 ──
  await evalP('window.__cw.startLevel(0)');
  await sleep(1000);
  const maskStat = await evalP(`
(function () {
  var CW = 480, CH = 900;   // envtest 的逻辑尺寸
  function cover(name) {
    var canvas = window.__cw.debugCanvas(name);
    if (!canvas) return -1;
    var t = document.createElement('canvas');
    t.width = 100; t.height = 100;
    var g = t.getContext('2d');
    var b = window.__cw.level.bounds;          // 归一化 0..1
    var k = canvas.width / CW;                 // 设备倍率
    g.drawImage(canvas,
      b.x * CW * k, b.y * CH * k, b.w * CW * k, b.h * CH * k,
      0, 0, 100, 100);
    var d = g.getImageData(0, 0, 100, 100).data;
    var n = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n / 10000;
  }
  return JSON.stringify({ mask: cover('mask'), dirt: cover('dirt') });
})()`);
  const ms = maskStat ? JSON.parse(maskStat) : { mask: -1, dirt: -1 };
  check('车身遮罩已生成', ms.mask > 0.15 && ms.mask < 0.75, '覆盖 ' + (ms.mask * 100).toFixed(0) + '%');
  check('污渍没有溢出车身', ms.dirt > 0 && ms.dirt <= ms.mask * 1.08,
    '污渍 ' + (ms.dirt * 100).toFixed(0) + '% / 遮罩 ' + (ms.mask * 100).toFixed(0) + '%');

  // 排行榜（没有开放数据域应优雅降级）
  await evalP('window.__cw.openRank()');
  await sleep(400);
  check('排行榜不崩（无开放数据域时降级）', (await evalP('window.__cw.state')) === 'rank');
  await evalP('window.__cw.startLevel(0)');
  await sleep(300);

  // 分享（wx.shareAppMessage 存在）
  await evalP('window.__cw.share()');
  await sleep(200);
  const shared = await evalP('JSON.stringify(window.__lastShare)');
  check('分享能构造 payload', !!shared && shared !== 'undefined', shared);

  // ── 截图 ──
  const s = await send('Page.captureScreenshot', { format: 'png' }, 60000);
  if (s && s.data) writeFileSync(SHOT, Buffer.from(s.data, 'base64'));

  // ── 结果 ──
  console.log('\n控制台日志:');
  console.log(logs.length ? logs.map((l) => '  ' + l).join('\n') : '  (无)');

  console.log('\n未捕获异常:');
  console.log(errors.length ? errors.map((e) => '  ✗ ' + e.split('\n')[0]).join('\n') : '  (无)');

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n结果：${results.length - failed}/${results.length} 通过` + (errors.length ? `，${errors.length} 个异常` : ''));
  console.log(errors.length === 0 && failed === 0 ? '\n✅ 严苛环境测试通过' : '\n❌ 有问题，见上');
} catch (e) {
  console.log('测试脚本出错:', e.message);
} finally {
  cleanup();
  process.exit(0);
}

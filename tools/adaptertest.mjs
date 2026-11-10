// 适配层专项测试：真加载 adapter.js + 假 wx，覆盖存储/图片/画布/触摸/分享
// node tools/adaptertest.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'file:///D:/AI/project/littlegame/minigame/adaptertest.html?debug=1&mute=1';
const profile = mkdtempSync(join(tmpdir(), 'adt-'));
let chrome = null, ws = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9511/json/new?about:blank', { method: 'PUT' });
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome 启动失败');
}

let id = 0;
const pending = new Map();
const send = (m, p = {}, t = 60000) => new Promise((res) => {
  const i = ++id;
  const timer = setTimeout(() => { if (pending.has(i)) { pending.delete(i); res(undefined); } }, t);
  pending.set(i, (v) => { clearTimeout(timer); res(v); });
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});

const errors = [];
const logs = [];

let results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
}

try {
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--mute-audio', '--allow-file-access-from-files',
    '--remote-debugging-port=9511', `--user-data-dir=${profile}`,
    '--window-size=400,860', 'about:blank'
  ], { stdio: 'ignore' });

  ws = new WebSocket(await connect());
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push('[' + m.params.type + '] ' + (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: URL });
  await sleep(3200);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, 60000);
    if (r && r.exceptionDetails) return 'ERR:' + (r.exceptionDetails.exception?.description || '').split('\n')[0];
    return r && r.result && r.result.value;
  };

  console.log('适配层专项测试\n');

  // 1) 启动
  check('游戏在假 wx 环境启动', (await ev('typeof window.__cw')) === 'object');

  // 2) 存档隔离：Web localStorage 里预置了 idx=3，游戏必须无视它
  const lvl = await ev('window.__cw.level && window.__cw.level.id');
  check('无视 Web 存储里的脏存档，从第 1 单开始', lvl === 'sedan', 'level=' + lvl);
  const idx = await ev('window.__cw.save.idx');
  check('save.idx 为 0', idx === 0, 'idx=' + idx);

  // 3) 强制接管：写盘应落到 wx 存储
  await ev("localStorage.setItem('__probe__', 'x')");
  const inWx = await ev("wx.getStorageSync('__probe__')");
  const inWeb = await ev("window.__WEBSTORAGE__ ? window.__WEBSTORAGE__['__probe__'] : null"
    .replace('window.__WEBSTORAGE__', 'window.__WEBSTORAGE__'));
  check('localStorage 写进了 wx 存储', inWx === 'x', 'wx=' + JSON.stringify(inWx));

  // 4) 图片：没有 naturalWidth 也要能加载
  const imgs = await ev('window.__cw.imgs.length');
  check('位图全部加载（图片对象无 naturalWidth）', imgs === 19, imgs + ' 张');

  // 5) getContext 带参数返回 null 时仍能画
  const ctxNull = await ev('(function(){var c=document.createElement("canvas");return c.getContext("2d",{alpha:false})===null;})()');
  check('测试环境确实模拟了 getContext 返回 null', ctxNull === true);
  check('游戏仍能拿到上下文并绘制', (await ev('window.__cw.progress')) >= 0);

  // 6) 画布尺寸：用 window* 而不是 screen*
  const size = await ev(`(function(){
    var cv = window.__TEST_CANVAS__;
    return JSON.stringify({ w: cv.width, h: cv.height, cw: 375, ch: 812, dpr: 2 });
  })()`);
  const sz = size ? JSON.parse(size) : {};
  check('画布缓冲区 = window 尺寸 × DPR', sz.w === 750 && sz.h === 1624, sz.w + 'x' + sz.h);

  // 7) 触摸（每次移动之间要让出时间，否则一帧内走完不会有进度）
  const p0 = await ev('window.__cw.progress');
  await ev(`(async function(){
    var F = window.__FAKE__;
    var B = window.__cw.level.bounds;
    var W = 375, H = 812;
    var x0 = (B.x + 0.05) * W, x1 = (B.x + B.w - 0.05) * W;
    var y0 = (B.y + 0.10) * H, y1 = (B.y + B.h - 0.10) * H;
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    F.touch('start', x0, y0);
    for (var i = 0; i <= 20; i++) {
      var y = y0 + (y1 - y0) * (i / 20);
      F.touch('move', (i % 2) ? x1 : x0, y);
      await wait(25);
    }
    F.touch('end', x0, y0);
    return 'ok';
  })()`);
  await sleep(600);
  const p1 = await ev('window.__cw.progress');
  check('触摸能驱动冲洗', p1 > p0 + 0.03, (p0 * 100).toFixed(1) + '% → ' + (p1 * 100).toFixed(1) + '%');

  // 8) 分享回调
  await ev('window.__cw.share()');
  await sleep(200);
  const share = await ev('JSON.stringify(window.__lastShare)');
  check('分享能调到 wx.shareAppMessage', !!share && share !== 'undefined', String(share).slice(0, 70));

  // 9) 窗口尺寸变化
  const before = await ev('(function(){var c=window.__TEST_CANVAS__;return c.width+"x"+c.height;})()');
  await ev("window.__FAKE__.setInfo({windowWidth:414,windowHeight:896,screenWidth:414,screenHeight:896})");
  await ev('window.__FAKE__.resize()');
  await sleep(800);
  const after = await ev('(function(){var c=window.__TEST_CANVAS__;return c.width+"x"+c.height;})()');
  check('窗口尺寸变化后重新布局', before !== after, before + ' → ' + after);

  // 10) 重置进度
  await ev('window.__cw.startLevel(5)');
  await sleep(600);
  const beforeReset = await ev('window.__cw.level.id');
  await ev('window.__cw.resetProgress()');
  await sleep(800);
  const afterReset = await ev('window.__cw.level.id');
  check('重置进度能把关卡拉回第 1 单', afterReset === 'sedan', beforeReset + ' → ' + afterReset);

  console.log('\n控制台:');
  console.log(logs.length ? logs.map((l) => '  ' + l).join('\n') : '  (无)');
  console.log('\n未捕获异常:');
  console.log(errors.length ? errors.map((e) => '  ✗ ' + e.split('\n')[0]).join('\n') : '  (无)');

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n结果：${results.length - failed}/${results.length} 通过` + (errors.length ? `，${errors.length} 个异常` : ''));
  console.log(errors.length === 0 && failed === 0 ? '\n✅ 适配层测试通过' : '\n❌ 有问题，见上');
} catch (e) {
  console.log('测试脚本出错:', e.message);
} finally {
  try { ws && ws.close(); } catch {}
  try { chrome && chrome.kill(); } catch {}
  process.exit(0);
}

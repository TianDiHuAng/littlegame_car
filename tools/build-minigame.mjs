// 构建微信小游戏包：node tools/build-minigame.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:/AI/project/littlegame';
const SRC = join(ROOT, 'prototype');
const OUT = join(ROOT, 'minigame');
const IMG_DIR = join(OUT, 'images');

// ---------- AppID：优先读 tools/appid.txt（构建不会删它），其次读旧的 project.config.json ----------
const APPID_FILE = join(ROOT, 'tools', 'appid.txt');
let prevAppid = 'touristappid';
let prevName = 'liangchejihua';

try {
  if (existsSync(APPID_FILE)) {
    const a = readFileSync(APPID_FILE, 'utf8').trim();
    if (/^wx[0-9a-f]{16}$/i.test(a)) prevAppid = a;
  }
} catch (e) {}

try {
  const prevPath = join(OUT, 'project.config.json');
  if (prevAppid === 'touristappid' && existsSync(prevPath)) {
    const prev = JSON.parse(readFileSync(prevPath, 'utf8'));
    if (prev.appid) prevAppid = prev.appid;
    if (prev.projectname) prevName = prev.projectname;
  }
} catch (e) {}

// ---------- 清理输出目录（保留 adapter.js 源文件） ----------
if (existsSync(OUT)) {
  for (const f of readdirSync(OUT)) {
    if (f === 'adapter.js' || f === 'README.md' || f === 'openDataContext') continue;
    rmSync(join(OUT, f), { recursive: true, force: true });
  }
}
mkdirSync(IMG_DIR, { recursive: true });

// ---------- 素材：改成文件路径，不用 base64 ----------
// 只打包游戏真正用到的（assets/ 里还有 raw_* 等中间产物，不能进包）
const NEEDED = [
  'bg_outdoor', 'bg_dawn', 'bg_dusk',
  'brick_wall', 'car_black', 'car_coupe', 'car_jeep', 'car_sedan', 'car_truck', 'car_van',
  'dirt_heavy', 'dirt_soft', 'fx_foam', 'fx_splash', 'grime_hard', 'hub',
  'paint_damage', 'vase', 'window'
];

const assetDir = join(SRC, 'assets');
function findAsset(key) {
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
    if (existsSync(join(assetDir, key + ext))) return key + ext;
  }
  return null;
}

const pics = [];
for (const k of NEEDED) {
  const f = findAsset(k);
  if (f) pics.push({ key: k, file: f });
  else console.warn('  ! 缺素材:', k);
}
if (!pics.length) throw new Error('prototype/assets 里找不到可用素材');

let assetJs = '/* 素材映射（构建生成） */\nwindow.CW_IMG = {\n';
let total = 0;
for (const p of pics) {
  copyFileSync(join(assetDir, p.file), join(IMG_DIR, p.file));
  total += readFileSync(join(assetDir, p.file)).length;
  assetJs += `  ${p.key}: "images/${p.file}",\n`;
}
assetJs += '};\n';

// 分享封面单独拷贝（游戏里按路径引用，不走素材表）
const coverSrc = join(SRC, 'assets', 'share_cover.jpg');
if (existsSync(coverSrc)) {
  copyFileSync(coverSrc, join(IMG_DIR, 'share_cover.jpg'));
  total += readFileSync(coverSrc).length;
}

// ---------- 游戏代码：只改图片加载 ----------
let game = readFileSync(join(SRC, 'game.js'), 'utf8').replace(/\r\n/g, '\n');

const r1 = game.replace('      var im = new Image();', '      var im = wx.createImage();');
if (r1 === game) throw new Error('没找到 loadImages 里的 new Image()');
game = r1;

// 注意：图片尺寸/就绪判断已在 prototype/game.js 里做成小游戏安全的实现
// （__ok 标记 + imgW/imgH 兼容 width），这里不再重复打补丁。

// ---------- 拼装入口 ----------
const adapter = readFileSync(join(OUT, 'adapter.js'), 'utf8');
const levels = readFileSync(join(SRC, 'levels.js'), 'utf8');

// 关键：小游戏全局里可能已存在残缺的 document（没有 getElementById），
// 所以把适配层造好的 document / window 作为参数注入，避免游戏解析到坏的那个。
const entry = `/* 亮车计划 · 微信小游戏入口（构建生成，不要手改） */
${adapter}

(function (document, window) {

${assetJs}

${levels}

${game}

})(GameGlobal.__DOC__, GameGlobal.__WIN__);
`;

writeFileSync(join(OUT, 'game.js'), entry, 'utf8');

// ---------- 配置 ----------
writeFileSync(join(OUT, 'game.json'), JSON.stringify({
  deviceOrientation: 'portrait',
  showStatusBar: false,
  openDataContext: 'openDataContext',
  networkTimeout: { request: 10000 }
}, null, 2) + '\n', 'utf8');

writeFileSync(join(OUT, 'project.config.json'), JSON.stringify({
  description: '亮车计划 · 解压洗车',
  appid: prevAppid,
  projectname: prevName,
  compileType: 'game',
  libVersion: 'latest',
  setting: {
    urlCheck: false,
    es6: true,
    enhance: true,
    minified: false,
    autoAudits: false,
    uploadWithSourceMap: false
  },
  packOptions: {
    ignore: [
      { type: 'file', value: 'preview.html' },
      { type: 'file', value: 'envtest.html' },
      { type: 'file', value: '_envtest.png' },
      { type: 'file', value: '_rank.png' }
    ],
    include: []
  }
}, null, 2) + '\n', 'utf8');


// ---------- 浏览器验证页（不进小游戏包） ----------
writeFileSync(join(OUT, 'preview.html'), `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>小游戏包预览 · 亮车计划</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #0e1520; }
  canvas { touch-action: none; display: block; }
</style>
</head>
<body>
  <!-- 用浏览器模拟 wx.*，直接跑 game.js，验证适配层 -->
  <script src="../tools/wx-shim.js"></script>
  <script src="./game.js"></script>
</body>
</html>
`, 'utf8');
// ---------- 严苛环境测试页（不进小游戏包） ----------
writeFileSync(join(OUT, 'envtest.html'), `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>严苛环境测试 · 亮车计划</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #0e1520; }
  canvas { touch-action: none; display: block; }
</style>
</head>
<body>
  <script>window.__HARSH__ = true;</script>
  <script src="../tools/wx-shim.js"></script>
  <script src="./game.js"></script>
</body>
</html>
`, 'utf8');

// ---------- 体检 ----------
const entrySize = readFileSync(join(OUT, 'game.js')).length;
const totalSize = entrySize + total;
console.log('构建完成 → minigame/');
console.log(`  game.js   ${(entrySize / 1024).toFixed(0)} KB`);
console.log(`  images/   ${pics.length} 张，${(total / 1024).toFixed(0)} KB`);
console.log(`  合计      ${(totalSize / 1024 / 1024).toFixed(2)} MB  （主包上限 4 MB）`);

// 粗查：入口里不该再有 DOM 专属调用
const suspicious = [
  ['document.body', /document\.body\s*\.\s*appendChild/],
  ['innerHTML', /\.innerHTML\s*=/],
  ['PointerEvent', /new PointerEvent/],
  ['fetch(', /[^.\w]fetch\s*\(/]
];
for (const [name, re] of suspicious) {
  if (re.test(entry)) console.log(`  ⚠ 入口里仍有 ${name}，需确认小游戏是否支持`);
}

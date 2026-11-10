// 把用到的素材打包进 prototype/assets.js（base64 data URI）
// node tools/make-assets.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DIR = 'D:/AI/project/littlegame/prototype/assets/';
const OUT = 'D:/AI/project/littlegame/prototype/assets.js';

// 只打包游戏真正用到的（assets/ 里还有 raw_* 等中间产物）
const NEEDED = [
  'bg_outdoor', 'bg_dawn', 'bg_dusk',
  'brick_wall', 'car_black', 'car_coupe', 'car_jeep', 'car_sedan', 'car_truck', 'car_van',
  'dirt_heavy', 'dirt_soft', 'fx_foam', 'fx_splash', 'grime_hard', 'hub',
  'paint_damage', 'vase', 'window'
];

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const files = [];
for (const k of NEEDED) {
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
    if (existsSync(DIR + k + ext)) { files.push({ key: k, file: k + ext, ext }); break; }
  }
}
if (!files.length) throw new Error('没有可用素材');

let out = '/* 自动生成，不要手改。重新生成：node tools/make-assets.mjs */\nwindow.CW_IMG = {\n';
let bytes = 0;
for (const f of files) {
  const b = readFileSync(DIR + f.file);
  bytes += b.length;
  out += `  ${f.key}: "data:${MIME[f.ext]};base64,${b.toString('base64')}",\n`;
}
out += '};\n';
writeFileSync(OUT, out, 'utf8');

console.log(`assets.js  ${(out.length / 1024).toFixed(0)} KB  （${files.length} 张，原始 ${(bytes / 1024).toFixed(0)} KB）`);
console.log(files.map((f) => f.file).join(', '));

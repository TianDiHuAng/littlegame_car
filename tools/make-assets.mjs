// 把 assets/*.webp 打包进 prototype/assets.js（base64 data URI）
// node tools/make-assets.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';

const DIR = 'D:/AI/project/littlegame/prototype/assets/';
const OUT = 'D:/AI/project/littlegame/prototype/assets.js';

const files = readdirSync(DIR).filter((f) => f.endsWith('.webp')).sort();
if (!files.length) throw new Error('没有 webp 素材');

let out = '/* 自动生成，不要手改。重新生成：node tools/make-assets.mjs */\nwindow.CW_IMG = {\n';
let bytes = 0;
for (const f of files) {
  const key = f.replace(/\.webp$/, '');
  const b = readFileSync(DIR + f);
  bytes += b.length;
  out += `  ${key}: "data:image/webp;base64,${b.toString('base64')}",\n`;
}
out += '};\n';
writeFileSync(OUT, out, 'utf8');

console.log(`assets.js  ${(out.length / 1024).toFixed(0)} KB  （${files.length} 张，原始 ${(bytes / 1024 / 1024).toFixed(2)} MB）`);
console.log(files.map((f) => f.replace(/\.webp$/, '')).join(', '));

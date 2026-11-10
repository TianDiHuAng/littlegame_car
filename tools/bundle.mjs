// 把 index.html 引用的脚本全部内联，产出单文件版：node tools/bundle.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'D:/AI/project/littlegame/prototype/';
let html = readFileSync(root + 'index.html', 'utf8');

const tags = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)];
if (!tags.length) throw new Error('没找到 script 标签，index.html 结构变了？');

for (const tag of tags) {
  const js = readFileSync(root + tag[1], 'utf8');
  html = html.replace(tag[0], () => '<script>\n' + js + '\n</script>');
}

writeFileSync(root + 'standalone.html', html);
console.log('written standalone.html', (html.length / 1024).toFixed(1) + ' KB, inlined:', tags.map((t) => t[1]).join(', '));

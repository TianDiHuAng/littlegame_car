// 设置小游戏 AppID：node tools/set-appid.mjs wx1234567890abcdef
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'D:/AI/project/littlegame/minigame/project.config.json';
const appid = (process.argv[2] || '').trim();

if (!appid) {
  const cur = JSON.parse(readFileSync(P, 'utf8'));
  console.log('当前 AppID:', cur.appid);
  console.log('用法: node tools/set-appid.mjs wx1234567890abcdef');
  process.exit(0);
}

if (!/^wx[0-9a-f]{16}$/i.test(appid)) {
  console.error('格式不对。小游戏 AppID 形如 wx1234567890abcdef（wx + 16 位十六进制）');
  console.error('你给的是:', appid);
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(P, 'utf8'));
const before = cfg.appid;
cfg.appid = appid;
writeFileSync(P, JSON.stringify(cfg, null, 2) + '\n', 'utf8');

console.log('✓ AppID 已更新');
console.log('  ' + before + '  →  ' + appid);
console.log('\n下一步：用微信开发者工具导入 minigame/ 目录，点「上传」');

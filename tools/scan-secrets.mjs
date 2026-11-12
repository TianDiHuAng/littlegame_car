import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:/AI/project/littlegame';
const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);

const TEXT_EXT = /\.(js|mjs|cjs|json|md|html|cmd|ps1|txt|yml|yaml|gitignore|gitattributes)$/i;

const PATTERNS = [
  { name: '微信 AppID', re: /wx[0-9a-f]{16}/gi, level: '公开' },
  { name: '疑似密钥/令牌', re: /(sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})/g, level: '高危' },
  { name: 'password 赋值', re: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]{3,}/gi, level: '高危' },
  { name: 'secret/token 赋值', re: /(secret|token|api[_-]?key)\s*[:=]\s*['"][^'"]{6,}/gi, level: '高危' },
  { name: '私钥内容', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, level: '高危' },
  { name: '邮箱', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, level: '个人信息' },
  { name: '中国大陆手机号', re: /(?<!\d)1[3-9]\d{9}(?!\d)/g, level: '个人信息' },
  { name: '身份证号', re: /(?<!\d)\d{17}[\dXx](?!\d)/g, level: '个人信息' },
  { name: 'Windows 用户目录', re: /C:\\Users\\[^\\\s"']+/g, level: '本机信息' },
  { name: '本机绝对路径', re: /D:\\AI\\project[^"'\s]*/g, level: '本机信息' },
  { name: '内网/本地地址', re: /(127\.0\.0\.1|localhost):\d+/g, level: '本机信息' }
];

const hits = {};
for (const f of files) {
  const p = join(ROOT, f);
  let st;
  try { st = statSync(p); } catch { continue; }
  if (!st.isFile() || st.size > 3 * 1024 * 1024) continue;
  if (!TEXT_EXT.test(f) && !/gitignore|gitattributes/.test(f)) continue;

  let txt;
  try { txt = readFileSync(p, 'utf8'); } catch { continue; }

  for (const pt of PATTERNS) {
    pt.re.lastIndex = 0;
    const m = txt.match(pt.re);
    if (!m) continue;
    for (const s of m.slice(0, 4)) {
      const key = pt.name + ' | ' + pt.level;
      (hits[key] ||= []).push({ file: f, sample: String(s).slice(0, 90) });
    }
  }
}

const order = ['高危', '个人信息', '本机信息', '公开'];
const keys = Object.keys(hits).sort((a, b) => {
  const la = order.findIndex((x) => a.includes(x));
  const lb = order.findIndex((x) => b.includes(x));
  return la - lb || a.localeCompare(b);
});

console.log('已跟踪文件数:', files.length);
console.log('扫描类型:', PATTERNS.map((p) => p.name).join(', '));
console.log('');

if (!keys.length) {
  console.log('没有发现任何匹配');
} else {
  for (const k of keys) {
    const list = hits[k];
    const uniq = new Map();
    for (const h of list) if (!uniq.has(h.file)) uniq.set(h.file, h.sample);
    console.log('【' + k + '】 命中 ' + uniq.size + ' 个文件');
    for (const [f, s] of [...uniq].slice(0, 8)) {
      console.log('   ' + f.padEnd(46) + ' 例: ' + s);
    }
    console.log('');
  }
}

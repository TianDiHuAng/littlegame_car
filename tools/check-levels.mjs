// 检查每一关的"要处理的任务"是否合理
import { readFileSync } from 'node:fs';

const src = readFileSync('D:/AI/project/littlegame/prototype/levels.js', 'utf8');
const sandbox = { window: { CW: {} } };
new Function('window', src)(sandbox.window);

const NS = sandbox.window.CW;
const L = NS.LEVELS;

const ART = {
  sedan: 'car_sedan', van: 'car_van', coupe: 'car_coupe',
  jeep: 'car_jeep', truck: 'car_truck', black: 'car_black',
  wall: 'brick_wall', vase: 'vase', window: 'window', hub: 'hub'
};

for (let i = 0; i < L.length; i++) {
  const lv = L[i];
  if (lv.fleet) {
    console.log(`${String(i + 1).padStart(2)}. ${lv.name.padEnd(10)} 组合单: ${lv.fleet.join(' + ')}`);
    continue;
  }
  const grease = (lv.grease || []).length;
  const paint = (lv.paint || []).length;
  const heavy = lv.heavy ? '有' : '—';
  const art = ART[lv.id] || (lv.art && lv.art.img) || '(区域变体)';
  console.log(
    `${String(i + 1).padStart(2)}. ${lv.id.padEnd(13)} ${lv.name.padEnd(8)} art=${String(art).padEnd(14)} 厚泥=${heavy} 硬垢=${grease} 漆损=${paint}`
  );
}

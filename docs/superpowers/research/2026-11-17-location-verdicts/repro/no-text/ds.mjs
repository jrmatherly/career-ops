import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2], 'utf8');
for (const m of html.matchAll(/AF_initDataCallback\(\{key: '(ds:\d)', hash: '[^']*', data:([\s\S]*?), sideChannel: \{\}\}\);<\/script>/g)) {
  let d; try { d = JSON.parse(m[2]); } catch (e) { console.log(m[1], 'parse fail', e.message, m[2].slice(0, 200)); continue; }
  console.log(m[1], 'len', m[2].length, 'top', Array.isArray(d) ? d.length : typeof d);
  const show = (x, depth = 0, path = '') => { if (depth > 3) return; if (Array.isArray(x)) { console.log(' '.repeat(depth*2) + path + ` [${x.length}]`); x.slice(0, 20).forEach((y, i) => show(y, depth + 1, `${path}[${i}]`)); } else console.log(' '.repeat(depth*2) + path + ' = ' + JSON.stringify(x)?.slice(0, 100)); };
  show(d);
}

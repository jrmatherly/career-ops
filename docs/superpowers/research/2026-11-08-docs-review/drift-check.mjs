// drift-check.mjs: does docs/SUPPORTED_JOB_BOARDS.md still match providers/?
// Run from anywhere: node docs/superpowers/research/2026-11-08-docs-review/drift-check.mjs <repo-root>
// Lists providers with no explicit mention in either board doc and provider names
// that match no row name. A provider named only by a display name shows up in the
// fuzzy list and must be checked by hand (2026-11-08: all six had rows).
import fs from 'node:fs';
const R = process.argv[2] ?? process.cwd();
const provs=fs.readdirSync(R+'/providers').filter(f=>f.endsWith('.mjs')&&!f.startsWith('_')&&!f.includes('.test.')).map(f=>f.replace('.mjs',''));
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
function rows(file){return fs.readFileSync(R+'/'+file,'utf8').split('\n').filter(l=>/^\| /.test(l)&&!/^\| ---/.test(l)&&!/^\| (Board|Source)/.test(l));}
const sjb=rows('docs/SUPPORTED_JOB_BOARDS.md');
const sil=rows('docs/SOURCE_INDEXING_LOG.md');
console.log('providers',provs.length,'SJB rows',sjb.length,'SIL rows',sil.length);
// map each provider: does the doc row mention `provider: X` or providers/X.mjs
for(const [name,rs] of [['SJB',sjb],['SIL',sil]]){
  const text=rs.join('\n');
  const miss=provs.filter(p=>!new RegExp('provider: ?'+p.replace('-','[-]?')+'\\b|providers/'+p+'\\.mjs|`'+p+'`','i').test(text));
  console.log(name,'providers w/o explicit mention:',miss.join(' '));
}
// SJB: row names normalized vs provider names
const names=sjb.map(l=>l.split('|')[1].trim());
const nn=names.map(norm);
const unm=provs.filter(p=>!nn.some(n=>n.includes(norm(p))||norm(p).includes(n)));
console.log('SJB provider names not matching any row name (fuzzy, verify by hand):',unm.join(' '));
console.log('SJB row names list:',names.join(' ; '));

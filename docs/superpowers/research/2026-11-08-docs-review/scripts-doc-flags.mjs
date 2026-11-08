// scripts-doc-flags.mjs: docs/SCRIPTS.md against the scripts it documents.
// Run from the repo root: node docs/superpowers/research/2026-11-08-docs-review/scripts-doc-flags.mjs
// Reports documented scripts that do not exist, root scripts the doc never names,
// npm run names on either side only, and for each documented read-only script the
// --help flags the doc never mentions. Scripts that write are skipped by name
// (SKIP) and read in source instead. CAREER_OPS_ROOT points at a path that does
// not exist, so a --help run can never touch a data root.
import fs from 'node:fs'; import path from 'node:path'; import {execFileSync} from 'node:child_process';
const R=process.cwd(); const doc=fs.readFileSync('docs/SCRIPTS.md','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')).scripts||{};
const names=new Set(); for(const m of doc.matchAll(/[A-Za-z0-9_./-]+\.(?:mjs|sh|ps1|js)\b/g)) names.add(m[0].replace(/^\.\//,''));
const exists=n=>fs.existsSync(n)||['web/scripts/','publish/','lib/','batch/','dashboard/','scripts/','providers/','web/'].some(p=>fs.existsSync(p+n));
const missing=[...names].filter(n=>!exists(n)&&!n.includes('*')); console.log('## documented-but-missing (',missing.length,')\n'+missing.join('\n'));
const root=fs.readdirSync('.').filter(f=>f.endsWith('.mjs')); const undoc=root.filter(f=>!doc.includes(f)); console.log('\n## root scripts never mentioned (',undoc.length,'/',root.length,')\n'+undoc.join('\n'));
for(const d of ['web/scripts','publish','lib']){const fs2=fs.readdirSync(d).filter(f=>/\.(mjs|sh|ps1)$/.test(f)); console.log('\n## '+d+' not mentioned:',fs2.filter(f=>!doc.includes(f)).join(' ')||'(none)');}
const npm=[...doc.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map(m=>m[1]); console.log('\n## npm run names in doc missing from package.json:',[...new Set(npm)].filter(n=>!pkg[n]).join(' ')||'(none)');
const docNpm=new Set(npm); console.log('## package.json scripts never in doc:',Object.keys(pkg).filter(k=>!docNpm.has(k)).join(' '));
const SKIP=/set-status|merge-tracker|outcome|onboard-write|update-system|archive-posting|add-entry|remember-cli|followup-seed|reserve-report-num|fix-report-links|normalize-statuses|dedup-tracker|import-tracker|hired-share|assessment-log|paste-reply|resume|install|uninstall|generate-pdf|generate-latex|scan|check-liveness|browser|test-all|doctor|plugin|github|batch|web|server|share|apply|discover|migrate|sync|cron|schedule/;
console.log('\n## --help diff (read-only, skip-list applied)');
for(const f of root.filter(f=>doc.includes(f)&&!SKIP.test(f))){
  let out=''; try{out=execFileSync('node',[f,'--help'],{timeout:8000,stdio:['ignore','pipe','pipe'],env:{...process.env,CAREER_OPS_ROOT:'/nonexistent-lever'}}).toString();}catch(e){out=(e.stdout||'')+(e.stderr||'');}
  const flags=new Set([...out.matchAll(/(?<![\w-])--[a-z][a-z0-9-]+/g)].map(m=>m[0])); if(!flags.size) {console.log(f,': no flags in --help output (',out.slice(0,60).replace(/\n/g,' '),')');continue;}
  // doc section for f
  const sect=doc; // whole-doc check: conservative (a flag mentioned anywhere counts)
  const miss=[...flags].filter(x=>!sect.includes(x)); console.log(f,': help flags',flags.size,'; not mentioned ANYWHERE in doc:',miss.join(' ')||'-');
}

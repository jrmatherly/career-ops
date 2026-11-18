// Fetch boards through the repo's real providers so job objects match what scan.mjs passes as `offer`.
import { writeFileSync } from 'node:fs';
const R = '../../../../../../providers/';
const { makeHttpCtx } = await import(R + '_http.mjs');
const prov = { ashby: (await import(R + 'ashby.mjs')).default, greenhouse: (await import(R + 'greenhouse.mjs')).default, lever: (await import(R + 'lever.mjs')).default };
const boards = {
  ashby: ['1password','zapier','supabase','temporal','sierra','hackerone','deepgram','perplexity','langchain','resend','clerk','workos','pinecone','semgrep','inngest','runpod','cohere','elevenlabs','decagon','attio'],
  greenhouse: ['vercel','anthropic','planetscale','airtable','coreweave','gleanwork','intercom','hightouch','dialpad','huntress','chainguard','bugcrowd','wizinc','abnormalsecurity','praetorian'],
  lever: ['spotify','palantir','wandb','sophos','coalfire','tinybird'],
};
const url = { ashby: s => `https://jobs.ashbyhq.com/${s}`, greenhouse: s => `https://job-boards.greenhouse.io/${s}`, lever: s => `https://jobs.lever.co/${s}` };
const ctx = makeHttpCtx();
const out = process.argv[2];
await Promise.all(Object.entries(boards).flatMap(([p, slugs]) => slugs.map(async s => {
  try {
    const jobs = await prov[p].fetch({ name: s, careers_url: url[p](s) }, ctx);
    writeFileSync(`${out}/${p}-${s}.json`, JSON.stringify(jobs));
    console.log(p, s, jobs.length, jobs.filter(j => j.description).length);
  } catch (e) { console.log(p, s, 'ERR', e.message.slice(0, 120)); }
})));

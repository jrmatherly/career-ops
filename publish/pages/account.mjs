import { esc } from '../pages.mjs';

// Token values copied from web/src/app/globals.css (:root, .dark and @theme).
// The CSP admits inline styles only, so they cannot be linked; publish/tests/service.test.mjs fails when the two drift.
const STYLE = `:root{--bg:#f7f6f3;--surface:#ffffff;--border:hsl(40 9% 86%);--fg:hsl(30 10% 11%);--muted:hsl(35 9% 34%);--brand-text:hsl(26 80% 36%);--color-brand:hsl(26 73% 51%);--color-brand-foreground:hsl(24 30% 12%);color-scheme:light}
@media (prefers-color-scheme: dark){:root{--bg:#0a0a0a;--surface:#161616;--border:#262626;--fg:#fafafa;--muted:#a1a1aa;--brand-text:hsl(26 73% 51%);color-scheme:dark}}
body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;background:var(--bg);color:var(--fg);line-height:1.5}
a{color:var(--brand-text)}p,th{color:var(--muted)}
table{width:100%;border-collapse:collapse;margin-bottom:1rem}th,td{text-align:left;padding:.4rem;border-bottom:1px solid var(--border)}
pre,input{background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:.5rem}
pre{padding:.75rem;white-space:pre-wrap;word-break:break-all}input{padding:.35rem .5rem;max-width:100%}
button{background:var(--color-brand);color:var(--color-brand-foreground);border:0;border-radius:.5rem;padding:.4rem .8rem;font:inherit;cursor:pointer}`;

const shell = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Publish account</title><style>${STYLE}</style><body>${body}</body>`;

export const signInPage = (message = '') => shell(`<h1>Publish account</h1>${message ? `<p role="alert">${esc(message)}</p>` : ''}
<p><a href="/account/sign-in">Sign in with Pocket ID</a></p>`);

const day = (at) => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
};

const keyRow = (k) => `<tr><td>${esc(k.name ?? '')}</td><td><code>${esc(k.start ?? k.prefix ?? '')}…</code></td><td>${esc(day(k.createdAt))}</td>
<td><form method="post" action="/account/keys/revoke"><input type="hidden" name="keyId" value="${esc(k.id)}"><button>Revoke</button></form></td></tr>`;

export function accountPage({ email, keys, created = null, message = '' }) {
  const shown = created
    ? `<p role="status">New key, shown once:</p><pre>${esc(created)}</pre>
<p>On a cluster install, add this line to the <code>[career_ops]</code> block of <code>cluster.toml</code>:</p><pre>publish_api_key = "${esc(created)}"</pre>
<p>On a local install, put it in the data root's <code>.env</code> as <code>PUBLISH_API_KEY</code>.</p>`
    : '';
  return shell(`<h1>Publish account</h1><p>Signed in as ${esc(email)}.</p>${message ? `<p role="alert">${esc(message)}</p>` : ''}${shown}
<h2>API keys</h2>${keys.length ? `<table><tr><th>Name</th><th>Starts</th><th>Created</th><th></th></tr>${keys.map(keyRow).join('')}</table>` : '<p>No keys yet.</p>'}
<form method="post" action="/account/keys"><label>Name <input name="name" required maxlength="32"></label> <button>Create key</button></form>
<p>A key can upload, read stats and feedback, mint feedback links and delete shares. Creating one needs a sign-in from the last 24 hours.</p>`);
}

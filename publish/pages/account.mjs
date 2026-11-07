import { esc } from '../pages.mjs';

const shell = (body) => `<!doctype html><meta charset="utf-8"><title>Publish account</title><body style="font-family:sans-serif;max-width:40rem;margin:3rem auto">${body}</body>`;

export const signInPage = (message = '') => shell(`<h1>Publish account</h1>${message ? `<p role="alert">${esc(message)}</p>` : ''}
<p><a href="/account/sign-in">Sign in with Pocket ID</a></p>`);

const keyRow = (k) => `<tr><td>${esc(k.name ?? '')}</td><td><code>${esc(k.start ?? k.prefix ?? '')}…</code></td><td>${esc(new Date(k.createdAt).toISOString().slice(0, 10))}</td>
<td><form method="post" action="/account/keys/revoke"><input type="hidden" name="keyId" value="${esc(k.id)}"><button>Revoke</button></form></td></tr>`;

export function accountPage({ email, keys, created = null, message = '' }) {
  const shown = created
    ? `<p role="status">New key, shown once. Put it in the data root's <code>.env</code> as <code>PUBLISH_API_KEY</code>:</p><pre>${esc(created)}</pre>`
    : '';
  return shell(`<h1>Publish account</h1><p>Signed in as ${esc(email)}.</p>${message ? `<p role="alert">${esc(message)}</p>` : ''}${shown}
<h2>API keys</h2>${keys.length ? `<table><tr><th>Name</th><th>Starts</th><th>Created</th><th></th></tr>${keys.map(keyRow).join('')}</table>` : '<p>No keys yet.</p>'}
<form method="post" action="/account/keys"><label>Name <input name="name" required maxlength="32"></label> <button>Create key</button></form>
<p>A key can upload, read stats and feedback, mint feedback links and delete shares. Creating one needs a sign-in from the last 24 hours.</p>`);
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const passwordForm = (message = '') => `<!doctype html><meta charset="utf-8"><title>Protected CV</title><body style="font-family:sans-serif;max-width:22rem;margin:4rem auto">
<form method="post"><label>Password <input type="password" name="password" autofocus required></label> <button>View</button>${message ? `<p role="alert">${esc(message)}</p>` : ''}</form></body>`;

const commentForm = (token) => `<form method="post" action="/f/${esc(token)}" style="font-family:sans-serif;max-width:40rem;margin:2rem auto;border-top:1px solid #ccc;padding-top:1rem">
<label>Name <input name="authorName" required maxlength="80"></label><br><label>Comment<br><textarea name="body" required maxlength="4000" rows="4" cols="60"></textarea></label><br><button>Send feedback</button></form>`;

export function feedbackPage(snapshotHtml, token) {
  const form = commentForm(token);
  const out = snapshotHtml.replace(/<\/body>/i, `${form}</body>`);
  return out === snapshotHtml ? snapshotHtml + form : out;
}

export function hideContacts(html) {
  return html
    .replace(/<div class="contact-row">[\s\S]*?<\/div>/g, '')
    .replace(/<a\b[^>]*href="(?:mailto|tel):[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');
}

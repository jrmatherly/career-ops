const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
// Whitespace, comments and one doctype: the only things that can precede the meta
// without making an element. The comment pattern ends where the parser does
// (<!-->, <!--->, --!>), so an early close cannot hide markup from it.
const LEADING_DOCTYPE = /^(?:[\t\n\f\r ]|<!--(?!-?>)(?:(?!--!?>)[\s\S])*--!?>)*<!doctype[^>]*>/i;

/**
 * The page with a CSP of its own. The preview is shown as an iframe srcdoc, and a
 * srcdoc document takes its parent's policy, not the headers of the response it
 * was fetched from, so the policy has to travel inside the page. It goes ahead of
 * all of the page's markup, after a leading doctype only, so the parser puts it in
 * the head it creates and nothing in the page can enclose it or come before it.
 * @param {string} html
 */
export function withPreviewCsp(html) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  const at = LEADING_DOCTYPE.exec(html)?.[0].length ?? 0;
  return html.slice(0, at) + meta + html.slice(at);
}

const FIT = `.job-header, .edu-header, .contact-row, .cert-table, .award-table { min-width: 0; max-width: 100%; }
.job-header, .edu-header { flex-wrap: wrap; }
.job-company, .edu-title, .project-title, .skill-category { min-width: 0; overflow-wrap: anywhere; }
.job-period, .edu-year { flex-shrink: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.contact-row > * { max-width: 100%; min-width: 0; }
.summary-text, li { overflow-wrap: anywhere; }
a { white-space: normal; overflow-wrap: anywhere; }
.cert-org, .cert-year, .award-org, .award-year { white-space: normal; overflow-wrap: anywhere; }`;

const TAG = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z](?:[^>=]|=\s*"[^"]*"|=\s*'[^']*'|=(?!\s*["']))*>/y;
const RAW = /^(?:title|textarea|option|svg|math|xmp|plaintext|noembed|noframes|iframe|noscript)$/;

function renderInline(text) {
  return text
    .replace(/\*\*([^*]+?)\*\*/g, (_, inner) => `<strong>${inner}</strong>`)
    .replace(/(?<![\p{L}\p{N}_/\\])_(?=[^_\s])([^_\n]*?[^_\s])_(?![\p{L}\p{N}_/\\])/gu, (_, inner) => `<em>${inner}</em>`);
}

function mapText(html) {
  const masks = [];
  const masked = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (match) => {
    const token = `\u0000MASK${masks.length}\u0000`;
    masks.push(match);
    return token;
  });
  let plainUntil = null;
  let out = "";
  let i = 0;
  while (i < masked.length) {
    const lt = masked.indexOf("<", i);
    if (lt === -1) {
      out += plainUntil ? masked.slice(i) : renderInline(masked.slice(i));
      break;
    }
    out += plainUntil ? masked.slice(i, lt) : renderInline(masked.slice(i, lt));
    TAG.lastIndex = lt;
    const gt = TAG.test(masked) ? TAG.lastIndex - 1 : masked.indexOf(">", lt);
    if (gt === -1) {
      out += masked.slice(lt);
      break;
    }
    const tag = masked.slice(lt, gt + 1);
    const name = /^<\/?([A-Za-z][\w:-]*)/.exec(tag)?.[1].toLowerCase();
    if (plainUntil && (plainUntil === "option" || (tag[1] === "/" && name === plainUntil))) plainUntil = null;
    if (!plainUntil && tag[1] !== "/" && !tag.endsWith("/>") && RAW.test(name || "")) plainUntil = name;
    out += tag;
    i = gt + 1;
  }
  return out.replace(/\u0000MASK(\d+)\u0000/g, (_, n) => masks[Number(n)]);
}

function injectFit(html) {
  const tag = `<style data-cv-preview-fit>${FIT}</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tag}</head>`);
  return tag + html;
}

export function previewHtml(html) {
  return withPreviewCsp(injectFit(mapText(String(html ?? ""))));
}

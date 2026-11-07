import http from 'node:http';
import { scrypt, randomBytes, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { openDb } from './db.mjs';
import { passwordForm, feedbackPage, hideContacts } from './pages.mjs';

const scryptAsync = promisify(scrypt);
const SLUG = '([a-z0-9-]{1,64})';
const TOKEN = '([A-Za-z0-9_~-]{10,400})';
const route = (p) => new RegExp(`^${p}$`);
const BASE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const PAGE_HEADERS = {
  ...BASE_HEADERS,
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};
const CRAWLER = /bot|crawl|spider|slurp|facebookexternalhit|linkedinbot|embedly|preview/i;
const ATTEMPTS = 5;
const WINDOW_MS = 10 * 60e3;
const COOKIE_MS = 10 * 60e3;

export function readConfig(env) {
  const required = (key) => {
    const value = (env[key] ?? '').trim();
    if (!value) throw new Error(`${key} is required and must not be empty`);
    return value;
  };
  const port = Number(env.PUBLISH_PORT || 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PUBLISH_PORT must be an integer 0-65535, got ${env.PUBLISH_PORT}`);
  return {
    bind: env.PUBLISH_BIND || '127.0.0.1',
    port,
    ownerToken: required('PUBLISH_OWNER_TOKEN'),
    secret: required('PUBLISH_SECRET'),
    dbPath: env.PUBLISH_DB || 'publish.db',
    clientIpHeader: (env.PUBLISH_CLIENT_IP_HEADER || 'cf-connecting-ip').toLowerCase(),
    trustedProxies: new Set((env.PUBLISH_TRUSTED_PROXIES || '').split(',').map((s) => s.trim()).filter(Boolean)),
  };
}

// An IPv6 host usually owns a whole /64, so rotating inside it must not reset the limiter or add views.
function ipv6Prefix(ip) {
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  return [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t].slice(0, 4).map((g) => g.padStart(4, '0')).join(':') + '::/64';
}

// The header is only as honest as the hop that set it, so it is read only from a known proxy peer.
export function clientKey(req, config) {
  const peer = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const forwarded = config.trustedProxies.has(peer) && String(req.headers[config.clientIpHeader] ?? '').split(',')[0].trim();
  const ip = forwarded || peer;
  return ip.includes(':') ? ipv6Prefix(ip) : ip;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) return Promise.reject(new HttpError(413, 'Payload too large'));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { req.removeAllListeners('data'); req.resume(); reject(new HttpError(413, 'Payload too large')); } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const send = (res, status, body, headers) => { res.writeHead(status, { 'Content-Length': Buffer.byteLength(body), ...headers }); res.end(body); };
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { ...BASE_HEADERS, 'Content-Type': 'application/json' });
const page = (res, status, html, extra) => send(res, status, html, { ...PAGE_HEADERS, ...extra });
const plain = (res, status, text, extra) => page(res, status, text, { 'Content-Type': 'text/plain; charset=utf-8', ...extra });

const sha256 = (s) => createHash('sha256').update(s).digest();
const safeEqual = (a, b) => timingSafeEqual(sha256(a), sha256(b));

async function hashPassword(password) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await scryptAsync(password, salt, 32)).toString('hex')}`;
}

async function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(await scryptAsync(password, Buffer.from(salt, 'hex'), 32), Buffer.from(hash, 'hex'));
}

const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
  const i = p.indexOf('=');
  return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
}));

export function createServer(config) {
  const db = openDb(config.dbPath);
  // Unknown slugs and unprotected shares still pay one scrypt, so a miss costs what a hit costs.
  const dummyHash = hashPassword(randomBytes(16).toString('hex'));
  const attempts = new Map();
  const sign = (s) => createHmac('sha256', config.secret).update(s).digest('base64url');
  const isOwner = (req) => safeEqual(req.headers.authorization || '', `Bearer ${config.ownerToken}`);
  const accessValue = (slug, pwHash, exp) => `${exp}.${sign(`${slug}|${pwHash}|${exp}`)}`;

  function hasAccess(req, share) {
    const value = parseCookies(req.headers.cookie)[`s_${share.slug}`];
    if (!value) return false;
    const exp = value.split('.')[0];
    return Number(exp) > Date.now() && safeEqual(value, accessValue(share.slug, share.pw_hash, exp));
  }

  function makeToken(share) {
    const id = Buffer.from(`${share.slug}|${share.epoch}|${share.html_sha}|${randomBytes(6).toString('hex')}`).toString('base64url');
    return `${id}~${sign(`fb|${id}`)}`;
  }

  function resolveToken(token) {
    const [id, mac, ...rest] = token.split('~');
    if (!id || !mac || rest.length || !safeEqual(mac, sign(`fb|${id}`))) return null;
    const parts = Buffer.from(id, 'base64url').toString('utf8').split('|');
    if (parts.length !== 4) return null;
    const [slug, epoch, sha, linkId] = parts;
    if (db.getShare(slug)?.epoch !== epoch) return null;
    const html = db.getSnapshot(slug, sha);
    return html === undefined ? null : { slug, sha, linkId, html };
  }

  function retryAfter(key) {
    const now = Date.now();
    if (attempts.size > 10000) {
      for (const [k, list] of attempts) if (list.every((t) => now - t >= WINDOW_MS)) attempts.delete(k);
    }
    const recent = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
    const blocked = recent.length >= ATTEMPTS;
    if (!blocked) recent.push(now);
    attempts.set(key, recent);
    return blocked ? Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)) : 0;
  }

  const owner = (handler) => (req, res, m) => (isOwner(req) ? handler(req, res, m) : json(res, 401, { error: 'owner token required' }));
  const withShare = (handler) => owner((req, res, m) => {
    const share = db.getShare(m[1]);
    return share ? handler(req, res, share) : json(res, 404, { error: 'no such share' });
  });

  const routes = [
    { method: 'PUT', pattern: route(`/api/shares/${SLUG}`), handler: owner(async (req, res, m) => {
      const text = await readBody(req, 4 << 20);
      let payload;
      try { payload = JSON.parse(text); } catch { throw new HttpError(400, 'Body must be JSON'); }
      const { html: raw, password, hideContacts: hide } = payload ?? {};
      if (typeof raw !== 'string' || !raw) return json(res, 400, { error: 'html required' });
      if (password != null && typeof password !== 'string') return json(res, 400, { error: 'password must be a string' });
      const html = hide === true ? hideContacts(raw) : raw;
      const sha = sha256(html).toString('hex');
      db.publish(m[1], sha, html, password ? await hashPassword(password) : null, hide === true);
      return json(res, 200, { slug: m[1], sha, url: `/s/${m[1]}` });
    }) },
    { method: 'GET', pattern: route(`/api/shares/${SLUG}/stats`), handler: withShare((req, res, s) => json(res, 200, {
      slug: s.slug, views: s.views, hasPassword: !!s.pw_hash, hideContacts: !!s.hide_contacts, sha: s.html_sha, updated: s.updated,
    })) },
    { method: 'POST', pattern: route(`/api/shares/${SLUG}/feedback-links`), handler: withShare((req, res, s) => json(res, 200, { token: makeToken(s) })) },
    { method: 'GET', pattern: route(`/api/shares/${SLUG}/feedback`), handler: withShare((req, res, s) => json(res, 200, db.listComments(s.slug))) },
    { method: 'DELETE', pattern: route(`/api/shares/${SLUG}`), handler: owner((req, res, m) => (db.deleteShare(m[1])
      ? json(res, 200, { deleted: m[1] })
      : json(res, 404, { error: 'no such share' }))) },
    { method: 'GET', pattern: route(`/s/${SLUG}`), handler: (req, res, m) => {
      const share = db.getShare(m[1]);
      if (!share) return page(res, 401, passwordForm());
      const owned = isOwner(req);
      if (share.pw_hash && !owned && !hasAccess(req, share)) return page(res, 401, passwordForm());
      if (!owned && !CRAWLER.test(req.headers['user-agent'] || '')) db.recordView(share.slug, clientKey(req, config), Math.floor(Date.now() / 3600e3));
      return page(res, 200, db.getSnapshot(share.slug, share.html_sha));
    } },
    { method: 'POST', pattern: route(`/s/${SLUG}`), handler: async (req, res, m) => {
      const wait = retryAfter(clientKey(req, config));
      if (wait) return plain(res, 429, 'Too many attempts', { 'Retry-After': String(wait) });
      const password = new URLSearchParams(await readBody(req, 4096)).get('password') || '';
      const share = db.getShare(m[1]);
      const ok = await checkPassword(password, share?.pw_hash || await dummyHash) && share?.pw_hash;
      if (!ok) return page(res, 401, passwordForm('Wrong password'));
      const exp = Date.now() + COOKIE_MS;
      return page(res, 303, '', { Location: `/s/${share.slug}`,
        'Set-Cookie': `s_${share.slug}=${accessValue(share.slug, share.pw_hash, exp)}; Path=/s/${share.slug}; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MS / 1000}` });
    } },
    { method: 'GET', pattern: route(`/f/${TOKEN}`), handler: (req, res, m) => {
      const snapshot = resolveToken(m[1]);
      return snapshot ? page(res, 200, feedbackPage(snapshot.html, m[1])) : plain(res, 404, 'Not found');
    } },
    { method: 'POST', pattern: route(`/f/${TOKEN}`), handler: async (req, res, m) => {
      const snapshot = resolveToken(m[1]);
      if (!snapshot) return plain(res, 404, 'Not found');
      const form = new URLSearchParams(await readBody(req, 16384));
      const author = (form.get('authorName') || '').trim();
      const body = (form.get('body') || '').trim();
      if (!author || !body || author.length > 80 || body.length > 4000) return plain(res, 400, 'authorName (max 80) and body (max 4000) are required');
      db.addComment(snapshot.slug, snapshot.linkId, author, body);
      return page(res, 303, '', { Location: `/f/${m[1]}` });
    } },
  ];

  const server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://local');
      for (const r of routes) {
        const m = r.method === req.method && pathname.match(r.pattern);
        if (m) return await r.handler(req, res, m);
      }
      plain(res, 404, 'Not found');
    } catch (e) {
      if (res.headersSent) return res.destroy();
      if (e instanceof HttpError) return plain(res, e.status, e.message, e.status === 413 ? { Connection: 'close' } : {});
      console.error(e);
      plain(res, 500, 'Internal error');
    }
  });
  server.on('close', () => db.close());
  return server;
}

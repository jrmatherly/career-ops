import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { apiKey } from '@better-auth/api-key';

export const PROVIDER_ID = 'pocket-id';
const KEY_PREFIX = 'cops_';
const KEY_LENGTH = 64;
// The plugin's default generator draws KEY_LENGTH letters; anything else is not a key and is refused before a lookup.
export const KEY_SHAPE = new RegExp(`^${KEY_PREFIX}[A-Za-z]{${KEY_LENGTH}}$`);

// One normalisation for every allow-list check: sign-in here, and each key and session use in server.mjs.
export function emailAllowList(allowedEmails) {
  const allowed = new Set(allowedEmails.map((e) => e.toLowerCase()));
  return (email) => allowed.has(String(email ?? '').toLowerCase());
}

function authOptions({ db, baseURL, secret, pocketId, allowedEmails, clientIpHeader = 'cf-connecting-ip' }) {
  // Better Auth's node:sqlite dialect reads StatementSync.columns(), added in Node 22.16 and 23.11.
  if (typeof db.prepare('SELECT 1').columns !== 'function') throw new Error(`publish needs Node 22.16+ or 23.11+ for Better Auth's node:sqlite dialect; this is ${process.version}`);
  const isAllowed = emailAllowList(allowedEmails);
  return {
    database: db,
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    telemetry: { enabled: false },
    // Keys are made only by the account page, which sets their permissions and checks the session's age; over HTTP these would skip both.
    disabledPaths: ['/api-key/create', '/api-key/update'],
    // Key creation on the account page needs a sign-in younger than this.
    session: { freshAge: 24 * 3600 },
    // Cookie state, so an anonymous /account/sign-in writes no verification row.
    account: { encryptOAuthTokens: true, storeStateStrategy: 'cookie' },
    rateLimit: { enabled: true, storage: 'database' },
    // server.mjs overwrites this header with the address it resolved, so a client cannot hand Better Auth's limiter a spoofed one.
    advanced: { ipAddress: { ipAddressHeaders: [clientIpHeader] } },
    user: {
      // Runs on create-user, link-account and every OAuth sign-in with the provider's fresh claims; an unverified email could be anyone's.
      validateUserInfo: ({ user }) => (user.emailVerified === true && isAllowed(user.email) ? undefined : { error: 'email not allowed' }),
    },
    plugins: [
      genericOAuth({
        config: [{ providerId: PROVIDER_ID, ...pocketId, scopes: ['openid', 'email', 'profile'] }],
      }),
      apiKey({
        defaultPrefix: KEY_PREFIX,
        defaultKeyLength: KEY_LENGTH,
        enableSessionForAPIKeys: false,
        rateLimit: { enabled: true, maxRequests: 1000, timeWindow: 3600e3 },
      }),
    ],
  };
}

export const createAuth = (config) => betterAuth(authOptions(config));

export async function migrate(auth) {
  await (await getMigrations(auth.options)).runMigrations();
}

export function requiredEnv(env, key) {
  const value = (env[key] ?? '').trim();
  if (!value) throw new Error(`${key} is required and must not be empty`);
  return value;
}

export function authConfigFromEnv(env) {
  const required = (key) => requiredEnv(env, key);
  const allowedEmails = required('PUBLISH_ALLOWED_EMAILS').split(',').map((e) => e.trim()).filter(Boolean);
  return {
    baseURL: required('PUBLISH_BASE_URL').replace(/\/+$/, ''),
    secret: required('PUBLISH_AUTH_SECRET'),
    pocketId: { clientId: required('POCKET_ID_CLIENT_ID'), clientSecret: required('POCKET_ID_CLIENT_SECRET'), discoveryUrl: required('POCKET_ID_DISCOVERY_URL') },
    allowedEmails,
  };
}

// `npx auth migrate --config publish/auth.mjs --yes` reads `auth.options`; the getter keeps importing this file free of side effects.
let cliOptions;
export const auth = {
  get options() {
    return (cliOptions ??= authOptions({ ...authConfigFromEnv(process.env), db: new DatabaseSync(process.env.PUBLISH_DB || 'publish.db') }));
  },
};

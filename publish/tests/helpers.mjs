import { createHmac } from 'node:crypto';

// Pocket ID is never contacted in these suites: discovery fails fast against a closed port and only sign-in needs it.
export const AUTH_ENV = {
  PUBLISH_SECRET: 'test-secret',
  PUBLISH_BASE_URL: 'http://127.0.0.1:1',
  PUBLISH_AUTH_SECRET: 'test-auth-secret-that-is-long-enough-0123456789',
  PUBLISH_ALLOWED_EMAILS: 'ada@example.com',
  POCKET_ID_CLIENT_ID: 'test-client',
  POCKET_ID_CLIENT_SECRET: 'test-client-secret',
  POCKET_ID_DISCOVERY_URL: 'http://127.0.0.1:1/.well-known/openid-configuration',
};

export async function makeUser(server, email = 'ada@example.com') {
  const ctx = await server.auth.$context;
  const now = new Date();
  return ctx.adapter.create({ model: 'user', data: { email, name: 'Ada Example', emailVerified: true, createdAt: now, updatedAt: now } });
}

export async function makeKey(server, userId, share) {
  return (await server.auth.api.createApiKey({ body: { userId, name: 'test', permissions: { share } } })).key;
}

export const ownerKey = async (server) => makeKey(server, (await makeUser(server)).id, ['upload', 'manage']);

// The cookie Better Auth would set after a sign-in, for a session created ageMs ago.
export async function sessionCookie(server, userId, ageMs = 0) {
  const ctx = await server.auth.$context;
  const session = await ctx.internalAdapter.createSession(userId);
  if (ageMs) await ctx.adapter.update({ model: 'session', where: [{ field: 'id', value: session.id }], update: { createdAt: new Date(Date.now() - ageMs) } });
  const sig = createHmac('sha256', ctx.secret).update(session.token).digest('base64');
  return `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${sig}`)}`;
}

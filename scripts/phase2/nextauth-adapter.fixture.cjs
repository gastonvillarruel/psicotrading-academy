/* eslint @typescript-eslint/no-require-imports: "off" */
// Isolated integration child: only request context and server-only marker are stubbed.
// NextAuth getServerSession, JWT verification, application callbacks and PostgreSQL are real.
require('tsx/cjs');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const { requireRunner, verifyDatabase } = require('../phase1/guard.ts');

async function main() {
  assert.equal(process.env.SNIPERS_PHASE2_LOCAL, '1');
  assert.equal(process.env.SNIPERS_ENABLED, 'true');
  const profile = requireRunner();
  assert.equal(profile.SNIPERS_ENABLED, 'false');
  assert.equal(process.env.ENABLE_SINGLE_SESSION, 'true');
  verifyDatabase(profile);
  const [userId, activeSessionId, membershipId] = process.argv.slice(2);
  for (const value of [userId, activeSessionId, membershipId]) assert.match(value, /^[a-f0-9-]{36}$/);
  let cookie = '';
  const load = Module._load;
  Module._load = function(request, ...args) {
    if (request === 'server-only') return {};
    if (request === 'next/headers') return {
      headers: async () => new Map([['host', 'localhost:3000'], ['x-forwarded-proto', 'http']]),
      cookies: async () => ({ getAll: () => cookie ? [{ name: 'next-auth.session-token', value: cookie }] : [] }),
    };
    return load.call(this, request, ...args);
  };
  let db; let pool;
  try {
    const { encode } = require('next-auth/jwt');
    const { getServerSession } = require('next-auth');
    const { authOptions } = require('../../src/lib/auth.ts');
    ({ db, pool } = require('../../src/lib/db.ts'));
    const { actorFromSession } = require('../../src/lib/snipers/session.ts');
    const { snipers, requireSnipersPermission } = require('../../src/lib/snipers/server.ts');
    const secret = process.env.NEXTAUTH_SECRET;
    const claims = { id: userId, activeSessionId, role: 'STUDENT', emailVerified: null };
    cookie = await encode({ token: claims, secret });
    const session = await getServerSession(authOptions);
    assert.equal(session.user.id, userId);
    assert.equal(Object.hasOwn(session, 'expires'), false, 'El adaptador de un argumento debe eliminar expires.');
    assert.equal(actorFromSession(session, 'true').userId, userId);
    await requireSnipersPermission('SNIPERS_MEMBERSHIP_MANAGER');
    assert.equal((await snipers.getCommercialMembership(membershipId)).id, membershipId);

    const invalidCookies = [
      await encode({ token: claims, secret, maxAge: -60 }),
      await encode({ token: claims, secret: 'unrelated-test-key'.repeat(3) }),
      await encode({ token: { ...claims, activeSessionId: randomUUID() }, secret }),
      '',
    ];
    let denied = 0;
    for (const invalid of invalidCookies) {
      cookie = invalid;
      const invalidSession = await getServerSession(authOptions);
      assert.ok(!invalidSession?.user?.id || invalidSession.error);
      assert.throws(() => actorFromSession(invalidSession, 'true'), e => e.code === 'SESSION');
      await assert.rejects(requireSnipersPermission('SNIPERS_MEMBERSHIP_MANAGER'), e => e.code === 'SESSION');
      await assert.rejects(snipers.getCommercialMembership(membershipId), e => e.code === 'SESSION');
      denied++;
    }
    console.log(JSON.stringify({ validWithoutExpires: true, phase1PermissionAccepted: true, commercialFacadeAccepted: true, denied }));
  } finally {
    Module._load = load;
    if (db) await db.$disconnect();
    if (pool) await pool.end();
  }
}
main().catch(error => { console.error(error.name, error.message); process.exitCode = 1; });

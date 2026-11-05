import test from 'node:test';
import assert from 'node:assert/strict';
import { hkdfSync, randomUUID } from 'node:crypto';
import { encode, decode } from 'next-auth/jwt';
import { addDays, splitCents, paymentSchema, parse, type CoverageTerms } from '../../src/lib/snipers/contracts';
import { canonical, previewKey, signPreview, verifyPreview } from '../../src/lib/snipers/preview';
import { actorFromSession } from '../../src/lib/snipers/session';

test('centavos: distribución exacta, importes mínimos y límites', () => {
  for (const n of [1, 2, 3]) for (const amount of [1, 2, 3, 4, 7, 3000, 2147483647]) {
    const pieces = splitCents(amount, n);
    assert.equal(pieces.length, n); assert.equal(pieces.reduce((a, b) => a + b), amount);
    assert.ok(pieces.every(p => Number.isInteger(p) && p >= 0));
    assert.ok(pieces.every((p, i) => i === 0 || pieces[i - 1] >= p));
    assert.ok(Math.max(...pieces) - Math.min(...pieces) <= 1);
  }
  assert.deepEqual(splitCents(1, 3), [1, 0, 0]); assert.deepEqual(splitCents(2, 3), [1, 1, 0]);
  assert.deepEqual(splitCents(4, 3), [2, 1, 1]);
  for (const bad of [0, -1, 1.5, NaN, Infinity, 2147483648, '1']) assert.throws(() => splitCents(bad as number, 3));
  for (const bad of [0, 4, 1.5]) assert.throws(() => splitCents(1, bad));
});

test('duraciones exactas, UTC, fin de mes y desbordamiento', () => {
  for (const start of ['2026-01-31T23:00:00.000Z', '2026-03-07T06:30:00.000Z']) for (const days of [30, 60, 90]) {
    assert.equal(Date.parse(addDays(start, days)) - Date.parse(start), days * 86400000);
  }
  assert.throws(() => addDays('2026-01-01T00:00:00.000Z', 2147483647));
});

test('contratos rechazan campos adicionales, coerciones y fechas ambiguas', () => {
  const command = { operationId: randomUUID(), membershipId: randomUUID(), expectedVersion: 1, periods: 1,
    receivedCents: 3000, method: ' cash ', paidAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(parse(paymentSchema, command).method, 'cash');
  for (const change of [{ actorId: randomUUID() }, { periods: '1' }, { receivedCents: 0 }, { paidAt: '2026-01-01' }]) {
    assert.throws(() => parse(paymentSchema, { ...command, ...change }));
  }
});

test('previsualización: HKDF por propósito, alteración, actor, comando y secreto', () => {
  const secret = 'a'.repeat(48); const key = previewKey(secret);
  assert.equal(key.length, 32); assert.notDeepEqual(key, Buffer.from(secret).subarray(0, 32));
  assert.notDeepEqual(key, Buffer.from(hkdfSync('sha256', secret, 'psicoemotrading/snipers', 'another-purpose', 32)));
  assert.notDeepEqual(key, previewKey('b'.repeat(48)));
  for (const bad of [undefined, '', 'short', ' a'.repeat(32), 'a'.repeat(32) + '\n']) assert.throws(() => previewKey(bad));
  const terms: CoverageTerms = { planId: randomUUID(), planVersion: 1, planName: 'Nivel', unitPriceCents: 3000,
    unitDurationDays: 30, active: true, startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-31T00:00:00.000Z',
    listTotalCents: 3000, allocatedCents: [3000], previewedAt: '2026-01-01T00:00:00.000Z' };
  const command = { operationId: randomUUID(), reference: 'PRIVATE_REFERENCE', reason: 'PRIVATE_REASON' };
  const token = signPreview(key, 'private-user-id', command, terms);
  const publicPayload = Buffer.from(token.split('.')[0], 'base64url').toString();
  for (const privateValue of [secret, 'private-user-id', 'PRIVATE_REFERENCE', 'PRIVATE_REASON']) assert.ok(!publicPayload.includes(privateValue));
  assert.deepEqual(verifyPreview(key, 'private-user-id', command, token), terms);
  const altered = Buffer.from(JSON.stringify({ ...JSON.parse(publicPayload), terms: { ...terms, unitPriceCents: 1 } })).toString('base64url') + '.' + token.split('.')[1];
  for (const run of [() => verifyPreview(key, 'private-user-id', command, altered),
    () => verifyPreview(key, 'other', command, token), () => verifyPreview(key, 'private-user-id', { ...command, reason: 'other' }, token),
    () => verifyPreview(previewKey('b'.repeat(48)), 'private-user-id', command, token), () => verifyPreview(key, 'private-user-id', command, 'x')]) assert.throws(run);
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
});

test('sesión: JWT NextAuth real, caducidad, errores y configuración incierta', async () => {
  const secret = 'c'.repeat(48);
  const token = await encode({ token: { id: 'user', activeSessionId: 'session', role: 'STUDENT', emailVerified: null }, secret });
  assert.equal((await decode({ token, secret }))?.id, 'user');
  await assert.rejects(decode({ token, secret: 'different' }));
  await assert.rejects(decode({ token: await encode({ token: { id: 'user', role: 'STUDENT', emailVerified: null }, secret, maxAge: -60 }), secret }));
  const session = { user: { id: 'user', activeSessionId: 'session' }, expires: new Date(Date.now() + 60000).toISOString() };
  assert.equal(actorFromSession(session, 'true').activeSessionId, 'session');
  assert.equal(actorFromSession({ user: session.user }, 'true').activeSessionId, 'session');
  assert.equal(actorFromSession({ ...session, user: { id: 'user' } }, 'false').singleSession, false);
  for (const bad of [null, { ...session, error: 'SessionExpired' }, { ...session, expires: 'bad' },
    { ...session, expires: '2020-01-01T00:00:00.000Z' }, { ...session, user: { id: 'user' } }]) assert.throws(() => actorFromSession(bad, 'true'));
  assert.throws(() => actorFromSession(session, 'unknown'));
});

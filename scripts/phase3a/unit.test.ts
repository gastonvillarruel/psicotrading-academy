import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { amountCents, inputInstant, localInput, date } from '../../src/lib/snipers/presentation';
import { readIntent, saveIntent, clearIntent, type PendingIntent } from '../../src/lib/snipers/pending-intent';
import { respond } from '../../src/lib/snipers/action-result';
import { SnipersError } from '../../src/lib/snipers/errors';
import { connect } from 'node:net';
import { connect as secureConnect } from 'node:tls';

class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
test('3A: preloader bloquea TCP/TLS externos antes de conectar', () => {
  assert.equal(process.env.SNIPERS_PHASE3A_LOCAL, '1');
  assert.throws(() => connect({ host: 'external.invalid', port: 443 }), /external connection rejected/);
  assert.throws(() => secureConnect({ host: 'external.invalid', port: 443 }), /external connection rejected/);
  assert.throws(() => connect(443, 'external.invalid'), /external connection rejected/);
  assert.throws(() => secureConnect(443, { host: 'external.invalid' }), /external connection rejected/);
});
test('3A: importes de pantalla conservan centavos y rechazan ambigüedad', () => {
  assert.equal(amountCents('0,01'), 1); assert.equal(amountCents('40.25'), 4025);
  for (const v of ['0', '-1', '1.999', '1e3', '1,000.00', 'Infinity', '99999999']) assert.throws(() => amountCents(v));
});
test('3A: edición de fechas conserva la frontera exacta de cobertura', () => {
  const value = '2026-10-28T01:23:45.678Z';
  assert.equal(inputInstant(localInput(value)), value);
  assert.equal(inputInstant('2026-10-27T22:23'), '2026-10-28T01:23:00.000Z');
  assert.throws(() => inputInstant('invalid'));
  const earlyMinute = '2026-10-28T00:02:03.004Z';
  assert.equal(localInput(earlyMinute), '2026-10-27T21:02:03.004');
  assert.equal(inputInstant(localInput(earlyMinute)), earlyMinute);
  assert.equal(date(earlyMinute), '27/10/2026 21:02');
});
test('3A: recuperación aislada por identidad/membresía y sin campos adicionales', () => {
  const storage = new MemoryStorage(); const owner = randomUUID(); const membership = randomUUID();
  const value: PendingIntent = { owner, createdAt: Date.now(), kind: 'state', command: { operationId: randomUUID(), membershipId: membership, expectedVersion: 1, status: 'SUSPENDED', reason: 'Sintético' } };
  saveIntent(storage, value); assert.deepEqual(readIntent(storage, owner, membership), value);
  assert.equal(readIntent(storage, owner, randomUUID()), null);
  clearIntent(storage, owner, membership); assert.equal(storage.length, 0);
  saveIntent(storage, value); assert.equal(readIntent(storage, randomUUID(), membership), null); assert.equal(storage.length, 0);
  saveIntent(storage, value); const k = storage.key(0)!; storage.setItem(k, JSON.stringify({ ...value, secret: 'forbidden' }));
  assert.equal(readIntent(storage, owner, membership), null); assert.equal(storage.length, 0);
  saveIntent(storage, value); assert.equal(readIntent(storage, owner, membership, value.createdAt + 86400001), null);
});
test('3A: respuestas no exponen errores SQL ni secretos', async () => {
  const denied = await respond(async () => { throw new SnipersError('FORBIDDEN', 'private detail'); });
  assert.equal(denied.ok, false); assert.ok(!JSON.stringify(denied).includes('private detail'));
  const failure = await respond(async () => { throw new Error('postgres://private:password@remote'); });
  assert.ok(!JSON.stringify(failure).includes('postgres')); assert.equal(failure.ok, false);
});

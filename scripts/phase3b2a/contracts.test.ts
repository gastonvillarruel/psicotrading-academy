import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { completionManifest, fileAuditSchema, fileDeclaration, foundationCommand, retirementObservation } from '../../src/lib/snipers/file-contracts';

test('declaración estricta: límites binarios, MIME, enteros y campos extra', () => {
  for (const [type, mimeType, max] of [['MP3', 'audio/mpeg', 262144000], ['PDF', 'application/pdf', 26214400]] as const) {
    assert.ok(fileDeclaration.safeParse({ type, mimeType, sizeBytes: max }).success);
    for (const sizeBytes of [0, -1, 1.5, max + 1, '10']) assert.equal(fileDeclaration.safeParse({ type, mimeType, sizeBytes }).success, false);
    assert.equal(fileDeclaration.safeParse({ type, mimeType: 'text/html', sizeBytes: 10 }).success, false);
    assert.equal(fileDeclaration.safeParse({ type, mimeType, sizeBytes: 10, actorId: randomUUID() }).success, false);
  }
});
test('manifiesto ordenado, limitado y sin atributos arbitrarios', () => {
  assert.ok(completionManifest.safeParse([{ partNumber: 1, etag: '"opaque"' }]).success);
  for (const parts of [[], [{ partNumber: 2, etag: 'x' }], [{ partNumber: 1, etag: 'x' }, { partNumber: 1, etag: 'x' }], [{ partNumber: 1, etag: 'x\n' }], [{ partNumber: 1, etag: 'x', key: 'private' }]]) assert.equal(completionManifest.safeParse(parts).success, false);
});
test('ETag rechaza controles C0/C1 y DEL que PostgreSQL clasifica como cntrl', () => {
  for (const code of [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => i + 127)]) {
    assert.equal(completionManifest.safeParse([{ partNumber: 1, etag: `x${String.fromCharCode(code)}y` }]).success, false, `control ${code}`);
  }
});
test('auditoría estricta permite sólo recibos de fundación y sin secretos', () => {
  const command = { operationId: randomUUID(), resourceId: randomUUID(), objectId: null, kind: 'INVENTORY_RECORDED' };
  assert.ok(foundationCommand.safeParse(command).success);
  const payload = { formatVersion: 1, commandHash: 'a'.repeat(64), result: { ...command, changed: true } };
  assert.ok(fileAuditSchema.safeParse(payload).success);
  for (const key of ['url', 'leaseToken', 'multipartUploadId', 'secret']) assert.equal(fileAuditSchema.safeParse({ ...payload, [key]: 'forbidden' }).success, false);
  assert.equal(foundationCommand.safeParse({ ...command, kind: 'PUBLISH' }).success, false);
});
test('ausencia observada no elimina retiro; horizonte de limpieza coherente', () => {
  const row = { objectId: randomUUID(), retiredAt: '2026-10-30T12:00:00.000Z', cleanupAfter: '2026-11-06T12:00:00.000Z', nextProbeAt: '2026-11-06T12:00:00.000Z', lastAbsentAt: null, cleanupState: 'PENDING' };
  assert.ok(retirementObservation.safeParse(row).success);
  assert.equal(retirementObservation.safeParse({ ...row, cleanupState: 'QUIESCENT' }).success, false);
  assert.equal(retirementObservation.safeParse({ ...row, nextProbeAt: row.retiredAt }).success, false);
});

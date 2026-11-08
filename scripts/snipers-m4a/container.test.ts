import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { inspectContainer } from './inspect-container';
import { checkM4aFormat } from '../../src/lib/snipers/m4a-validation';
import { ValidationFailure } from '../../src/lib/snipers/file-validation';

const fixture = readFileSync('scripts/snipers-m4a/fixtures/sfx.m4a');
const c2paId = Buffer.from('d8fec3d61b0e483c92975828877ec481', 'hex');
function box(type: string, payload = Buffer.alloc(0), extended = false) {
  const header = Buffer.alloc(extended ? 16 : 8);
  header.writeUInt32BE(extended ? 1 : header.length + payload.length); header.write(type, 4, 'latin1');
  if (extended) header.writeBigUInt64BE(BigInt(header.length + payload.length), 8);
  return Buffer.concat([header, payload]);
}
async function local(bytes: Buffer, work: (file: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'snipers-container-'));
  const file = path.join(dir, 'PRIVATE_LOCAL_NAME.m4a');
  try {
    await writeFile(file, bytes); await work(file);
    assert.deepEqual(await readFile(file), bytes, 'Inspection must not modify the input');
  } finally { await rm(dir, { recursive: true, force: true }); }
}

function withC2pa(bytes = fixture, extension = box('uuid', Buffer.concat([c2paId, Buffer.alloc(4), Buffer.from('manifest\0'), Buffer.alloc(8), Buffer.from('opaque test store') ]))) {
  const top = new Map<string, { offset: number; bytes: Buffer }>();
  for (let offset = 0; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    top.set(bytes.toString('ascii', offset + 4, offset + 8), { offset, bytes: Buffer.from(bytes.subarray(offset, offset + size)) });
    offset += size;
  }
  const ftyp = top.get('ftyp')!, free = top.get('free')!, moov = top.get('moov')!, mdat = top.get('mdat')!;
  const delta = ftyp.bytes.length + extension.length + free.bytes.length + moov.bytes.length - mdat.offset;
  const offsets = moov.bytes.indexOf('stco'); assert.ok(offsets >= 0);
  const count = moov.bytes.readUInt32BE(offsets + 8);
  for (let i = 0; i < count; i++) {
    const at = offsets + 12 + i * 4; moov.bytes.writeUInt32BE(moov.bytes.readUInt32BE(at) + delta, at);
  }
  return Buffer.concat([ftyp.bytes, extension, free.bytes, moov.bytes, mdat.bytes]);
}

test('original top-level layout with C2PA metadata passes only when the AAC-LC and sample tables remain valid', async () => {
  await local(withC2pa(), async file => {
    const result = await inspectContainer(file);
    assert.deepEqual(result.topLevelBoxes, ['ftyp','uuid','free','moov','mdat']);
    assert.deepEqual(result.uuidUserTypes, ['d8fec3d6-1b0e-483c-9297-5828877ec481']);
    assert.deepEqual(result.unsupportedTopLevelBoxes, []);
    await checkM4aFormat(file, new AbortController().signal);
    const command = spawnSync(process.execPath, ['--import','tsx','scripts/snipers-m4a/inspect-container.ts',file], { encoding: 'utf8', windowsHide: true });
    assert.equal(command.status, 0); assert.deepEqual(JSON.parse(command.stdout).formatCheck, { result: 'ACCEPTED', validatorLines: [] });
  });
  for (const [from, to] of [['mp4a','enca'],['mp4a','alac'],['soun','vide']]) {
    const invalid = Buffer.from(fixture); invalid.write(to, invalid.indexOf(from));
    await local(withC2pa(invalid), async file => {
      await assert.rejects(checkM4aFormat(file, new AbortController().signal), e => e instanceof ValidationFailure && e.code === 'UNSUPPORTED_M4A');
    });
  }
  const broken = withC2pa(); broken.writeUInt32BE(broken.length + 1, broken.indexOf('stco') + 12);
  for (const invalid of [broken, withC2pa().subarray(0,-1), Buffer.concat([withC2pa(), box('moof')])]) {
    await local(invalid, async file => { await assert.rejects(checkM4aFormat(file, new AbortController().signal), ValidationFailure); });
  }
});

test('C2PA exception supports bounded extended headers and rejects unknown/protection UUIDs, truncated headers and version/flags changes', async () => {
  const payload = Buffer.concat([c2paId, Buffer.alloc(4), Buffer.from('manifest\0'), Buffer.alloc(8)]);
  await local(withC2pa(fixture, box('uuid', payload, true)), async file => {
    await checkM4aFormat(file, new AbortController().signal);
  });
  const version = Buffer.from(payload); version[16] = 1;
  const flags = Buffer.from(payload); flags[19] = 1;
  const piff = Buffer.from(payload); Buffer.from('d08a4f1810f34a82b6c832d8aba183d3', 'hex').copy(piff);
  const unknown = Buffer.from(payload); unknown.fill(0, 0, 16);
  for (const invalid of [box('uuid', version), box('uuid', flags), box('uuid', piff), box('uuid', unknown), box('uuid', payload.subarray(0,19))]) {
    await local(withC2pa(fixture, invalid), async file => {
      await assert.rejects(checkM4aFormat(file, new AbortController().signal), ValidationFailure);
    });
  }
});

test('container diagnostic lists reference brands and boxes; the full validator still checks the file', async () => {
  await local(fixture, async file => {
    const result = await inspectContainer(file);
    assert.deepEqual(result.unsupportedTopLevelBoxes, []);
    assert.ok(result.topLevelBoxes.includes('ftyp')); assert.ok(result.topLevelBoxes.includes('mdat')); assert.ok(result.topLevelBoxes.includes('moov'));
    assert.equal(result.brands.length, 1); assert.ok(result.brands[0].majorBrand.length === 4);
    await checkM4aFormat(file, new AbortController().signal);
  });
});

test('top-level rejection is reproduced and diagnosed without disclosing box payloads', async () => {
  const types = ['uuid','udta','meta','sidx','pssh','moof'];
  const secret = Buffer.from('PRIVATE_CONTENT_MUST_NOT_APPEAR');
  const xmp = Buffer.from('be7acfcb97a942e89c71999491e3afac', 'hex');
  await local(Buffer.concat([fixture, ...types.map(type => box(type, type === 'uuid' ? Buffer.concat([xmp, secret]) : secret))]), async file => {
    const result = await inspectContainer(file);
    assert.deepEqual(result.unsupportedTopLevelBoxes, types);
    assert.deepEqual(result.uuidUserTypes, ['be7acfcb-97a9-42e8-9c71-999491e3afac']);
    await assert.rejects(checkM4aFormat(file, new AbortController().signal), e => e instanceof ValidationFailure && e.code === 'UNSUPPORTED_M4A');
    const command = spawnSync(process.execPath, ['--import','tsx','scripts/snipers-m4a/inspect-container.ts',file], { encoding: 'utf8', windowsHide: true });
    assert.equal(command.status, 0);
    const {formatCheck, ...diagnostic} = JSON.parse(command.stdout);
    assert.deepEqual(diagnostic, result); assert.equal(formatCheck.result, 'UNSUPPORTED_M4A');
    assert.ok(!command.stdout.includes(secret.toString())); assert.ok(!command.stdout.includes(file)); assert.equal(command.stderr, '');
  });
});

test('a clean top-level diagnostic never bypasses encryption rejection in the validator', async () => {
  const encrypted = Buffer.from(fixture); encrypted.write('enca', encrypted.indexOf('mp4a'));
  await local(encrypted, async file => {
    assert.deepEqual((await inspectContainer(file)).unsupportedTopLevelBoxes, []);
    await assert.rejects(checkM4aFormat(file, new AbortController().signal), e => e instanceof ValidationFailure && e.code === 'UNSUPPORTED_M4A');
  });
});

test('container diagnostic handles extended and end-of-file boxes without reading their payloads into its output', async () => {
  const end = box('uuid', Buffer.alloc(16)); end.writeUInt32BE(0);
  await local(Buffer.concat([fixture, box('free', Buffer.from('PRIVATE'), true), end]), async file => {
    const result = await inspectContainer(file);
    assert.deepEqual(result.topLevelBoxes.slice(-2), ['free','uuid']); assert.deepEqual(result.unsupportedTopLevelBoxes, ['uuid']);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  });
});

test('container diagnostic bounds malformed headers, oversized metadata and box counts; CLI errors omit paths', async () => {
  const wide = box('free', Buffer.alloc(0), true); wide.writeBigUInt64BE(BigInt('0xffffffffffffffff'), 8);
  for (const bytes of [fixture.subarray(0,-1), wide, box('ftyp', Buffer.alloc(1028)),
    Buffer.concat([fixture, ...Array.from({length:10001}, () => box('free'))])]) {
    await local(bytes, async file => {
      await assert.rejects(inspectContainer(file), { message: 'INVALID_CONTAINER' });
    });
  }
  const missing = path.join(os.tmpdir(), 'PRIVATE_MISSING_CONTAINER_NAME.m4a');
  const command = spawnSync(process.execPath, ['--import','tsx','scripts/snipers-m4a/inspect-container.ts',missing], { encoding: 'utf8', windowsHide: true });
  assert.equal(command.status, 1); assert.equal(command.stdout, '');
  assert.deepEqual(JSON.parse(command.stderr), { error: 'LOCAL_CONTAINER_INSPECTION_FAILED' });
});

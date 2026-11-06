import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { checkBasicFormat } from '../../src/lib/snipers/basic-file-validation';
import { inspectBytes, ValidationFailure } from '../../src/lib/snipers/file-validation';
import { browserDeclaration } from '../../src/lib/snipers/upload-client';
import { fileDeclaration } from '../../src/lib/snipers/file-contracts';
import { downloadDisposition } from '../../src/lib/snipers/upload-storage';

const fixture = readFileSync('scripts/snipers-m4a/fixtures/sfx.m4a');
const signal = () => new AbortController().signal;
const mutate = (change: (b: Buffer) => void) => { const bytes = Buffer.from(fixture); change(bytes); return bytes; };
const at = (b: Buffer, name: string) => { const i = b.indexOf(name); assert.ok(i > 0); return i; };
const config = (b: Buffer) => { const i = b.indexOf(Buffer.from([5,128,128,128,2,0x12,8])); assert.ok(i > 0); return i + 5; };

const cases: Array<[string, Buffer, boolean]> = [
  ['real mono AAC-LC with a stereo sample-entry header', fixture, true],
  ['fake extension/container', Buffer.from('not an MP4'), false],
  ['truncated container', fixture.subarray(0, -1), false],
  ['invalid extended box size', mutate(b => { b.writeUInt32BE(1); b.writeBigUInt64BE(BigInt('0xffffffffffffffff'), 8); }), false],
  ['ALAC sample entry', mutate(b => b.write('alac', at(b, 'mp4a'))), false],
  ['encrypted sample entry', mutate(b => b.write('enca', at(b, 'mp4a'))), false],
  ['video renamed as M4A', mutate(b => b.write('vide', at(b, 'soun'))), false],
  ['HE-AAC object type', mutate(b => { const i = config(b); b[i] = (5 << 3) | (b[i] & 7); }), false],
  ['AAC Main object type', mutate(b => { const i = config(b); b[i] = (1 << 3) | (b[i] & 7); }), false],
  ['unsupported audio object indication', mutate(b => { const i = at(b, 'esds'); const oti = b.indexOf(Buffer.from([0x40,0x15]), i); b[oti] = 0x6b; }), false],
  ['external media reference', mutate(b => b.writeUInt32BE(0, at(b, 'url ') + 4)), false],
  ['sample count mismatch', mutate(b => b.writeUInt32BE(9999, at(b, 'stsz') + 12)), false],
  ['chunk points outside media', mutate(b => b.writeUInt32BE(b.length + 1, at(b, 'stco') + 12)), false],
  ['zero sample length', mutate(b => b.writeUInt32BE(0, at(b, 'stsz') + 16)), false],
  ['invalid descriptor length', mutate(b => { b[at(b, 'esds') + 9] = 0xff; }), false],
  ['fragmented MP4', Buffer.concat([fixture, Buffer.from([0,0,0,8,0x6d,0x6f,0x6f,0x66])]), false],
];
const moov = fixture.indexOf('moov') - 4, trak = fixture.indexOf('trak') - 4;
const duplicate = Buffer.concat([fixture, fixture.subarray(trak, trak + fixture.readUInt32BE(trak))]);
duplicate.writeUInt32BE(duplicate.length - moov, moov);
cases.push(['additional track', duplicate, false]);

for (const [name, bytes, accepted] of cases) test(`M4A structure: ${name}`, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'snipers-m4a-'));
  try {
    const file = path.join(dir, 'input'); await writeFile(file, bytes);
    const check = checkBasicFormat(file, 'M4A', signal());
    if (accepted) await check;
    else await assert.rejects(check, e => e instanceof ValidationFailure && ['INVALID_M4A','UNSUPPORTED_M4A'].includes(e.code));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('browser declarations, canonical MIME, existing formats and audio size limit', () => {
  for (const mime of ['audio/mp4','audio/x-m4a','']) assert.deepEqual(browserDeclaration({name:'audio.M4A',type:mime,size:fixture.length}),
    {type:'M4A',mimeType:'audio/mp4',sizeBytes:fixture.length});
  assert.equal(browserDeclaration({name:'audio.mp3',type:'audio/mpeg',size:100}).type,'MP3');
  assert.equal(browserDeclaration({name:'file.pdf',type:'application/pdf',size:100}).type,'PDF');
  for (const [name, type] of [['x.m4a','video/mp4'],['x.mp3','audio/mp4'],['x.pdf','audio/mp4'],['x.m4a','audio/mpeg'],['x.aac','audio/aac'],['x.wav','audio/wav'],['x.flac','audio/flac'],['x.ogg','audio/ogg']]) {
    assert.throws(() => browserDeclaration({name,type,size:100}));
  }
  for (const size of [0,262144001]) assert.throws(() => browserDeclaration({name:'x.m4a',type:'audio/mp4',size}));
  assert.equal(browserDeclaration({name:'x.m4a',type:'audio/mp4',size:262144000}).sizeBytes,262144000);
  for (const file of [{type:'M4A',mimeType:'audio/mpeg',sizeBytes:1},{type:'MP3',mimeType:'audio/mp4',sizeBytes:1},
    {type:'M4A',mimeType:'video/mp4',sizeBytes:1},{type:'M4A',mimeType:'audio/mp4',sizeBytes:262144001}]) assert.equal(fileDeclaration.safeParse(file).success,false);
  assert.match(downloadDisposition('local-fixture','audio/mp4'),/\.m4a"$/);
  assert.match(downloadDisposition('local-fixture','audio/mpeg'),/\.mp3"$/);
  assert.match(downloadDisposition('local-fixture','application/pdf'),/\.pdf"$/);
});

test('M4A retains byte counting, SHA-256 and cancellation', async () => {
  const expected = {type:'M4A' as const,mimeType:'audio/mp4',sizeBytes:fixture.length,sha256:createHash('sha256').update(fixture).digest('hex')};
  assert.equal((await inspectBytes(Readable.from([fixture]),expected,signal())).sha256,expected.sha256);
  for (const [bytes, declared, code] of [[Buffer.concat([fixture,Buffer.from([0])]),expected,'SIZE_EXCEEDED'],
    [fixture,{...expected,sha256:'0'.repeat(64)},'SHA256_MISMATCH'],[fixture.subarray(1),expected,'SIZE_MISMATCH']] as const) {
    await assert.rejects(inspectBytes(Readable.from([bytes]),declared,signal()),e => e instanceof ValidationFailure && e.code === code);
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(checkBasicFormat('scripts/snipers-m4a/fixtures/sfx.m4a','M4A',controller.signal),{name:'AbortError'});
});

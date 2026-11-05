import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { inspectBytes, checkSignatures, ValidationFailure, SIGNATURE_MAX_AGE } from '../../src/lib/snipers/file-validation';
import { acceptFormat, acceptAntivirus, sandboxArguments, createFileAnalyzer, runSandbox, type AnalysisCommand } from '../../src/lib/snipers/file-analyzers';

const signal = () => new AbortController().signal;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const expected = (bytes: Buffer) => ({ type:'PDF' as const,mimeType:'application/pdf',sizeBytes:bytes.length,sha256:hash(bytes) });
const clean = { code:0,stdout:'/input: OK\nScanned files: 1\nInfected files: 0\n',stderr:'' };
const code = (value: string) => (error: unknown) => error instanceof ValidationFailure && error.code === value;

test('lectura incremental real: SHA, tamaño inconsistente, exceso y corte inmediato de la fuente', async () => {
  const bytes = Buffer.from('%PDF-fixture');
  assert.equal((await inspectBytes(Readable.from([bytes.subarray(0,3),bytes.subarray(3)]),expected(bytes),signal())).sha256,hash(bytes));
  await assert.rejects(inspectBytes(Readable.from([bytes]),{...expected(bytes),sha256:'a'.repeat(64)},signal()),code('SHA256_MISMATCH'));
  await assert.rejects(inspectBytes(Readable.from([bytes.subarray(1)]),expected(bytes),signal()),code('SIZE_MISMATCH'));
  let reads = 0;
  const source = Readable.from((async function* () { for (let i=0;i<10000;i++) { reads++; yield bytes; } })(),{ highWaterMark:1 });
  await assert.rejects(inspectBytes(source,expected(bytes),signal()),code('SIZE_EXCEEDED'));
  assert.ok(reads < 10); assert.equal(source.destroyed,true);
  await assert.rejects(inspectBytes(Readable.from([bytes]),{...expected(bytes),sizeBytes:26214401},signal()));
});

test('flujo incompleto, error de lectura, cancelación y plazo de lectura no producen evidencia', async () => {
  const bytes = Buffer.from('data');
  await assert.rejects(inspectBytes(Readable.from((async function* () { yield bytes; throw Error('incomplete'); })()),expected(bytes),signal()));
  const stalled = new Readable({ read() {} });
  const timeout = new AbortController(), timer = setTimeout(()=>timeout.abort(),30);
  try { await assert.rejects(inspectBytes(stalled,expected(bytes),timeout.signal),{name:'AbortError'}); }
  finally { clearTimeout(timer); }
  assert.equal(stalled.destroyed,true);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(inspectBytes(Readable.from([bytes]),expected(bytes),controller.signal),{name:'AbortError'});
});

test('firmas: frontera exacta 72h, caducadas, futuras y fecha/versión inválidas', () => {
  const now = new Date();
  checkSignatures({signatureVersion:'daily-1',signaturePublishedAt:new Date(now.getTime()-SIGNATURE_MAX_AGE)},now);
  for (const age of [SIGNATURE_MAX_AGE+1,-1,NaN]) assert.throws(() => checkSignatures({signatureVersion:'daily-1',signaturePublishedAt:new Date(now.getTime()-age)},now),code('SIGNATURES_STALE'));
  assert.throws(() => checkSignatures({signatureVersion:'',signaturePublishedAt:now},now));
});

test('formato: MP3 requiere decodificación completa con audio y PDF sin cifrado ni advertencias', () => {
  const mp3 = {code:0,stdout:'out_time_us=100\nprogress=end\n',stderr:''};
  acceptFormat('MP3',[mp3]);
  for (const result of [{...mp3,code:1},{...mp3,stderr:'decode error'}, {...mp3,stdout:''},{...mp3,stdout:'out_time_us=0\nprogress=end\n'}]) assert.throws(() => acceptFormat('MP3',[result]),code('INVALID_MP3'));
  acceptFormat('PDF',[{code:2,stdout:'',stderr:''},{code:0,stdout:'No syntax errors',stderr:''}]);
  for (const status of [0,1,null]) assert.throws(() => acceptFormat('PDF',[{code:status,stdout:'',stderr:''},clean]),code('PDF_ENCRYPTED_OR_INVALID'));
  for (const status of [2,3,null]) assert.throws(() => acceptFormat('PDF',[{code:2,stdout:'',stderr:''},{...clean,code:status}]),code('INVALID_PDF'));
});

test('antivirus: malware, límite, error, warning y resumen incompleto nunca son limpios', () => {
  acceptAntivirus(clean);
  for (const result of [{...clean,code:1},{...clean,code:2},{...clean,code:null},{...clean,stderr:'WARNING'},
    {...clean,stdout:''},{...clean,stdout:clean.stdout.replace('Scanned files: 1','Scanned files: 0')},
    {...clean,stdout:clean.stdout+'ERROR: incomplete\n'},{...clean,stdout:clean.stdout+'Heuristics.Limits.Exceeded'}]) assert.throws(() => acceptAntivirus(result));
});

test('sandbox obligatorio: propiedades de aislamiento, límites, entorno vacío y sin shell', async () => {
  const args = sandboxArguments({tool:'qpdf',args:['--check','/input']},'/var/lib/snipers-validation/a/input','/var/lib/snipers-validation/a/signatures','snipers-analysis-abc123');
  for (const property of ['PrivateNetwork=yes','IPAddressDeny=any','TemporaryFileSystem=/:ro','NoNewPrivileges=yes','DynamicUser=yes','MemoryMax=1G','RuntimeMaxSec=150','KillMode=control-group','LimitCPU=120','TasksMax=16','ImportCredential=']) assert.ok(args.includes(property));
  assert.deepEqual(args.slice(args.indexOf('--')+1),['/usr/bin/env','-i','PATH=/usr/bin','LANG=C','LC_ALL=C','TZ=UTC','HOME=/tmp','/usr/bin/qpdf','--check','/input']);
  assert.throws(() => sandboxArguments({tool:'qpdf',args:[]},'/input bad','/sigs','snipers-analysis-abc123'));
  if (process.platform !== 'linux') await assert.rejects(runSandbox({tool:'qpdf',args:[]},'/input','/sigs',signal()),code('SANDBOX_UNAVAILABLE'));
});

test('orquestación de analizadores con doble explícito: snapshot firmado, cifrado, timeout y MP3 forzado', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'snipers-analyzer-test-'));
  const input = path.join(dir,'input'), db = path.join(dir,'db');
  const { mkdir } = await import('node:fs/promises'); await mkdir(db);
  await writeFile(input,'fake bytes, command double only');
  const header = (version: number) => Buffer.from(`ClamAV-VDB:build:${version}:1:1:md5:signature:builder:${Math.floor(Date.now()/1000)}`.padEnd(512,' '));
  await writeFile(path.join(db,'main.cvd'),header(1)); await writeFile(path.join(db,'daily.cvd'),header(2));
  const calls: AnalysisCommand[] = [];
  let mode = 'clean';
  const analyzer = createFileAnalyzer(db,async command => {
    calls.push(command);
    if (mode === 'timeout') throw new ValidationFailure('ANALYSIS_TIMEOUT');
    if (command.tool === 'sigtool') return {code:0,stdout:'Verification OK.\n',stderr:''};
    if (command.tool === 'qpdf') return {code:command.args[0]==='--is-encrypted' ? mode==='encrypted' ? 0 : 2 : 0,stdout:'',stderr:''};
    if (command.tool === 'ffmpeg') return {code:0,stdout:'out_time_us=100\nprogress=end\n',stderr:''};
    return clean;
  });
  async function reset() { await chmod(path.join(dir,'signatures'),0o700).catch(()=>{}); await rm(path.join(dir,'signatures'),{recursive:true,force:true}); }
  try {
    assert.match((await analyzer.analyze(input,'PDF',signal())).signatureVersion,/daily.cvd-2/);
    assert.ok(calls.find(c=>c.tool==='clamscan')!.args.includes('--alert-exceeds-max=yes'));
    await reset(); calls.length=0; mode='encrypted';
    await assert.rejects(analyzer.analyze(input,'PDF',signal()),code('PDF_ENCRYPTED_OR_INVALID'));
    assert.equal(calls.filter(c=>c.tool==='clamscan').length,0);
    await reset(); mode='timeout'; await assert.rejects(analyzer.analyze(input,'PDF',signal()),code('ANALYSIS_TIMEOUT'));
    await reset(); mode='clean'; calls.length=0; await analyzer.analyze(input,'MP3',signal());
    const ffmpeg = calls.find(c=>c.tool==='ffmpeg')!; assert.ok(ffmpeg.args.includes('mp3')); assert.ok(ffmpeg.args.includes('-xerror'));
    await reset(); await writeFile(path.join(db,'daily.cvd'),Buffer.from(`ClamAV-VDB:build:2:1:1:md5:signature:builder:1`.padEnd(512,' ')));
    await assert.rejects(analyzer.analyze(input,'PDF',signal()),code('SIGNATURES_STALE'));
  } finally { await reset(); await rm(dir,{recursive:true,force:true}); }
});

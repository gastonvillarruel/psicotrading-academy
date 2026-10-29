/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const net = require('node:net');
const { Writable } = require('node:stream');
const fs = require('node:fs');
const ts = require('typescript');
const { assertPortFree, startServer } = require('./server.cjs');
const { accessDenied, definitiveRejection, saveIntent, markPending, readIntent, readPending, scrubIntents, clearPending } = require('../../src/lib/snipers/pending-intent.ts');
class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(i) { return [...this.values.keys()][i] ?? null; }
  getItem(k) { return this.values.get(k) ?? null; }
  setItem(k, v) { this.values.set(k, v); }
  removeItem(k) { this.values.delete(k); }
}
function intent() { return { owner: randomUUID(), createdAt: Date.now(), kind: 'state', command: { operationId: randomUUID(), membershipId: randomUUID(), expectedVersion: 1, status: 'SUSPENDED', reason: 'PRIVATE-MOTIVE' } }; }
test('última corrección: sólo rechazos posteriores a la búsqueda del recibo permiten descartar', () => {
  for (const code of ['NOT_FOUND', 'STALE', 'OVERLAP', 'DUPLICATE_REFERENCE', 'INVALID_STATE']) assert.equal(definitiveRejection(code), true);
  for (const code of ['IDEMPOTENCY_CONFLICT', 'VALIDATION', 'INTEGRITY', 'FORBIDDEN', 'SESSION', 'DISABLED', 'CONFIGURATION', 'UNAVAILABLE', 'CONCURRENT', 'UNKNOWN']) assert.equal(definitiveRejection(code), false);
  assert.equal(accessDenied('IDEMPOTENCY_CONFLICT'), true);
  const storage = new MemoryStorage(); const a = intent(); saveIntent(storage, a); markPending(storage, a);
  const original = readPending(storage, a.owner, a.command.membershipId); scrubIntents(storage);
  assert.deepEqual(readPending(storage, a.owner, a.command.membershipId), original);
  assert.equal(readPending(storage, randomUUID(), a.command.membershipId), null);
  assert.equal(readPending(storage, a.owner, randomUUID()), null);
});
test('última corrección: manejador real conserva señales inciertas y descarta rechazos definitivos', async () => {
  // Isolate hooks/actions only; execute the actual component and storage functions.
  // The browser suite separately exercises real React, HTTP, NextAuth and SQL.
  const compiled = ts.transpileModule(fs.readFileSync('src/components/snipers/CommercialOperation.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const preserved = ['IDEMPOTENCY_CONFLICT', 'VALIDATION', 'INTEGRITY', 'UNAVAILABLE', 'CONCURRENT', 'SESSION', 'FORBIDDEN', 'DISABLED', 'CONFIGURATION'];
  const rejected = ['NOT_FOUND', 'STALE', 'OVERLAP', 'DUPLICATE_REFERENCE', 'INVALID_STATE'];
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  function nodes(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]; }
  try {
    for (const code of [...preserved, ...rejected]) {
      const storage = new MemoryStorage(); Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
      const value = intent(); saveIntent(storage, value); markPending(storage, value); const marker = readPending(storage, value.owner, value.command.membershipId);
      let task; let closed = 0; let lost;
      const actions = Object.fromEntries(['confirmSnipersPayment', 'confirmSnipersCourtesy', 'changeSnipersStatus', 'changeSnipersPlan', 'voidSnipersPayment', 'voidSnipersCourtesy'].map(name => [name, async () => ({ ok: false, code, message: code })]));
      const react = { useState: init => [init, () => {}], useTransition: () => [false, work => { task = work(); }] };
      const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      const mod = { exports: {} };
      const localRequire = name => {
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return jsx;
        if (name === 'next/navigation') return { useRouter: () => ({ refresh() {} }) };
        if (name === '@/app/actions/snipers') return actions;
        if (name === '@/lib/snipers/pending-intent') return require('../../src/lib/snipers/pending-intent.ts');
        if (name === '@/lib/snipers/presentation') return require('../../src/lib/snipers/presentation.ts');
        if (name === '@/components/admin/ConfirmModal') return { __esModule: true, default: 'ConfirmModal' };
        if (name === './ui') return new Proxy({}, { get: (_target, key) => String(key) });
        throw new Error('Unexpected component import: ' + name);
      };
      new Function('require', 'module', 'exports', compiled)(localRequire, mod, mod.exports);
      const view = mod.exports.default({ owner: value.owner, member: { id: value.command.membershipId, version: 1, status: 'ACTIVE', renewalPlan: { id: randomUUID() } }, plans: [], operation: { kind: 'state' }, recovered: value, onClose() { closed++; }, onAccessLost(reason) { lost = reason; } });
      nodes(view).find(node => node.type === 'ConfirmModal').props.onConfirm(); await task;
      if (preserved.includes(code)) {
        assert.deepEqual(readPending(storage, value.owner, value.command.membershipId), marker, code); assert.equal(closed, 0, code);
        if (accessDenied(code)) { assert.equal(readIntent(storage, value.owner, value.command.membershipId), null, code); assert.equal(lost, code); }
        else assert.deepEqual(readIntent(storage, value.owner, value.command.membershipId), value, code);
      } else { assert.equal(storage.length, 0, code); assert.equal(closed, 1, code); }
    }
  } finally { if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage); else delete globalThis.sessionStorage; }
});
test('corrección: logout y cambio de identidad conservan sólo una señal mínima', () => {
  const storage = new MemoryStorage(); const value = intent(); saveIntent(storage, value); markPending(storage, value);
  scrubIntents(storage);
  assert.equal(readIntent(storage, value.owner, value.command.membershipId), null);
  const marker = readPending(storage, value.owner, value.command.membershipId);
  assert.deepEqual(marker, { owner: value.owner, membershipId: value.command.membershipId, operationId: value.command.operationId });
  assert.doesNotMatch(JSON.stringify([...storage.values]), /PRIVATE|reason|reference|received|preview|command/);
  scrubIntents(storage, randomUUID()); assert.deepEqual(readPending(storage, value.owner, value.command.membershipId), marker);
  clearPending(storage, value.owner, value.command.membershipId); assert.equal(storage.length, 0);
});
test('corrección: expiración depura el sobre sin perder el UUID pendiente', () => {
  const storage = new MemoryStorage(); const value = intent(); saveIntent(storage, value);
  scrubIntents(storage, value.owner, value.createdAt + 86400001);
  assert.equal(readIntent(storage, value.owner, value.command.membershipId), null);
  assert.equal(readPending(storage, value.owner, value.command.membershipId).operationId, value.command.operationId);
});
test('corrección: limpiar un registro corrupto no impide limpiar los restantes', () => {
  const storage = new MemoryStorage(); const value = intent(); saveIntent(storage, value);
  storage.setItem('psico.snipers.intent.v1:broken', '{broken'); scrubIntents(storage);
  assert.equal(storage.length, 1); assert.ok(readPending(storage, value.owner, value.command.membershipId));
});
test('corrección: una señal manipulada con datos comerciales se rechaza', () => {
  const storage = new MemoryStorage(); const value = intent(); markPending(storage, value);
  const key = storage.key(0); storage.setItem(key, JSON.stringify({ ...JSON.parse(storage.getItem(key)), receivedCents: 3000, reference: 'PRIVATE' }));
  assert.equal(readPending(storage, value.owner, value.command.membershipId), null); assert.equal(storage.length, 0);
});
test('corrección: un puerto ocupado se rechaza sin contactar al servidor ajeno', async () => {
  const listener = net.createServer(); let connections = 0; listener.on('connection', socket => { connections++; socket.destroy(); });
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  try { await assert.rejects(assertPortFree(listener.address().port), /ocupado/); assert.equal(connections, 0); }
  finally { await new Promise(resolve => listener.close(resolve)); }
});
test('corrección: salida prematura del hijo aborta disponibilidad y se espera su cierre', async () => {
  const log = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const server = startServer(process.execPath, ['-e', 'process.exit(2)'], { env: process.env, windowsHide: true }, 3100, log);
  try { await assert.rejects(server.waitReady(3000), /terminó|ejecutándose/); assert.throws(server.assertRunning); }
  finally { await server.stop(); log.end(); }
});
test('corrección: un anuncio Ready sin listener propio no acredita aislamiento', async () => {
  const log = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const server = startServer(process.execPath, ['-e', 'console.log("Ready in 1ms");setInterval(()=>{},1000)'], { env: process.env, windowsHide: true }, 3100, log);
  try { await assert.rejects(server.waitReady(3000), /listener HTTP/); }
  finally { await server.stop(); log.end(); }
});
test('corrección: listener propio acredita PID y su cierre libera el puerto', async () => {
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const log = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const code = `require('node:net').createServer().listen(${port},'127.0.0.1',()=>console.log('Ready in 1ms'))`;
  const server = startServer(process.execPath, ['-e', code], { env: process.env, windowsHide: true }, port, log);
  try { await server.waitReady(3000); server.assertRunning(); }
  finally { await server.stop(); log.end(); }
  await assertPortFree(port);
});

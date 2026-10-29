/* eslint @typescript-eslint/no-require-imports: "off" */
// Loaded only by the explicit local launcher. No changes to ordinary application startup.
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
if (process.env.SNIPERS_PHASE3A_LOCAL !== '1') throw new Error('Local launcher required.');
function check(options) {
  if (options.path || !options.port) return;
  const host = String(options.host || options.hostname || 'localhost');
  const allowed = ['127.0.0.1', '::1', 'localhost'].includes(host);
  if (process.env.SNIPERS_NETWORK_TRACE) fs.appendFileSync(process.env.SNIPERS_NETWORK_TRACE, JSON.stringify({ pid: process.pid, host, port: options.port, allowed }) + '\n');
  if (!allowed) throw new Error('Local network guard: external connection rejected.');
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  // createConnection passes an already-normalized [options, callback] array.
  const options = Array.isArray(args[0]) ? args[0][0] : net._normalizeArgs(args)[0];
  check(options);
  return connect.apply(this, args);
};
const secure = tls.connect;
tls.connect = function(...args) {
  const options = typeof args[0] === 'object' ? args[0] : Object.assign({ port: args[0], host: typeof args[1] === 'string' ? args[1] : 'localhost' }, ...args.slice(1).filter(v => v && typeof v === 'object'));
  check(options);
  return secure.apply(this, args);
};

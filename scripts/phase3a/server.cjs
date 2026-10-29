/* eslint @typescript-eslint/no-require-imports: "off" */
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error(`Puerto local ${port} ocupado; no se iniciará el navegador.`)));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(resolve));
  });
}
function assertOwner(port, pid) {
  if (process.platform !== 'win32') throw new Error('La verificación de propietario requiere el entorno Windows autorizado.');
  const result = spawnSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  // Read only the exact IPv4 listener; never log unrelated connections.
  const owners = result.stdout?.split(/\r?\n/).map(line => line.trim().split(/\s+/))
    .filter(columns => columns[0] === 'TCP' && columns[1] === `127.0.0.1:${Number(port)}` && columns[3] === 'LISTENING')
    .map(columns => Number(columns[4]));
  if (result.error || result.status !== 0 || !owners?.length || owners.some(owner => owner !== pid)) throw new Error('El listener HTTP no pertenece al servidor iniciado por el arnés.');
}
function startServer(command, args, options, port, log, onFailure = () => {}) {
  const child = spawn(command, args, options);
  let failure; let stopping = false; let ready = false; let output = '';
  const closed = new Promise(resolve => child.once('close', resolve));
  function fail(error) { failure = error; if (!stopping) onFailure(error); }
  child.on('error', fail);
  child.on('exit', code => { if (!stopping) fail(new Error(`El servidor hijo terminó inesperadamente (${code}).`)); });
  child.stdout.on('data', data => { output = (output + data.toString()).slice(-8000); if (/Ready in/.test(output)) ready = true; });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  function assertRunning() { if (failure) throw failure; if (child.exitCode !== null || child.signalCode !== null) throw new Error('El servidor hijo ya no está ejecutándose.'); }
  return {
    pid: child.pid, assertRunning,
    async waitReady(timeout = 60000) {
      const until = Date.now() + timeout;
      while (!ready && Date.now() < until) { assertRunning(); await delay(100); }
      assertRunning();
      if (!ready) throw new Error('El servidor hijo no anunció disponibilidad.');
      assertOwner(port, child.pid); assertRunning();
    },
    async stop() {
      stopping = true;
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      const ended = await Promise.race([closed.then(() => true), delay(5000).then(() => false)]);
      if (!ended) { child.kill('SIGKILL'); await Promise.race([closed, delay(5000).then(() => { throw new Error('No se pudo cerrar el servidor hijo.'); })]); }
    },
  };
}
module.exports = { assertPortFree, startServer };

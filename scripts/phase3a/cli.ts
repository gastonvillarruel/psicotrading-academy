import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fail, npmBackup, profilePath, root, runPg, pgEnv } from '../phase0/local';
import { localProfile, runnerEnv, verifyDatabase } from '../phase1/guard';

function hash(file: string) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function schema(profile: ReturnType<typeof localProfile>) {
  const text = runPg('pg_dump', ['--schema-only', '--no-owner', '--no-privileges'], pgEnv(profile.DATABASE_URL))
    .replace(/^\\(?:un)?restrict .*\r?\n/gm, '').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text).digest('hex');
}
function main() {
  const action = process.argv[2];
  if (process.argv.length !== 3 || !['check', 'test', 'browser', 'dev', 'build', 'typecheck', 'lint'].includes(action)) throw new Error('Uso: tsx scripts/phase3a/cli.ts check|test|browser|dev|build|typecheck|lint');
  const profile = localProfile();
  const branch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8', windowsHide: true });
  if (branch.status !== 0 || branch.stdout.trim() !== 'feature/snipers-campus' || profile.SNIPERS_ENABLED !== 'false') throw new Error('Rama o habilitación persistente incorrectas.');
  verifyDatabase(profile);
  if (action === 'check') { console.log('Guardas 3A: base, rol, rama y perfil local verificados.'); return; }
  const protectedFiles = ['.env', '.env.snipers.local', 'prisma/schema.prisma', 'prisma/snipers-review/phase1.sql', 'src/lib/snipers/operations.ts', 'src/lib/snipers/queries.ts', 'src/lib/snipers/preview.ts', 'src/lib/snipers/permissions.ts'];
  const before = Object.fromEntries(protectedFiles.map(f => [f, hash(f)]));
  const schemaBefore = schema(profile);
  const networkTrace = path.join(root, `.local/snipers/phase3a-${action}-network.jsonl`);
  fs.writeFileSync(networkTrace, '');
  const env = { ...runnerEnv(profile), SNIPERS_PHASE3A_LOCAL: '1', NEXT_TELEMETRY_DISABLED: '1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.join(root, 'scripts/phase3a/font-responses.cjs'),
    SNIPERS_NETWORK_TRACE: networkTrace,
    NODE_OPTIONS: `--require "${path.join(root, 'scripts/phase3a/network-guard.cjs').replace(/\\/g, '/')}"` };
  if (['test', 'browser', 'dev'].includes(action)) npmBackup(profilePath);
  if (action === 'dev') {
    const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3100'], {
      cwd: root, env: { ...env, SNIPERS_ENABLED: 'true', NEXTAUTH_URL: 'http://127.0.0.1:3100', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100' }, stdio: 'inherit', windowsHide: true,
    });
    child.on('exit', code => { process.exitCode = code ?? 1; });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
    return;
  }
  const commands: [string, string[]][] = action === 'build' ? [
    ['node_modules/prisma/build/index.js', ['generate']], ['node_modules/next/dist/bin/next', ['build', '--webpack']],
  ] : action === 'typecheck' ? [['node_modules/typescript/bin/tsc', ['--noEmit', '--incremental', 'false']]]
    : action === 'lint' ? [['node_modules/eslint/bin/eslint.js', ['--max-warnings=0', 'scripts/phase3a', 'src/lib/snipers', 'src/app/actions/snipers.ts', 'src/app/mi-campus/snipers', 'src/components/snipers', 'src/components/ClientChromeVisibility.tsx', 'src/app/mi-campus/page.tsx', 'scripts/phase1/integration.test.ts']]]
    : [['node_modules/tsx/dist/cli.mjs', action === 'browser' ? ['scripts/phase3a/browser.cjs'] : ['--test', '--test-concurrency=1', 'scripts/phase3a/unit.test.ts', 'scripts/phase3a/actions.test.cjs', 'scripts/phase3a/corrections.test.cjs']]];
  let passed = true; let output = '';
  for (const [file, args] of commands) {
    const result = spawnSync(process.execPath, [file, ...args], { cwd: root, env: { ...env, NODE_ENV: action === 'build' ? 'production' : 'development' }, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
    output += result.stdout || ''; output += result.stderr || '';
    if (result.error || result.status !== 0) { passed = false; break; }
  }
  fs.writeFileSync(`.local/snipers/phase3a-${action}.log`, output);
  process.stdout.write(output);
  const after = Object.fromEntries(protectedFiles.map(f => [f, hash(f)]));
  const schemaAfter = schema(profile);
  const preserved = JSON.stringify(before) === JSON.stringify(after) && schemaBefore === schemaAfter;
  const connections = fs.readFileSync(networkTrace, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { host: string; port: number; allowed: boolean });
  const localOnly = connections.every(c => !c.allowed || ['127.0.0.1', '::1', 'localhost'].includes(c.host));
  fs.writeFileSync(`.local/snipers/phase3a-${action}-evidence.json`, JSON.stringify({ action, passed, protectedFiles: after, schemaBefore, schemaAfter, preserved, destination: '127.0.0.1:55432/snipers_dev', persistentFlag: profile.SNIPERS_ENABLED, networkGuard: true, networkTrace: path.relative(root, networkTrace), localOnly, allowedDestinations: [...new Set(connections.filter(c => c.allowed).map(c => `${c.host}:${c.port}`))], deniedConnections: connections.filter(c => !c.allowed).length }, null, 2));
  if (!preserved) throw new Error('Cambió un archivo protegido o la estructura SQL.');
  if (!localOnly) throw new Error('Se detectó un destino fuera de loopback.');
  if (!passed) throw new Error(`Falló ${action}; ver evidencia local.`);
}
try { main(); } catch (error) { fail(error); }

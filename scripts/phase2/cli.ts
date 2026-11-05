import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fail, npmBackup, profilePath, root } from '../phase0/local';
import { localProfile, runnerEnv, verifyDatabase } from '../phase1/guard';

function main() {
  const action = process.argv[2];
  if (process.argv.length !== 3 || !['check', 'unit', 'test', 'regression', 'typecheck', 'lint'].includes(action)) throw new Error('Uso: tsx scripts/phase2/cli.ts check|unit|test|regression|typecheck|lint');
  const profile = localProfile();
  const branch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8', windowsHide: true });
  if (branch.status !== 0 || branch.stdout.trim() !== 'feature/snipers-campus') throw new Error('Rama incorrecta.');
  if (profile.SNIPERS_ENABLED !== 'false') throw new Error('Snipers debe permanecer deshabilitado en el perfil.');
  verifyDatabase(profile);
  if (action === 'check') { console.log('Identidad, rama y perfil local verificados.'); return; }
  const env = { ...runnerEnv(profile), SNIPERS_PHASE2_LOCAL: '1' };
  if (action === 'test' || action === 'regression') npmBackup(profilePath);
  let file = 'node_modules/tsx/dist/cli.mjs';
  let args: string[];
  if (action === 'typecheck') { file = 'node_modules/typescript/bin/tsc'; args = ['--noEmit', '--incremental', 'false']; }
  else if (action === 'lint') { file = 'node_modules/eslint/bin/eslint.js'; args = ['--max-warnings=0', 'scripts/phase2', 'src/lib/snipers', 'scripts/phase1/integration.test.ts']; }
  else {
    args = ['--test', '--test-concurrency=1', ...(action === 'regression'
      ? ['scripts/phase0/phase0.test.ts', 'scripts/phase1/isolation.test.ts', 'scripts/phase1/integration.test.ts']
      : action === 'unit' ? ['scripts/phase2/unit.test.ts'] : ['scripts/phase2/unit.test.ts', 'scripts/phase2/integration.test.ts'])];
  }
  const result = spawnSync(process.execPath, [file, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true,
    timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  if (action === 'test' || action === 'regression' || action === 'unit') fs.writeFileSync(`.local/snipers/phase2-${action}.tap`, result.stdout || '');
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error || result.status !== 0) throw new Error(`Falló ${action} (salida ${result.status ?? 'no disponible'}).`);
}
try { main(); } catch (error) { fail(error); }

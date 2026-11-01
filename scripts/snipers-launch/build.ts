// Reproducible offline application build under Node 22. No production configuration or services.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isolatedEnv, readProfile } from '../phase0/local';
import { verifyDatabase } from '../phase1/guard';
import { privateDirectory } from './database';

const label = process.argv[2];
if (!['baseline', 'final', 'webpack'].includes(label) || process.argv.length !== 3 || !/^v22\./.test(process.version)) throw new Error('Uso: Node 22 build.ts baseline|final|webpack');
const directory = path.resolve('.local/snipers/launch-a');
privateDirectory(directory);
const profile = readProfile(); verifyDatabase(profile);
const fontFile = path.join(directory, 'font-responses.cjs');
// Turbopack enumerates the mock object: the previous Proxy-only Webpack fixture is insufficient.
const fonts = Object.fromEntries([
  ['Geist', '100..900'], ['Geist Mono', '100..900'], ['Poppins', '300;400;500;600;700;800;900'],
].map(([family, weights]) => [`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weights}&display=swap`,
  `@font-face { font-family: '${family}'; src: local('Arial'); font-weight: 100 900; font-style: normal; }`]));
fs.writeFileSync(fontFile, `module.exports = ${JSON.stringify(fonts)};\n`, { mode: 0o600 });
const prefix = path.join(directory, `${label}-build-${Date.now()}`);
const env: NodeJS.ProcessEnv = { ...isolatedEnv(profile), NODE_ENV: 'production', SNIPERS_PHASE3A_LOCAL: '1', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontFile, SNIPERS_NETWORK_TRACE: prefix + '-network.jsonl',
  NODE_OPTIONS: `--require "${path.resolve('scripts/phase3a/network-guard.cjs').replace(/\\/g, '/')}"` };
const log = fs.openSync(prefix + '.log', 'wx', 0o600);
const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const args = [npm, 'run', 'build', ...(label === 'webpack' ? ['--', '--webpack'] : [])];
const result = spawnSync(process.execPath, args, { env, stdio: ['ignore', log, log], windowsHide: true, timeout: 600000 });
fs.closeSync(log);
const evidence = { node: process.version, command: label === 'webpack' ? 'npm run build -- --webpack' : 'npm run build',
  passed: result.status === 0 && !result.error, persistentFlag: profile.SNIPERS_ENABLED, offlineFontFixture: true,
  productionValidated: false, log: prefix + '.log' };
fs.writeFileSync(prefix + '.json', JSON.stringify(evidence, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(evidence));
process.exitCode = evidence.passed ? 0 : 1;

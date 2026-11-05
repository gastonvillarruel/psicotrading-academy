import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { assertWindowsPrivateAccess, privateDirectory, windowsPrivateAccessCheck } from './database';

const windows = process.platform === 'win32';
function check(program: string, file: string) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', program], {
    windowsHide: true, encoding: 'utf8', timeout: 10000,
    env: { NODE_ENV: 'production', SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, SNIPERS_ACL_PATH: file },
  });
}
const missing = path.resolve('.local/snipers/launch-a', `missing-acl-${process.pid}`);

test('Windows ACL: auditor reproduction rejects a missing path instead of accepting Get-Acl errors', { skip: !windows }, () => {
  assert.equal(fs.existsSync(missing), false);
  const result = check(windowsPrivateAccessCheck, missing);
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes('SNIPERS_PRIVATE_ACL_OK'));
  assert.throws(() => assertWindowsPrivateAccess(missing), /ACL privada requerida/);
});

test('Windows ACL: nonterminating inspection errors are made terminating', { skip: !windows }, () => {
  const result = check(`function Get-Acl { [CmdletBinding()] param([string]$LiteralPath)
    Write-Error 'Synthetic inspection failure'
  }\n${windowsPrivateAccessCheck}`, missing);
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes('SNIPERS_PRIVATE_ACL_OK'));
});

test('Windows ACL: identity resolution errors reject inspection', { skip: !windows }, () => {
  // Inject the resolver failure without querying a Windows domain/account service.
  const result = check(`function Get-Acl { [CmdletBinding()] param([string]$LiteralPath)
    throw [System.Security.Principal.IdentityNotMappedException]::new('Synthetic identity resolution failure')
  }\n${windowsPrivateAccessCheck}`, missing);
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes('SNIPERS_PRIVATE_ACL_OK'));
});

test('Windows ACL: null or incomplete inspection results are rejected', { skip: !windows }, () => {
  for (const value of ['$null', '@{ Access = @() }', '[System.Security.AccessControl.FileSecurity]::new()']) {
    const result = check(`function Get-Acl { [CmdletBinding()] param([string]$LiteralPath)
      return ${value}
    }\n${windowsPrivateAccessCheck}`, missing);
    assert.equal(result.status, 1, value);
    assert.ok(!result.stdout.includes('SNIPERS_PRIVATE_ACL_OK'));
  }
});

test('Windows ACL: actual private file passes and an explicit Everyone grant is rejected', { skip: !windows }, () => {
  const directory = path.resolve('.local/snipers/launch-a', `acl-fixture-${Date.now()}`);
  privateDirectory(directory);
  const file = path.join(directory, 'synthetic.txt');
  fs.writeFileSync(file, 'synthetic, no credentials\n', { flag: 'wx', mode: 0o600 });
  assert.doesNotThrow(() => assertWindowsPrivateAccess(file));
  execFileSync('icacls.exe', [file, '/grant', '*S-1-1-0:R'], { windowsHide: true, stdio: 'ignore' });
  try { assert.throws(() => assertWindowsPrivateAccess(file), /ACL privada requerida/); }
  finally { execFileSync('icacls.exe', [file, '/remove:g', '*S-1-1-0'], { windowsHide: true, stdio: 'ignore' }); }
  assert.doesNotThrow(() => assertWindowsPrivateAccess(file));
});

test('historical regression runner includes every original phase test file', () => {
  const runner = fs.readFileSync('scripts/snipers-launch/regression.ts', 'utf8');
  const selected = [...runner.matchAll(/'(scripts\/phase[^']+\.test\.(?:ts|cjs))'/g)].map(match => match[1]).sort();
  const original = fs.readdirSync('scripts', { withFileTypes: true }).filter(entry => entry.isDirectory() && /^phase\d/.test(entry.name))
    .flatMap(entry => fs.readdirSync(`scripts/${entry.name}`).filter(file => /\.test\.(ts|cjs)$/.test(file)).map(file => `scripts/${entry.name}/${file}`)).sort();
  assert.equal(original.length, 23);
  assert.deepEqual(selected, original);
});

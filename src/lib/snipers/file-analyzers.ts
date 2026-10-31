// Linux-only, fail-closed subprocess isolation using the host's existing systemd.
// No daemon, container, supervisor, shell, network access or inherited credentials.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { checkSignatures, ValidationFailure, type FileAnalyzer, type ScanProof } from './file-validation';

export type AnalysisCommand = { tool: 'ffmpeg' | 'qpdf' | 'clamscan' | 'sigtool'; args: string[] };
export type AnalysisResult = { code: number | null; stdout: string; stderr: string };
export type SandboxRunner = (command: AnalysisCommand, file: string, signatures: string, signal: AbortSignal) => Promise<AnalysisResult>;
const safePath = (value: string) => /^\/[a-zA-Z0-9_./-]+$/.test(value) && !value.split('/').includes('..');

export function sandboxArguments(command: AnalysisCommand, file: string, signatures: string, unit: string) {
  if (!safePath(file) || !safePath(signatures) || !/^snipers-analysis-[a-f0-9-]+$/.test(unit)) throw new ValidationFailure('SANDBOX_CONFIGURATION');
  const properties = [
    'Type=exec', 'DynamicUser=yes', 'NoNewPrivileges=yes', 'CapabilityBoundingSet=', 'PrivateNetwork=yes',
    'RestrictAddressFamilies=AF_UNIX', 'IPAddressDeny=any', 'PrivateDevices=yes', 'ProtectHome=yes',
    'ProtectSystem=strict', 'ProtectKernelTunables=yes', 'ProtectKernelModules=yes', 'ProtectControlGroups=yes',
    'ProtectProc=invisible', 'ProcSubset=pid', 'RestrictSUIDSGID=yes', 'RestrictNamespaces=yes',
    'LockPersonality=yes', 'UMask=0077', 'MemoryMax=1G', 'MemorySwapMax=0', 'TasksMax=16', 'CPUQuota=100%',
    'LimitCPU=120', 'LimitFSIZE=536870912', 'LimitNOFILE=64', 'LimitCORE=0', 'RuntimeMaxSec=150',
    'TimeoutStopSec=2', 'KillMode=control-group', 'SendSIGKILL=yes', 'StandardInput=null',
    'PassEnvironment=', 'EnvironmentFile=', 'LoadCredential=', 'ImportCredential=',
    // Only executable/library trees and this immutable input/snapshot are exposed.
    'TemporaryFileSystem=/:ro', 'TemporaryFileSystem=/tmp:rw,nosuid,nodev,noexec,size=512M',
    `BindReadOnlyPaths=/usr /lib -/lib64 -/etc/ld.so.cache ${file}:/input ${signatures}:/signatures`,
    'WorkingDirectory=/tmp',
  ];
  return ['--quiet', '--wait', '--pipe', '--collect', '--unit', unit, ...properties.flatMap(p => ['--property', p]),
    '--', '/usr/bin/env', '-i', 'PATH=/usr/bin', 'LANG=C', 'LC_ALL=C', 'TZ=UTC', 'HOME=/tmp',
    `/usr/bin/${command.tool}`, ...command.args];
}

export const runSandbox: SandboxRunner = async (command, file, signatures, signal) => {
  if (process.platform !== 'linux') throw new ValidationFailure('SANDBOX_UNAVAILABLE');
  signal.throwIfAborted();
  const unit = `snipers-analysis-${randomUUID()}`;
  const args = sandboxArguments(command, file, signatures, unit);
  return new Promise<AnalysisResult>((resolve, reject) => {
    const child = spawn('/usr/bin/systemd-run', args, { env: { PATH: '/usr/bin', LANG: 'C', NODE_ENV: 'production' }, stdio: ['ignore','pipe','pipe'], windowsHide: true });
    let stdout = '', stderr = '', bytes = 0, failure: Error | undefined;
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      // Killing systemd-run alone does not kill its transient unit. Stop the cgroup too.
      const killer = spawn('/usr/bin/systemctl', ['stop', `${unit}.service`], { env: { PATH: '/usr/bin', NODE_ENV: 'production' }, stdio: 'ignore', windowsHide: true });
      const timer = setTimeout(() => killer.kill('SIGKILL'), 5000);
      killer.on('error', () => clearTimeout(timer)); killer.on('close', () => clearTimeout(timer));
      child.kill('SIGKILL');
      // RuntimeMaxSec bounds the unit even if stop fails or the worker itself is killed.
    };
    const abort = () => stop(new ValidationFailure('ANALYSIS_ABORTED'));
    const timer = setTimeout(() => stop(new ValidationFailure('ANALYSIS_TIMEOUT')), 155000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    for (const [stream, output] of [[child.stdout, true], [child.stderr, false]] as const) stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024) { stop(new ValidationFailure('ANALYSIS_OUTPUT_LIMIT')); return; }
      if (output) stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
    });
    child.on('error', () => stop(new ValidationFailure('SANDBOX_UNAVAILABLE')));
    child.on('close', code => { clearTimeout(timer); signal.removeEventListener('abort', abort); if (failure) reject(failure); else resolve({ code, stdout, stderr }); });
  });
};

export function acceptFormat(type: 'MP3' | 'PDF', results: AnalysisResult[]) {
  if (type === 'MP3') {
    if (results.length !== 1 || results[0].code !== 0 || results[0].stderr.trim()
      || !/^progress=end\s*$/m.test(results[0].stdout) || !/^out_time_us=[1-9]\d*\s*$/m.test(results[0].stdout)) throw new ValidationFailure('INVALID_MP3');
  } else {
    if (results.length !== 2 || results[0].code !== 2 || results[0].stderr.trim()) throw new ValidationFailure('PDF_ENCRYPTED_OR_INVALID');
    if (results[1].code !== 0 || results[1].stderr.trim()) throw new ValidationFailure('INVALID_PDF');
  }
}
export function acceptAntivirus(result: AnalysisResult) {
  if (result.code === 1) throw new ValidationFailure('MALWARE_OR_SCAN_LIMIT');
  if (result.code !== 0 || result.stderr.trim() || !/^\/input: OK\s*$/m.test(result.stdout)
    || !/^Scanned files:\s+1\s*$/m.test(result.stdout) || !/^Infected files:\s+0\s*$/m.test(result.stdout)
    || /(?:ERROR|WARNING|Heuristics\.Limits\.Exceeded|Scanned files:\s+0)/i.test(result.stdout)) throw new ValidationFailure('ANTIVIRUS_INCOMPLETE');
}

// Snapshot just the signed official databases, never configs, credentials or arbitrary files.
// Requiring CVD is intentional: CLD incremental databases must be supplied as signed CVD for this policy.
async function signatureSnapshot(directory: string, target: string, signal: AbortSignal): Promise<ScanProof> {
  await mkdir(target, { mode: 0o700 });
  const versions: string[] = []; let publishedAt: Date | undefined;
  for (const name of ['main.cvd','daily.cvd','bytecode.cvd']) {
    const source = await open(path.join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW).catch(error => {
      if (name === 'bytecode.cvd' && error.code === 'ENOENT') return null;
      throw new ValidationFailure('SIGNATURE_DATABASE_UNAVAILABLE');
    });
    if (!source) continue;
    try {
      const stat = await source.stat();
      if (!stat.isFile() || stat.size < 512 || stat.size > 256 * 1024 * 1024) throw new ValidationFailure('SIGNATURE_DATABASE_INVALID');
      let bytes = 0;
      await pipeline(createReadStream('', { fd: source.fd, autoClose: false }), new Transform({ transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length; done(bytes > 256 * 1024 * 1024 ? new ValidationFailure('SIGNATURE_DATABASE_INVALID') : null, chunk);
      } }), createWriteStream(path.join(target, name), { flags: 'wx', mode: 0o444 }), { signal });
      const snapshot = await open(path.join(target, name), 'r');
      const header = Buffer.alloc(512);
      try { await snapshot.read(header, 0, 512, 0); } finally { await snapshot.close(); }
      const fields = header.toString('ascii').trim().split(':');
      if (fields[0] !== 'ClamAV-VDB' || !/^\d+$/.test(fields[2]) || !/^\d+$/.test(fields[8])) throw new ValidationFailure('SIGNATURE_DATABASE_INVALID');
      versions.push(`${name}-${fields[2]}`);
      if (name === 'daily.cvd') publishedAt = new Date(Number(fields[8]) * 1000);
    } finally { await source.close(); }
  }
  if (!publishedAt) throw new ValidationFailure('SIGNATURE_DATABASE_INVALID');
  await chmod(target, 0o555);
  const proof = { signatureVersion: versions.join('_'), signaturePublishedAt: publishedAt };
  checkSignatures(proof, new Date()); return proof;
}

export function createFileAnalyzer(signatureDirectory: string, run: SandboxRunner = runSandbox): FileAnalyzer {
  if (!path.isAbsolute(signatureDirectory)) throw new ValidationFailure('SANDBOX_CONFIGURATION');
  return { async analyze(file, type, signal) {
    const signatures = path.join(path.dirname(file), 'signatures');
    const proof = await signatureSnapshot(signatureDirectory, signatures, signal);
    for (const name of proof.signatureVersion.split('_').map(v => v.replace(/-\d+$/, ''))) {
      const checked = await run({ tool: 'sigtool', args: ['--info', `/signatures/${name}`] }, file, signatures, signal);
      if (checked.code !== 0 || checked.stderr.trim() || !/^Verification OK\.\s*$/m.test(checked.stdout)) throw new ValidationFailure('SIGNATURE_DATABASE_INVALID');
    }
    const results: AnalysisResult[] = [];
    if (type === 'PDF') {
      results.push(await run({ tool: 'qpdf', args: ['--is-encrypted', '/input'] }, file, signatures, signal));
      // Do not process encrypted input, even with an empty password.
      if (results[0].code !== 2 || results[0].stderr.trim()) throw new ValidationFailure('PDF_ENCRYPTED_OR_INVALID');
      results.push(await run({ tool: 'qpdf', args: ['--check', '/input'] }, file, signatures, signal));
    } else {
      results.push(await run({ tool: 'ffmpeg', args: ['-nostdin','-hide_banner','-v','error','-xerror','-err_detect','explode',
        '-protocol_whitelist','file','-f','mp3','-threads','1','-i','/input','-map','0:a:0','-c:a','pcm_s16le','-threads','1','-progress','pipe:1','-f','null','-'] }, file, signatures, signal));
    }
    acceptFormat(type, results);
    const result = await run({ tool: 'clamscan', args: ['--database=/signatures','--official-db-only=yes',
      '--allmatch=yes','--scan-pdf=yes','--scan-archive=yes','--alert-encrypted=yes','--alert-exceeds-max=yes',
      '--max-filesize=262144000','--max-scansize=536870912','--max-recursion=16','--max-files=10000','--max-scantime=120000','/input'] }, file, signatures, signal);
    acceptAntivirus(result); checkSignatures(proof, new Date());
    // No output file from any analyzer is ever promoted. The original bytes are rehashed by the caller.
    return proof;
  } };
}

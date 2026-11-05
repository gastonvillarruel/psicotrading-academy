import { spawn } from 'node:child_process';
import path from 'node:path';
import { fail, isolatedEnv, localUrl, readProfile, root } from './local';

try {
  const profile = readProfile();
  for (const key of ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL']) {
    const url = new URL(profile[key]);
    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error(`${key} debe usar un origen local.`);
    }
  }
  if (!profile.NEXTAUTH_SECRET || profile.NEXTAUTH_SECRET.length < 32) throw new Error('Falta un secreto local de sesión válido.');
  const env = isolatedEnv(profile);
  for (const value of [env.DATABASE_URL!, env.DIRECT_URL || env.DATABASE_URL!]) {
    const url = localUrl(value);
    if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/snipers_dev' || url.username !== 'snipers_local') {
      throw new Error('El arranque requiere la base snipers_dev y el usuario snipers_local de la instancia dedicada 127.0.0.1:55432.');
    }
  }
  if (process.argv.includes('--check')) {
    console.log('Perfil local válido. Bases loopback; servicios externos sin credenciales; Snipers deshabilitado.');
  } else {
    const child = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev'], {
      cwd: root, env, stdio: 'inherit', windowsHide: true,
    });
    child.on('error', () => fail(new Error('No se pudo iniciar Next.js local.')));
    child.on('exit', code => { process.exitCode = code ?? 1; });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
  }
} catch (error) { fail(error); }

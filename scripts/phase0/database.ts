import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { defaultBin, fail, localDir, npmBackup, pgEnv, profilePath, readProfile, runPg, writePrivate } from './local';

const data = path.join(localDir, 'postgres');
const bootstrapFile = path.join(localDir, 'bootstrap.env');
const port = 55432;

async function assertFreePort() {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error('Puerto 55432 ocupado o no disponible; no se reutilizará una instancia desconocida.')));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve()));
  });
}

function profileText(user: string, password: string, database: string, secret: string) {
  const url = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public&sslmode=disable`;
  return `SNIPERS_ENVIRONMENT=local\nPG_BIN="${defaultBin}"\nDATABASE_URL="${url}"\nDIRECT_URL="${url}"\nNEXTAUTH_URL="http://localhost:3000"\nNEXT_PUBLIC_APP_URL="http://localhost:3000"\nNEXTAUTH_SECRET="${secret}"\nENABLE_SINGLE_SESSION=true\nSNIPERS_ENABLED=false\n`;
}

function provision() {
  const databases = ['snipers_dev', 'snipers_backup_source', 'snipers_restore_test'];
  const recoveryFile = path.join(localDir, 'provision-credentials.env');
  const files = [profilePath, recoveryFile, ...databases.slice(1).map(name => path.join(localDir, `${name}.env`))];
  if (files.some(file => fs.existsSync(file))) throw new Error('Ya existen perfiles de provisión. No se sobrescribirán credenciales ni se repetirá una provisión parcial.');
  const bootstrap = readProfile(bootstrapFile);
  const url = new URL(bootstrap.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== String(port) || url.pathname !== '/postgres' ||
      url.username !== 'snipers_bootstrap' || bootstrap.PG_BIN !== defaultBin) {
    throw new Error('La provisión requiere el bootstrap y los binarios de la instancia local dedicada.');
  }
  const env = pgEnv(bootstrap.DATABASE_URL);
  const query = (sql: string) => runPg('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1'], env, defaultBin, sql).trim();
  const server = JSON.parse(query("SELECT json_build_object('data',current_setting('data_directory'),'address',inet_server_addr(),'port',inet_server_port(),'listen',current_setting('listen_addresses'),'version',current_setting('server_version'),'user',current_user);"));
  if (path.resolve(server.data) !== data || server.address !== '127.0.0.1' || server.port !== port ||
      server.listen !== '127.0.0.1' || server.version !== '18.6' || server.user !== 'snipers_bootstrap') {
    throw new Error('Identidad del servidor inesperada. No se crearán roles ni bases.');
  }
  if (query("SELECT (SELECT count(*) FROM pg_roles WHERE rolname='snipers_local') + (SELECT count(*) FROM pg_database WHERE datname IN ('snipers_dev','snipers_backup_source','snipers_restore_test'));") !== '0') {
    throw new Error('Ya existe un rol o una base de trabajo. No se reutilizarán ni modificarán automáticamente.');
  }
  npmBackup(bootstrapFile);
  const appPassword = randomBytes(32).toString('hex');
  const secret = randomBytes(48).toString('base64url');
  // Keep credentials for recovery if PostgreSQL or the process fails between CREATE statements.
  writePrivate(recoveryFile, profileText('snipers_local', appPassword, 'snipers_dev', secret));
  const sql = `CREATE ROLE snipers_local LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${appPassword}';\n` +
    databases.map(name => `CREATE DATABASE ${name} OWNER snipers_local;`).join('\n');
  runPg('psql', ['-X', '-v', 'ON_ERROR_STOP=1'], env, defaultBin, sql);
  writePrivate(profilePath, profileText('snipers_local', appPassword, 'snipers_dev', secret));
  for (const name of databases.slice(1)) {
    writePrivate(path.join(localDir, `${name}.env`), profileText('snipers_local', appPassword, name, secret));
  }
  fs.unlinkSync(recoveryFile);
  npmBackup(profilePath);
  console.log('Instancia aislada preparada en 127.0.0.1:55432. Base de desarrollo vacía; sin modelos ni migraciones.');
}

async function main() {
  const action = process.argv[2];
  if (!['setup', 'provision', 'start', 'stop', 'status'].includes(action)) throw new Error('Uso: npm run db:local -- setup|provision|start|stop|status');
  if (action === 'provision') {
    provision();
    return;
  }
  if (action === 'setup') {
    const resume = process.argv.includes('--resume') && fs.existsSync(bootstrapFile);
    if (fs.existsSync(data) || fs.existsSync(profilePath) || (fs.existsSync(bootstrapFile) && !resume)) {
      throw new Error('Ya existen archivos locales; no se sobrescribirán ni reinicializarán. Usá status/start o revisá el intento anterior.');
    }
    await assertFreePort();
    runPg('initdb', ['--version'], process.env);
    fs.mkdirSync(localDir, { recursive: true });
    const bootstrapPassword = resume ? decodeURIComponent(new URL(readProfile(bootstrapFile).DATABASE_URL).password) : randomBytes(32).toString('hex');
    const secret = randomBytes(48).toString('base64url');
    if (!resume) writePrivate(bootstrapFile, profileText('snipers_bootstrap', bootstrapPassword, 'postgres', secret));
    const passwordFile = path.join(localDir, 'init-password');
    writePrivate(passwordFile, bootstrapPassword);
    try {
      runPg('initdb', ['-D', data, '-U', 'snipers_bootstrap', '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--pwfile', passwordFile], process.env);
    } finally { fs.unlinkSync(passwordFile); }
    runPg('pg_ctl', ['start', '-D', data, '-l', path.join(localDir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '20'], process.env);
    provision();
    return;
  }
  readProfile(bootstrapFile);
  if (!fs.existsSync(path.join(data, 'PG_VERSION'))) throw new Error('La instancia local no está inicializada.');
  if (action === 'start') {
    await assertFreePort();
    runPg('pg_ctl', ['start', '-D', data, '-l', path.join(localDir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '20'], process.env);
  } else if (action === 'stop') {
    runPg('pg_ctl', ['stop', '-D', data, '-m', 'fast', '-w', '-t', '20'], process.env);
  } else {
    // A server started by the normal Windows user may be invisible to pg_ctl in the sandbox.
    // Authenticate over the dedicated local connection instead of relying on process ownership.
    const profile = readProfile();
    const env = pgEnv(profile.DATABASE_URL);
    const status = runPg('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1'], env, defaultBin,
      "SELECT current_database(), inet_server_addr(), inet_server_port(), current_user, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user), current_setting('server_version');\n");
    console.log(status.trim());
  }
}

main().catch(fail);

import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

// Pase para entrar en la terminal de trading (Full Scalping), que vive en otro
// servidor. Lo firma la academia con un secreto que solo conocen los dos
// servidores; la terminal lo verifica y abre su propia sesión.

const TTL_SECONDS = 60;

function getSecret(): string {
  const secret = process.env.TERMINAL_SSO_SECRET;
  // Un secreto corto se adivina: mejor que falle a que firme con algo débil.
  if (!secret || secret.length < 32) {
    throw new Error('TERMINAL_SSO_SECRET no está configurado (mínimo 32 caracteres).');
  }
  return secret;
}

/**
 * Si la terminal está conectada. Sin sus dos variables, todo lo de la terminal
 * queda dormido —ni enlace en el menú ni errores—: así se puede publicar la
 * academia antes que la terminal.
 */
export function isTerminalConfigured(): boolean {
  const secret = process.env.TERMINAL_SSO_SECRET;
  return Boolean(process.env.TERMINAL_URL && secret && secret.length >= 32);
}

export function getTerminalUrl(): string {
  const url = process.env.TERMINAL_URL;
  if (!url) throw new Error('TERMINAL_URL no está configurado.');
  return url.replace(/\/+$/, '');
}

export interface TerminalPassUser {
  id: string;
  email: string;
  name: string | null;
  timezone: string | null;
}

export function signTerminalPass(user: TerminalPassUser): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'terminal',
    sub: user.id,
    email: user.email,
    name: user.name,
    tz: user.timezone,
    iat: now,
    exp: now + TTL_SECONDS,
    // Un solo uso: la terminal apunta este id y rechaza un segundo intento.
    jti: randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export type TerminalStatus = 'ACTIVE' | 'DISABLED' | 'NONE';

/**
 * Si el usuario tiene la terminal activada: lo sabe la terminal, no la academia.
 * Nulo si no responde a tiempo; el perfil tiene que cargar igual.
 */
export async function terminalStatusOf(userId: string): Promise<TerminalStatus | null> {
  if (!isTerminalConfigured()) return null;
  try {
    // Un valor derivado distinto del de la lista de alumnos: uno filtrado no sirve para lo otro.
    const bearer = createHmac('sha256', getSecret()).update('terminal-status').digest('base64url');
    const response = await fetch(`${getTerminalUrl()}/api/academy/terminal-status/${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${bearer}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    const { status } = (await response.json()) as { status?: string };
    return status === 'ACTIVE' || status === 'DISABLED' || status === 'NONE' ? status : null;
  } catch {
    return null;
  }
}

/**
 * Para el endpoint que consulta la terminal. La cabecera lleva un valor derivado
 * del secreto, no el secreto: si acabara en un log, no serviría para firmar pases.
 */
export function isTerminalRequest(authorization: string | null): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const given = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(
    createHmac('sha256', getSecret()).update('terminal-students').digest('base64url'),
  );
  return given.length === expected.length && timingSafeEqual(given, expected);
}

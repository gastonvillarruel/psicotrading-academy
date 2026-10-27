import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { termsSchema, type CoverageTerms, parse } from './contracts';
import { reject } from './errors';

// Only normalized, explicitly selected command fields reach this function.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

export function previewKey(secret: string | undefined): Buffer {
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32 || secret.trim() !== secret || /[\r\n\0]/.test(secret)) {
    reject('CONFIGURATION', 'Configuración de firma de Snipers inválida.');
  }
  return Buffer.from(hkdfSync('sha256', secret, 'psicoemotrading/snipers', 'phase2/coverage-preview/v1', 32));
}

const envelope = z.object({ v: z.literal(1), actor: z.string().length(64), command: z.string().length(64), terms: termsSchema }).strict();

export function signPreview(key: Buffer, actorId: string, command: unknown, terms: CoverageTerms): string {
  const data = Buffer.from(canonical({ v: 1, actor: digest(actorId), command: digest(command), terms })).toString('base64url');
  return `${data}.${createHmac('sha256', key).update(data).digest('base64url')}`;
}

export function verifyPreview(key: Buffer, actorId: string, command: unknown, token: unknown): CoverageTerms {
  if (typeof token !== 'string' || token.length > 8000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) reject('VALIDATION', 'Previsualización inválida.');
  const [data, signature] = token.split('.');
  const actual = Buffer.from(signature, 'base64url');
  const expected = createHmac('sha256', key).update(data).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) reject('VALIDATION', 'Previsualización inválida.');
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')); }
  catch { reject('VALIDATION', 'Previsualización inválida.'); }
  const value = parse(envelope, decoded);
  if (value.actor !== digest(actorId) || value.command !== digest(command)) reject('VALIDATION', 'La previsualización no corresponde a la operación.');
  return value.terms;
}

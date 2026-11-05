import { z } from 'zod';
import { paymentSchema, courtesySchema, planChangeSchema, stateSchema, voidPaymentSchema, voidCourtesySchema, termsSchema } from './contracts';

const preview = z.object({ terms: termsSchema, token: z.string().min(1).max(8000) }).strict();
const base = { owner: z.uuid(), createdAt: z.number().finite() };
export const intentSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('payment'), command: paymentSchema, preview }).strict(),
  z.object({ ...base, kind: z.literal('courtesy'), command: courtesySchema, preview }).strict(),
  z.object({ ...base, kind: z.literal('plan'), command: planChangeSchema }).strict(),
  z.object({ ...base, kind: z.literal('state'), command: stateSchema }).strict(),
  z.object({ ...base, kind: z.literal('voidPayment'), command: voidPaymentSchema }).strict(),
  z.object({ ...base, kind: z.literal('voidCourtesy'), command: voidCourtesySchema }).strict(),
]);
export type PendingIntent = z.output<typeof intentSchema>;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
const prefix = 'psico.snipers.intent.v1:';
const markerPrefix = 'psico.snipers.pending.v1:';
const markerSchema = z.object({ owner: z.uuid(), membershipId: z.uuid(), operationId: z.uuid() }).strict();
export type PendingMarker = z.output<typeof markerSchema>;
const key = (owner: string, membership: string) => `${prefix}${owner}:${membership}`;
const markerKey = (owner: string, membership: string) => `${markerPrefix}${owner}:${membership}`;
export function markPending(storage: Storage, intent: PendingIntent) {
  const marker = markerSchema.parse({ owner: intent.owner, membershipId: intent.command.membershipId, operationId: intent.command.operationId });
  storage.setItem(markerKey(marker.owner, marker.membershipId), JSON.stringify(marker));
}
export function readPending(storage: Storage, owner: string, membership: string): PendingMarker | null {
  const name = markerKey(owner, membership); const raw = storage.getItem(name);
  if (!raw) return null;
  try {
    const value = markerSchema.parse(JSON.parse(raw));
    if (value.owner !== owner || value.membershipId !== membership) throw new Error('Invalid marker');
    return value;
  } catch { storage.removeItem(name); return null; }
}
export function clearPending(storage: Storage, owner: string, membership: string) { storage.removeItem(markerKey(owner, membership)); }
// No commercial payload survives logout/identity changes. Minimal markers do not expire:
// absence of a receipt (or expiration of a browser payload) cannot prove rollback.
export function scrubIntents(storage: Storage, currentOwner: string | null = null, now = Date.now()) {
  let failure: unknown;
  for (let i = storage.length - 1; i >= 0; i--) {
    const name = storage.key(i);
    if (!name?.startsWith(prefix)) continue;
    let value: PendingIntent;
    try {
      value = intentSchema.parse(JSON.parse(storage.getItem(name) ?? 'null'));
      if (name !== key(value.owner, value.command.membershipId)) throw new Error('Invalid intent');
    } catch { storage.removeItem(name); continue; }
    if (value.owner === currentOwner && value.createdAt <= now && now - value.createdAt <= 86400000) continue;
    try { markPending(storage, value); } catch (error) { failure = error; }
    finally { storage.removeItem(name); }
  }
  if (failure) throw failure;
}
export const accessDenied = (code: string) => ['FORBIDDEN', 'SESSION', 'DISABLED', 'CONFIGURATION', 'IDEMPOTENCY_CONFLICT'].includes(code);
// These domain rejections occur after Phase 2's authorized receipt lookup. Parse
// failures and integrity/idempotency errors cannot establish the previous outcome.
export const definitiveRejection = (code: string) => ['NOT_FOUND', 'STALE', 'OVERLAP', 'DUPLICATE_REFERENCE', 'INVALID_STATE'].includes(code);
export function readIntent(storage: Storage, owner: string, membership: string, now = Date.now()): PendingIntent | null {
  for (let i = storage.length - 1; i >= 0; i--) {
    const name = storage.key(i);
    if (!name?.startsWith(prefix)) continue;
    try {
      const value = intentSchema.parse(JSON.parse(storage.getItem(name) ?? 'null'));
      if (value.owner !== owner || name !== key(value.owner, value.command.membershipId) || value.createdAt > now || now - value.createdAt > 86400000) throw new Error('Invalid intent');
    } catch { storage.removeItem(name); }
  }
  const name = key(owner, membership); const raw = storage.getItem(name);
  if (!raw) return null;
  try {
    const value = intentSchema.parse(JSON.parse(raw));
    if (value.owner !== owner || value.command.membershipId !== membership || value.createdAt > now || now - value.createdAt > 86400000) throw new Error('Invalid intent');
    return value;
  } catch { storage.removeItem(name); return null; }
}
export function saveIntent(storage: Storage, value: PendingIntent) {
  const intent = intentSchema.parse(value);
  storage.setItem(key(intent.owner, intent.command.membershipId), JSON.stringify(intent));
}
export function clearIntent(storage: Storage, owner: string, membership: string) { storage.removeItem(key(owner, membership)); }

import { z } from 'zod';
import { reject } from './errors';

export const id = z.uuid();
export const cents = z.number().int().positive().max(2147483647);
export const version = z.number().int().positive().max(2147483647);
export const instant = z.iso.datetime({ precision: 3 });
export const reason = z.string().trim().min(1).max(1000);
const optionalText = (max: number) => z.string().trim().max(max).transform(v => v || null).nullable().default(null);
const base = { operationId: id, membershipId: id, expectedVersion: version };

export const createSchema = z.object({ operationId: id, userId: id, planId: id }).strict();
export const paymentSchema = z.object({ ...base, periods: z.number().int().min(1).max(3),
  receivedCents: cents, exceptionReason: optionalText(1000), method: z.string().trim().min(1).max(100),
  reference: optionalText(200), paidAt: instant, startsAt: instant.nullable().default(null),
  dateReason: optionalText(1000), replacesPaymentId: id.nullable().default(null) }).strict();
export const courtesySchema = z.object({ ...base, planId: id, startsAt: instant.nullable().default(null),
  endsAt: instant, reason, dateReason: optionalText(1000), replacesCoverageId: id.nullable().default(null) }).strict();
export const planChangeSchema = z.object({ ...base, planId: id, reason }).strict();
export const stateSchema = z.object({ ...base, status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']), reason }).strict();
export const voidPaymentSchema = z.object({ ...base, paymentId: id, reason }).strict();
export const voidCourtesySchema = z.object({ ...base, coverageId: id, reason }).strict();
export const pageSchema = z.object({ offset: z.number().int().min(0).max(1000000).default(0),
  limit: z.number().int().min(1).max(100).default(25) }).strict();

export type PaymentCommand = z.output<typeof paymentSchema>;
export type CourtesyCommand = z.output<typeof courtesySchema>;
export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export type OperationKind = 'CREATE' | 'PAYMENT' | 'COURTESY' | 'PLAN' | 'STATE' | 'VOID_PAYMENT' | 'VOID_COURTESY';
export type OperationResult = { operationId: string; membershipId: string; version: number;
  paymentId?: string; coverageIds?: string[]; status?: MembershipStatus; changed?: boolean };
export type Receipt = { result: OperationResult; replayed: boolean; confirmedAt: string };

export const termsSchema = z.object({ planId: id, planVersion: version, planName: z.string(),
  unitPriceCents: cents, unitDurationDays: z.number().int().positive().max(2147483647),
  active: z.boolean(), startsAt: instant, endsAt: instant, listTotalCents: cents.nullable(),
  allocatedCents: z.array(z.number().int().nonnegative().max(2147483647)).max(3),
  previewedAt: instant }).strict();
export type CoverageTerms = z.output<typeof termsSchema>;
export type Preview = { terms: CoverageTerms; token: string };

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) reject('VALIDATION', 'Datos de Snipers inválidos.');
  return result.data;
}

export function splitCents(received: number, periods: number): number[] {
  parse(cents, received);
  parse(z.number().int().min(1).max(3), periods);
  return Array.from({ length: periods }, (_, i) => Math.floor(received / periods) + (i < received % periods ? 1 : 0));
}

export function addDays(start: string, days: number): string {
  const value = Date.parse(start) + days * 86400000;
  if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) reject('VALIDATION', 'Fecha fuera de rango.');
  const result = new Date(value).toISOString();
  parse(instant, result);
  return result;
}

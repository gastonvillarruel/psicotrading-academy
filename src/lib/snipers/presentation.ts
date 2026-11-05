import { localToUTC, utcToLocalString } from '../timezone';

export const zone = 'America/Argentina/Buenos_Aires';
export function localInput(value: string): string {
  const d = new Date(value);
  const [day, time] = utcToLocalString(value, zone).split('T');
  const [hour, minute] = time.split(':');
  return `${day}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`;
}
export function inputInstant(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match || Number(match[2] ?? 0) > 59) throw new Error('Fecha inválida.');
  return new Date(localToUTC(match[1], zone).getTime() + Number(match[2] ?? 0) * 1000 + Number((match[3] ?? '').padEnd(3, '0'))).toISOString();
}
export const money = (cents: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', currencyDisplay: 'code' }).format(cents / 100).replace(/[\u00a0\u202f]/g, ' ');
export function date(value: string | null): string {
  if (!value) return 'Sin cobertura';
  const parts = new Intl.DateTimeFormat('es-AR', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === name)!.value;
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}
export const statusLabel = (status: string) => ({ ACTIVE: 'Activa', SUSPENDED: 'Suspendida', CLOSED: 'De baja', REGISTERED: 'Registrado', VOID: 'Anulado', VALID: 'Válida' }[status] ?? status);
export function amountCents(value: string): number {
  if (!/^\d{1,8}([.,]\d{1,2})?$/.test(value.trim())) throw new Error('Ingresá un importe positivo con hasta dos decimales.');
  const [whole, fraction = ''] = value.trim().replace(',', '.').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result <= 0 || result > 2147483647) throw new Error('El importe está fuera de rango.');
  return result;
}

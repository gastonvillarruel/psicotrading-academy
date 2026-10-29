import type { ReactNode } from 'react';
import { statusLabel } from '@/lib/snipers/presentation';

export const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50';
export const buttonClass = 'inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-wait';
export const secondaryClass = 'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
export function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm"><h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2>{children}</section>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;
}
export function Status({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${value === 'ACTIVE' || value === 'VALID' || value === 'REGISTERED' ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-900'}`}>{statusLabel(value)}</span>;
}
export function Notice({ children }: { children: ReactNode }) { return <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{children}</p>; }

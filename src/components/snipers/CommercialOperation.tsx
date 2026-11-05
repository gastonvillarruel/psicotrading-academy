'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as actions from '@/app/actions/snipers';
import type { getAssignablePlans } from '@/lib/snipers/commercial';
import type { getCommercialMembership } from '@/lib/snipers/queries';
import type { PendingIntent } from '@/lib/snipers/pending-intent';
import { accessDenied, clearIntent, clearPending, definitiveRejection, intentSchema, markPending, saveIntent, scrubIntents } from '@/lib/snipers/pending-intent';
import { amountCents, date, money, statusLabel, localInput, inputInstant } from '@/lib/snipers/presentation';
import ConfirmModal from '@/components/admin/ConfirmModal';
import { buttonClass, secondaryClass, inputClass, Panel, Field, Notice } from './ui';

export type Operation = { kind: PendingIntent['kind']; target?: string; status?: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'; startsAt?: string; endsAt?: string; planId?: string; method?: string; reference?: string };
type Props = { owner: string; member: Awaited<ReturnType<typeof getCommercialMembership>>; plans: Awaited<ReturnType<typeof getAssignablePlans>>;
  operation: Operation; recovered?: PendingIntent; onAccessLost: (code: string) => void; onClose: (message?: string) => void | Promise<void> };
const titles = { payment: 'Registrar pago / renovar', courtesy: 'Otorgar o modificar cortesía', plan: 'Cambiar próxima renovación', state: 'Cambiar estado', voidPayment: 'Anular pago', voidCourtesy: 'Revocar cortesía' };

export default function CommercialOperation({ owner, member, plans, operation, recovered, onClose, onAccessLost }: Props) {
  const router = useRouter(); const [pending, start] = useTransition(); const [message, setMessage] = useState('');
  const [intent, setIntent] = useState<PendingIntent | null>(recovered ?? null); const [submitted, setSubmitted] = useState(!!recovered);
  const [confirming, setConfirming] = useState(false);
  const [planId, setPlanId] = useState(operation.planId ?? (operation.kind === 'courtesy' ? plans.find(p => p.active)?.id ?? '' : member.renewalPlan.id));
  const currentPlan = plans.find(p => p.id === member.renewalPlan.id);
  const inactiveCourtesy = operation.kind === 'courtesy' && !plans.some(p => p.id === planId && p.active);
  function checkAccess(code: string) {
    if (!accessDenied(code)) return;
    try { scrubIntents(sessionStorage); } finally { setIntent(null); onAccessLost(code); }
  }
  const field = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
  function build(data: FormData): PendingIntent {
    const base = { operationId: crypto.randomUUID(), membershipId: member.id, expectedVersion: member.version };
    const common = { owner, createdAt: Date.now() };
    const reason = field(data, 'reason');
    if (operation.kind === 'state') return intentSchema.parse({ ...common, kind: 'state', command: { ...base, status: operation.status, reason } });
    if (operation.kind === 'plan') return intentSchema.parse({ ...common, kind: 'plan', command: { ...base, planId, reason } });
    if (operation.kind === 'voidPayment') return intentSchema.parse({ ...common, kind: 'voidPayment', command: { ...base, paymentId: operation.target, reason } });
    if (operation.kind === 'voidCourtesy') return intentSchema.parse({ ...common, kind: 'voidCourtesy', command: { ...base, coverageId: operation.target, reason } });
    throw new Error('La operación requiere propuesta.');
  }
  function review(data: FormData) { start(async () => {
    setMessage('');
    try {
      if (operation.kind !== 'payment' && operation.kind !== 'courtesy') { setIntent(build(data)); return; }
      if (inactiveCourtesy) { setMessage('El plan original está inactivo. Elegí expresamente un plan activo para reemplazar la cortesía.'); return; }
      const starts = field(data, 'startsAt');
      const common = { operationId: crypto.randomUUID(), membershipId: member.id, expectedVersion: member.version,
        startsAt: starts ? inputInstant(starts) : null, dateReason: field(data, 'dateReason') || null };
      if (operation.kind === 'payment') {
        const command = { ...common, periods: Number(field(data, 'periods')), receivedCents: amountCents(field(data, 'amount')),
          method: field(data, 'method'), reference: field(data, 'reference') || null, paidAt: inputInstant(field(data, 'paidAt')),
          exceptionReason: field(data, 'reason') || null, replacesPaymentId: operation.target ?? null };
        const r = await actions.previewSnipersPayment(command);
        if (r.ok) setIntent(intentSchema.parse({ owner, createdAt: Date.now(), kind: 'payment', command, preview: r.data })); else { setMessage(r.message); checkAccess(r.code); }
      } else {
        const command = { ...common, planId, endsAt: inputInstant(field(data, 'endsAt')), reason: field(data, 'reason'), replacesCoverageId: operation.target ?? null };
        const r = await actions.previewSnipersCourtesy(command);
        if (r.ok) setIntent(intentSchema.parse({ owner, createdAt: Date.now(), kind: 'courtesy', command, preview: r.data })); else { setMessage(r.message); checkAccess(r.code); }
      }
    } catch (e) { setMessage(e instanceof Error && !('issues' in e) ? e.message : 'Revisá los datos y completá los motivos requeridos.'); }
  }); }
  async function send(value: PendingIntent) {
    switch (value.kind) {
      case 'payment': return actions.confirmSnipersPayment({ command: value.command, preview: value.preview });
      case 'courtesy': return actions.confirmSnipersCourtesy({ command: value.command, preview: value.preview });
      case 'state': return actions.changeSnipersStatus(value.command);
      case 'plan': return actions.changeSnipersPlan(value.command);
      case 'voidPayment': return actions.voidSnipersPayment(value.command);
      case 'voidCourtesy': return actions.voidSnipersCourtesy(value.command);
    }
  }
  function confirm() { if (!intent || pending) return; setConfirming(false); start(async () => {
    try { saveIntent(sessionStorage, intent); markPending(sessionStorage, intent); } catch { setMessage('No se pudo conservar el intento en este navegador. Habilitá el almacenamiento antes de confirmar.'); return; }
    setSubmitted(true);
    try {
      const r = await send(intent);
      if (r.ok) { clearIntent(sessionStorage, owner, member.id); clearPending(sessionStorage, owner, member.id); await onClose(r.data.replayed ? 'La operación ya estaba confirmada. Se recargó su estado.' : 'Operación confirmada.'); router.refresh(); }
      else {
        setMessage(r.message);
        if (accessDenied(r.code)) {
          checkAccess(r.code);
          return;
        }
        if (definitiveRejection(r.code)) {
          clearIntent(sessionStorage, owner, member.id); clearPending(sessionStorage, owner, member.id); setIntent(null); setSubmitted(false);
          await onClose(r.message); router.refresh();
        } else setMessage('No se pudo determinar el resultado del envío anterior. Conservamos la operación original. Reintentá el mismo envío o solicitá una revisión autorizada antes de registrar otro.');
      }
    } catch { setMessage('El resultado es incierto. Reintentá el mismo envío; no registres otro pago.'); }
  }); }
  const commercial = operation.kind === 'payment' || operation.kind === 'courtesy';
  const summary = intent ? [titles[intent.kind],
    intent.kind === 'payment' || intent.kind === 'courtesy' ? `${intent.preview.terms.planName}\nInicio: ${date(intent.preview.terms.startsAt)}\nFin exclusivo: ${date(intent.preview.terms.endsAt)}` : '',
    intent.kind === 'payment' ? `${intent.command.periods} período(s)\nLista: ${money(intent.preview.terms.listTotalCents!)}\nRecibido: ${money(intent.command.receivedCents)}\n${intent.command.method} · ${intent.command.reference || 'Sin referencia'}\nFecha de pago: ${date(intent.command.paidAt)}\nMotivo: ${intent.command.exceptionReason || 'Precio de lista'}` : '',
    intent.kind === 'courtesy' ? `Sin pago\nMotivo: ${intent.command.reason}` : '',
    intent.kind === 'state' ? `Nuevo estado: ${statusLabel(intent.command.status)}\nMotivo: ${intent.command.reason}` : '',
    intent.kind === 'plan' ? `Próxima renovación: ${plans.find(p => p.id === intent.command.planId)?.name || 'Plan elegido'}\nMotivo: ${intent.command.reason}` : '',
    intent.kind === 'voidPayment' || intent.kind === 'voidCourtesy' ? `Motivo: ${intent.command.reason}\nSe conserva el historial. No se desplazan otras coberturas ni se devuelve dinero.` : '',
    (intent.kind === 'payment' || intent.kind === 'courtesy') && intent.command.startsAt ? `Fecha manual: ${intent.command.dateReason}` : '',
    member.status === 'SUSPENDED' && commercial ? 'Esta operación no levanta la suspensión.' : '',
  ].filter(Boolean).join('\n') : '';
  return <Panel title={titles[operation.kind]}>
    {message && <Notice>{message}</Notice>}
    {submitted && <div className="my-3"><Notice>Hay un envío pendiente de resolver. Reintentar utiliza exactamente la misma operación. Los datos para reintentar se depuran al revisar el almacenamiento después de 24 horas o al salir; la señal mínima de conciliación permanece en esta pestaña hasta resolverlo.</Notice></div>}
    {!intent ? <form action={review} className="space-y-4">
      {operation.kind === 'payment' && <>
        {operation.target && <Notice>Reemplazo explícito del comprobante anulado seleccionado. Debe conservar su método y referencia.</Notice>}
        <p className="text-sm text-slate-600">Plan de renovación: <strong>{member.renewalPlan.name}</strong>. El servidor calcula fechas e importes de lista.</p>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Cantidad de períodos"><select name="periods" className={inputClass} defaultValue="1"><option value="1">1 período</option><option value="2">2 períodos</option><option value="3">3 períodos</option></select></Field><Field label="Importe recibido (USD)"><input name="amount" className={inputClass} inputMode="decimal" required defaultValue={currentPlan ? String(currentPlan.priceCents / 100) : ''} /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Método de pago"><input name="method" className={inputClass} required maxLength={100} placeholder="Transferencia, efectivo…" defaultValue={operation.method} /></Field><Field label="Referencia / comprobante"><input name="reference" className={inputClass} maxLength={200} defaultValue={operation.reference} /></Field></div>
        <Field label="Fecha de pago (hora de Argentina)"><input type="datetime-local" step="0.001" name="paidAt" required className={inputClass} defaultValue={localInput(new Date().toISOString())} /></Field>
        <Field label="Motivo de descuento o importe excepcional"><textarea name="reason" className={inputClass} maxLength={1000} placeholder="Obligatorio si el importe difiere del total de lista" /></Field>
      </>}
      {(operation.kind === 'courtesy' || operation.kind === 'plan') && <Field label={operation.kind === 'plan' ? 'Plan para la próxima renovación no abonada' : 'Plan asociado a la cortesía'}><select name="plan" className={inputClass} value={planId} onChange={e => setPlanId(e.target.value)}>{plans.filter(p => p.active || (operation.kind === 'plan' && p.id === member.renewalPlan.id) || p.id === operation.planId).map(p => <option key={p.id} value={p.id} disabled={operation.kind === 'courtesy' && !p.active}>{p.name}{!p.active ? ' (inactivo)' : ''}</option>)}</select></Field>}
      {inactiveCourtesy && <Notice>El plan original está inactivo. Para modificar esta cortesía tenés que elegir expresamente un plan activo. No se cambió el plan automáticamente.</Notice>}
      {operation.kind === 'courtesy' && <Field label="Fin de cortesía (hora de Argentina, exclusivo)"><input name="endsAt" type="datetime-local" step="0.001" required className={inputClass} defaultValue={operation.endsAt ? localInput(operation.endsAt) : ''} /></Field>}
      {commercial && <details open={!!operation.target && operation.kind === 'courtesy'} className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Inicio manual / fecha excepcional</summary><div className="mt-3 space-y-3"><Field label="Inicio (vacío: automático)"><input name="startsAt" type="datetime-local" step="0.001" required={operation.kind === 'courtesy' && !!operation.target} className={inputClass} defaultValue={operation.startsAt ? localInput(operation.startsAt) : ''} /></Field><Field label="Motivo de fecha manual"><textarea name="dateReason" className={inputClass} maxLength={1000} /></Field></div></details>}
      {!commercial && <Notice>{operation.kind === 'state' ? `Pasará a ${statusLabel(operation.status!)}. No se agregan días ni se recuperan coberturas anuladas.` : operation.kind === 'plan' ? 'El cambio no modifica períodos ya confirmados.' : 'La anulación conserva registros y puede dejar huecos sin acceso.'}</Notice>}
      {operation.kind !== 'payment' && <Field label="Motivo obligatorio"><textarea name="reason" required className={inputClass} maxLength={1000} /></Field>}
      <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={pending || inactiveCourtesy}>Revisar operación</button><button type="button" className={secondaryClass} disabled={pending} onClick={() => onClose()}>Cancelar</button></div>
    </form> : <div className="space-y-4"><p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm leading-relaxed">{summary}</p>
      <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={pending} onClick={() => setConfirming(true)}>{pending ? 'Procesando…' : submitted ? 'Reintentar mismo envío' : 'Confirmar operación'}</button>{!submitted && <button className={secondaryClass} onClick={() => setIntent(null)}>Editar datos</button>}{!submitted && <button className={secondaryClass} onClick={() => onClose()}>Cancelar</button>}</div></div>}
    <ConfirmModal isOpen={confirming} title={submitted ? 'Reintentar el mismo envío' : 'Confirmar operación comercial'} message={summary} onConfirm={confirm} onCancel={() => setConfirming(false)} />
  </Panel>;
}

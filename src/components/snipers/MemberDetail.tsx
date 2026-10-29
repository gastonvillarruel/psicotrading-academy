'use client';
import { useEffect, useState, useTransition } from 'react';
import { getSnipersHistory, getSnipersMember, reconcileSnipersOperation } from '@/app/actions/snipers';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { getAssignablePlans, getHistoryView } from '@/lib/snipers/commercial';
import type { getCommercialMembership } from '@/lib/snipers/queries';
import { accessDenied, clearIntent, clearPending, markPending, readIntent, readPending, scrubIntents, type PendingIntent, type PendingMarker } from '@/lib/snipers/pending-intent';
import { date, money, statusLabel } from '@/lib/snipers/presentation';
import CommercialOperation, { type Operation } from './CommercialOperation';
import { buttonClass, secondaryClass, Panel, Status, Notice } from './ui';

type Summary = Awaited<ReturnType<typeof getCommercialMembership>>;
type History = Awaited<ReturnType<typeof getHistoryView>>;
const eventLabels: Record<string, string> = { MEMBERSHIP_CHANGED: 'Membresía o próxima renovación actualizada', MEMBERSHIP_SUSPENDED: 'Suspensión', MEMBERSHIP_REACTIVATED: 'Reactivación / reapertura', MEMBERSHIP_CLOSED: 'Baja', PAYMENT_REGISTERED: 'Pago registrado', PAYMENT_VOIDED: 'Pago anulado', COVERAGE_CHANGED: 'Cortesía otorgada / modificada', COVERAGE_VOIDED: 'Cortesía revocada' };

export default function MemberDetail({ owner, member: initialMember, identity, plans, initialHistory }: { owner: string; member: Summary; identity: { name: string | null; email: string }; plans: Awaited<ReturnType<typeof getAssignablePlans>>; initialHistory: History }) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [member, setMember] = useState(initialMember);
  const [operation, setOperation] = useState<Operation | null>(null); const [recovered, setRecovered] = useState<PendingIntent | null>(null);
  const [history, setHistory] = useState(initialHistory); const [tab, setTab] = useState<keyof History>('payments');
  const [offsets, setOffsets] = useState({ payments: 0, coverages: 0, events: 0 }); const [pending, start] = useTransition(); const [message, setMessage] = useState('');
  const [marker, setMarker] = useState<PendingMarker | null>(null); const [checked, setChecked] = useState(false); const [accessLost, setAccessLost] = useState<string | null>(null);
  function loseAccess(code: string) {
    try { scrubIntents(sessionStorage); } catch { /* Hide private data even when storage is unavailable. */ }
    setAccessLost(code); setOperation(null); setRecovered(null);
    if (code === 'SESSION') {
      // Finish invalidating the old cookie before presenting a new login, avoiding
      // an in-flight refresh overwriting a freshly issued session cookie.
      void signOut({ redirect: false }).catch(() => undefined).then(() => { router.replace('/login'); router.refresh(); });
    } else if (code !== 'IDEMPOTENCY_CONFLICT') router.refresh();
  }
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      try {
        scrubIntents(sessionStorage, owner);
        const saved = readIntent(sessionStorage, owner, member.id);
        if (saved) markPending(sessionStorage, saved);
        const unresolved = readPending(sessionStorage, owner, member.id);
        if (active) { setMarker(unresolved); setChecked(true); if (saved) { setRecovered(saved); setOperation({ kind: saved.kind }); } }
      }
      catch { if (active) setMessage('No se puede recuperar el almacenamiento de esta pestaña. Consultá el historial antes de repetir una operación incierta.'); }
    });
    return () => { active = false; };
  }, [owner, member.id]);
  function load(nextTab: keyof History, offset: number) { start(async () => {
    const r = await getSnipersHistory({ membershipId: member.id, offset, limit: 15 });
    if (r.ok) { setHistory(previous => ({ ...previous, [nextTab]: r.data[nextTab] })); setTab(nextTab); setOffsets(previous => ({ ...previous, [nextTab]: offset })); }
    else { setMessage(r.message); if (accessDenied(r.code)) loseAccess(r.code); }
  }); }
  function reconcile() { start(async () => {
    if (!marker) return;
    try {
      const r = await reconcileSnipersOperation({ operationId: marker.operationId, membershipId: member.id });
      if (!r.ok) { setMessage(r.message); if (accessDenied(r.code)) loseAccess(r.code); return; }
      if (!r.data.confirmed) { setMessage('Todavía no se encontró el comprobante original. Esto no demuestra que el envío haya fallado. La ficha sigue bloqueada; consultá al supervisor para revisar la operación.'); return; }
      const [fresh, recent] = await Promise.all([getSnipersMember(member.id), getSnipersHistory({ membershipId: member.id, offset: 0, limit: 15 })]);
      if (!fresh.ok || !recent.ok) { const error = !fresh.ok ? fresh : !recent.ok ? recent : null; if (error) { setMessage(error.message); if (accessDenied(error.code)) loseAccess(error.code); } return; }
      clearIntent(sessionStorage, owner, member.id); clearPending(sessionStorage, owner, member.id);
      setMember(fresh.data); setHistory(recent.data); setOffsets({ payments: 0, coverages: 0, events: 0 }); setMarker(null); setRecovered(null); setOperation(null); setMessage('Operación original conciliada. No se registró un nuevo pago.');
    } catch { setMessage('No se pudo conciliar. La operación sigue pendiente; no registres otro pago.'); }
  }); }
  if (accessLost || sessionStatus !== 'authenticated' || session?.user?.id !== owner) return <div className="space-y-4"><Notice>{accessLost === 'IDEMPOTENCY_CONFLICT' ? 'La operación no coincide con la cuenta activa o con el envío original. La señal original se conserva para conciliar con la cuenta que inició el envío. Si no se puede conciliar, solicitá una revisión autorizada.' : 'La sesión o los permisos deben verificarse nuevamente. Volvé a ingresar para conciliar la operación pendiente.'}</Notice><Link href="/mi-campus/snipers/gestion/alumnos" className={secondaryClass}>Volver al listado de alumnos</Link></div>;
  const closed = member.status === 'CLOSED';
  function choose(value: Operation) { if (!operation && !pending && checked && !marker) { setOperation(value); setMessage(''); } }
  return <div className="space-y-5">
    {(!checked || (marker && !recovered)) && <Panel title="Conciliación pendiente"><Notice>{!checked ? 'Verificando operaciones pendientes en esta pestaña…' : 'Existe un envío anterior sin resolver. No se puede iniciar otra operación en esta ficha hasta conciliarlo con sesión y permisos vigentes.'}</Notice>{marker && <button className={`${buttonClass} mt-3`} disabled={pending} onClick={reconcile}>Conciliar operación original</button>}</Panel>}
    <Panel title={identity.name || 'Ficha del alumno'}><p className="break-all text-sm text-slate-500">{identity.email}</p><div className="mt-4 flex flex-wrap gap-3"><Status value={member.status} /><span className="text-sm text-slate-600">{member.currentCoverage ? `Cobertura actual: ${member.currentCoverage.planName}` : 'Sin cobertura actual'}</span></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fin de cobertura registrada</p><p className="mt-1 font-semibold">{date(member.expiresAt)}</p><p className="mt-1 text-xs text-slate-500">Las coberturas futuras pueden dejar huecos sin acceso.</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Próxima renovación no abonada</p><p className="mt-1 font-semibold">{member.renewalPlan.name}{!member.renewalPlan.active ? ' (inactivo, renovable)' : ''}</p></div></div>
      <div className="mt-5 flex flex-wrap gap-2"><button className={buttonClass} disabled={closed || !!operation || pending || !checked || !!marker} onClick={() => choose({ kind: 'payment' })}>Registrar pago / renovar</button><button className={secondaryClass} disabled={closed || !!operation || pending || !checked || !!marker} onClick={() => choose({ kind: 'courtesy' })}>Otorgar cortesía</button><button className={secondaryClass} disabled={!!operation || pending || !checked || !!marker} onClick={() => choose({ kind: 'plan' })}>Cambiar próxima renovación</button></div>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-slate-600">Estado de la membresía</summary><div className="mt-3 flex flex-wrap gap-2">{member.status !== 'ACTIVE' && <button className={secondaryClass} disabled={!!operation || pending || !checked || !!marker} onClick={() => choose({ kind: 'state', status: 'ACTIVE' })}>{closed ? 'Reabrir membresía' : 'Reactivar membresía'}</button>}{member.status === 'ACTIVE' && <button className={secondaryClass} disabled={!!operation || pending || !checked || !!marker} onClick={() => choose({ kind: 'state', status: 'SUSPENDED' })}>Suspender membresía</button>}{!closed && <button className={secondaryClass} disabled={!!operation || pending || !checked || !!marker} onClick={() => choose({ kind: 'state', status: 'CLOSED' })}>Dar de baja</button>}</div><p className="mt-2 text-xs text-slate-500">Suspender no congela días. Reabrir no agrega cobertura.</p></details>
    </Panel>
    {message && <Notice>{message}</Notice>}
    {operation && <CommercialOperation key={`${operation.kind}:${operation.target ?? ''}:${operation.status ?? ''}`} owner={owner} member={member} plans={plans} operation={operation} recovered={recovered ?? undefined} onAccessLost={loseAccess} onClose={async notice => {
      const [fresh, recent] = await Promise.all([getSnipersMember(member.id), getSnipersHistory({ membershipId: member.id, offset: offsets[tab], limit: 15 })]);
      if (fresh.ok && recent.ok) { setMember(fresh.data); setHistory(previous => ({ ...previous, [tab]: recent.data[tab] })); setOperation(null); setRecovered(null); setMarker(readPending(sessionStorage, owner, member.id)); if (notice) setMessage(notice); }
      else { const error = !fresh.ok ? fresh : !recent.ok ? recent : null; if (error) { setMessage(error.message); if (accessDenied(error.code)) loseAccess(error.code); } }
    }} />}
    <Panel title="Coberturas actuales y futuras"><div className="space-y-3">{[...(member.currentCoverage ? [member.currentCoverage] : []), ...member.futureCoverages].map(c => <div key={c.id} className="rounded-xl border border-slate-200 p-3 text-sm"><p className="font-semibold">{c.planName} · {c.origin === 'PAID' ? 'Pagada' : 'Cortesía'}</p><p className="mt-1 text-slate-600">{date(c.startsAt)} → {date(c.endsAt)} (fin exclusivo)</p></div>)}{!member.currentCoverage && !member.futureCoverages.length && <p className="text-sm text-slate-500">No hay cobertura actual ni futura confirmada.</p>}</div></Panel>
    <Panel title="Historial comercial">
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Historial">{([['payments', 'Pagos'], ['coverages', 'Coberturas'], ['events', 'Auditoría']] as const).map(([key, label]) => <button role="tab" aria-selected={tab === key} className={tab === key ? buttonClass : secondaryClass} disabled={pending} key={key} onClick={() => load(key, offsets[key])}>{label}</button>)}</div>
      <div aria-live="polite" className="space-y-3">
        {tab === 'payments' && history.payments.map(p => <article key={p.id} className="rounded-xl border border-slate-200 p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{p.planName} · {p.periods} período(s)</strong><Status value={p.status} /></div><p className="mt-2">Recibido: <strong>{money(p.receivedCents)}</strong> · Lista: {money(p.listTotalCents)}</p>{p.listTotalCents !== p.receivedCents && <p>{p.receivedCents < p.listTotalCents ? 'Descuento' : 'Diferencia adicional'}: {money(Math.abs(p.receivedCents - p.listTotalCents))} · {p.exceptionReason}</p>}<p className="mt-1 text-slate-500">{date(p.paidAt)} · {p.method} · {p.reference || 'Sin referencia'} · {p.operator}</p>{p.voidReason && <p className="mt-2">Anulación: {p.voidReason}</p>}<div className="mt-3">{p.status === 'REGISTERED' ? <button className={secondaryClass} disabled={!!operation || pending || !checked || !!marker} onClick={() => choose({ kind: 'voidPayment', target: p.id })}>Anular pago</button> : <button className={secondaryClass} disabled={closed || !!operation || pending || !checked || !!marker} onClick={() => choose({ kind: 'payment', target: p.id, method: p.method, reference: p.reference })}>Registrar reemplazo</button>}</div></article>)}
        {tab === 'coverages' && history.coverages.map(c => <article key={c.id} className="rounded-xl border border-slate-200 p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{c.origin === 'COURTESY' ? 'Cortesía' : 'Cobertura pagada'}</strong><Status value={c.status} /></div><p className="mt-2">{date(c.startsAt)} → {date(c.endsAt)} (fin exclusivo)</p>{c.reason && <p className="mt-2">{c.reason}</p>}{c.voidReason && <p>Anulación: {c.voidReason}</p>}{c.origin === 'COURTESY' && c.status === 'VALID' && <div className="mt-3 flex flex-wrap gap-2"><button className={secondaryClass} disabled={closed || !!operation || pending || !checked || !!marker} onClick={() => choose({ kind: 'courtesy', target: c.id, planId: c.planId, startsAt: c.startsAt, endsAt: c.endsAt })}>Modificar cortesía</button><button className={secondaryClass} disabled={!!operation || pending || !checked || !!marker} onClick={() => choose({ kind: 'voidCourtesy', target: c.id })}>Revocar cortesía</button></div>}</article>)}
        {tab === 'events' && history.events.map(e => <article key={e.id} className="rounded-xl border border-slate-200 p-4 text-sm"><p className="font-semibold">{eventLabels[e.action] || 'Operación comercial'}</p><p className="mt-1 text-slate-500">{date(e.createdAt)} · {e.actor}</p>{e.reason && <p className="mt-2">{e.reason}</p>}{e.previousPlan !== e.nextPlan && <p className="mt-2">{e.previousPlan || 'Sin plan anterior'} → {e.nextPlan}</p>}{e.previousStatus !== e.nextStatus && <p>{e.previousStatus ? statusLabel(e.previousStatus) : 'Alta'} → {statusLabel(e.nextStatus)}</p>}</article>)}
        {!history[tab].length && <p className="text-sm text-slate-500">No hay registros en esta página.</p>}
      </div>
      <div className="mt-5 flex items-center justify-between"><button className={secondaryClass} disabled={pending || offsets[tab] === 0} onClick={() => load(tab, Math.max(0, offsets[tab] - 15))}>Anterior</button><span className="text-xs text-slate-500">Página {offsets[tab] / 15 + 1}</span><button className={secondaryClass} disabled={pending || history[tab].length < 15} onClick={() => load(tab, offsets[tab] + 15)}>Siguiente</button></div>
    </Panel>
  </div>;
}

'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { createSnipersMembership, listSnipersMembers, searchSnipersUsers } from '@/app/actions/snipers';
import type { getAssignablePlans, listMemberships } from '@/lib/snipers/commercial';
import { date, money } from '@/lib/snipers/presentation';
import ConfirmModal from '@/components/admin/ConfirmModal';
import { buttonClass, secondaryClass, inputClass, Panel, Field, Status, Notice } from './ui';

type Plans = Awaited<ReturnType<typeof getAssignablePlans>>;
type Rows = Awaited<ReturnType<typeof listMemberships>>;
type User = Extract<Awaited<ReturnType<typeof searchSnipersUsers>>, { ok: true }>['data'][number];
export default function MemberList({ initial, plans }: { initial: Rows; plans: Plans }) {
  const [rows, setRows] = useState(initial); const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState(''); const [status, setStatus] = useState(''); const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState(''); const [pending, start] = useTransition();
  const [selected, setSelected] = useState<User | null>(null); const [planId, setPlanId] = useState(plans.find(p => p.active)?.id ?? '');
  const [operationId, setOperationId] = useState('');
  const [reviewing, setReviewing] = useState(false);
  function load(next: number) { start(async () => {
    const r = await listSnipersMembers({ email: query, status: status || null, offset: next, limit: 20 });
    if (r.ok) { setRows(r.data); setOffset(next); setUsers([]); } else setMessage(r.message);
  }); }
  function search() { start(async () => {
    setMessage(''); const r = await searchSnipersUsers({ email: query, offset: 0, limit: 20 });
    if (r.ok) { setUsers(r.data); if (!r.data.length) setMessage('No hay usuarios con ese correo. El alumno debe registrarse primero.'); } else setMessage(r.message);
  }); }
  function create() { if (!selected) return; start(async () => {
    const r = await createSnipersMembership({ operationId, userId: selected.id, planId });
    if (r.ok) { window.location.assign(`/mi-campus/snipers/gestion/alumnos/${r.data.result.membershipId}`); }
    else { setMessage(r.message); if (r.code !== 'UNAVAILABLE' && r.code !== 'CONCURRENT') setSelected(null); }
  }); }
  return <div className="space-y-5">
    <Panel title="Alumnos de Snipers">
      <form onSubmit={e => { e.preventDefault(); load(0); }} className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <Field label="Buscar por correo"><input className={inputClass} value={query} onChange={e => setQuery(e.target.value)} placeholder="Correo completo o parcial" maxLength={254} /></Field>
        <Field label="Estado administrativo"><select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option><option value="ACTIVE">Activa</option><option value="SUSPENDED">Suspendida</option><option value="CLOSED">De baja</option></select></Field>
        <button className={`${buttonClass} self-end`} disabled={pending}>Buscar membresías</button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className={secondaryClass} disabled={pending || query.trim().length < 3} onClick={search}>Buscar usuario para alta</button><span className="text-xs text-slate-500">Al menos 3 caracteres del correo.</span></div>
      {message && <div className="mt-3"><Notice>{message}</Notice></div>}
      {users.length > 0 && <div className="mt-5 space-y-2" aria-label="Usuarios encontrados">{users.map(u => <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="font-semibold">{u.name || 'Alumno'}</p><p className="break-all text-sm text-slate-600">{u.email}</p></div>{u.membershipId ? <Link className={secondaryClass} href={`/mi-campus/snipers/gestion/alumnos/${u.membershipId}`}>Ver ficha</Link> : <button className={buttonClass} onClick={() => { setSelected(u); setOperationId(crypto.randomUUID()); }}>Crear membresía</button>}</div>)}</div>}
    </Panel>
    <Panel title="Membresías registradas">
      {!rows.length ? <p className="text-sm text-slate-500">No hay membresías para esta búsqueda.</p> : <div className="divide-y divide-slate-100">{rows.map(r => <article key={r.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="font-semibold text-slate-900">{r.name || 'Alumno'}</p><p className="break-all text-sm text-slate-500">{r.email}</p><p className="mt-2 text-sm text-slate-700">{r.currentPlanName ? `Cobertura actual: ${r.currentPlanName}` : 'Sin cobertura actual'} · Fin registrado: {date(r.expiresAt)}</p></div><div className="flex items-center gap-3"><Status value={r.status} /><Link className={secondaryClass} href={`/mi-campus/snipers/gestion/alumnos/${r.id}`}>Ver ficha</Link></div></article>)}</div>}
      <div className="mt-5 flex items-center justify-between"><button className={secondaryClass} disabled={pending || offset === 0} onClick={() => load(Math.max(0, offset - 20))}>Anterior</button><span className="text-xs text-slate-500">Página {offset / 20 + 1}</span><button className={secondaryClass} disabled={pending || rows.length < 20} onClick={() => load(offset + 20)}>Siguiente</button></div>
    </Panel>
    {selected && <Panel title={`Alta de ${selected.name || selected.email}`}><Field label="Plan de próxima renovación"><select aria-label="Plan para alta" className={inputClass} value={planId} disabled={pending || reviewing} onChange={e => setPlanId(e.target.value)}>{plans.filter(p => p.active).map(p => <option value={p.id} key={p.id}>{p.name} · {money(p.priceCents)} / {p.durationDays} días</option>)}</select></Field><p className="mt-3 text-sm text-slate-600">Crear la membresía no concede cobertura. Después registrá un pago o una cortesía.</p><div className="mt-4 flex gap-3"><button className={buttonClass} disabled={pending || !planId} onClick={() => setReviewing(true)}>Revisar alta</button><button className={secondaryClass} disabled={pending} onClick={() => setSelected(null)}>Cancelar</button></div><ConfirmModal isOpen={reviewing} title="Crear membresía" message={`${selected.email}\n${plans.find(p => p.id === planId)?.name ?? ''}\nSe creará sin cobertura. ${pending ? 'Procesando…' : ''}`} onConfirm={() => { if (!pending && planId) create(); }} onCancel={() => { if (!pending) setReviewing(false); }} /></Panel>}
  </div>;
}

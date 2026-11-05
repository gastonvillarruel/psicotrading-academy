'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSnipersPermissions, getSnipersSupervisionHistory, searchSnipersUsers, setSnipersPermission, updateSnipersPlan } from '@/app/actions/snipers';
import type { getCatalog, getSupervisionHistory } from '@/lib/snipers/commercial';
import { amountCents, money, date } from '@/lib/snipers/presentation';
import ConfirmModal from '@/components/admin/ConfirmModal';
import { buttonClass, secondaryClass, inputClass, Panel, Field, Notice } from './ui';

type Plans = Awaited<ReturnType<typeof getCatalog>>;
type User = Extract<Awaited<ReturnType<typeof searchSnipersUsers>>, { ok: true }>['data'][number];
const permissions = [['SNIPERS_MEMBERSHIP_MANAGER', 'Gestión comercial'], ['SNIPERS_CONTENT_EDITOR', 'Edición académica'], ['SNIPERS_ADMIN', 'Supervisión de Snipers']] as const;
const catalogLabels = { name: 'Nombre', priceCents: 'Precio', durationDays: 'Duración', active: 'Estado', sortOrder: 'Orden' };
function catalogValue(field: string, value: string | number | boolean) {
  if (field === 'priceCents') return money(Number(value));
  if (field === 'active') return value ? 'Activo' : 'Inactivo';
  return field === 'durationDays' ? `${value} días` : String(value);
}
export default function Supervision({ initial, initialHistory }: { initial: Plans; initialHistory: Awaited<ReturnType<typeof getSupervisionHistory>> }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [message, setMessage] = useState('');
  const [edit, setEdit] = useState<Plans[number] | null>(null); const [query, setQuery] = useState(''); const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null); const [grants, setGrants] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<{ message: string; perform: () => Promise<void> } | null>(null);
  const [history, setHistory] = useState(initialHistory); const [offset, setOffset] = useState(0);
  async function refreshAudit(next = 0) { const r = await getSnipersSupervisionHistory({ offset: next, limit: 15 }); if (r.ok) { setHistory(r.data); setOffset(next); } else setMessage(r.message); }
  function save(data: FormData) {
    if (!edit) return;
    try {
      const command = { planId: edit.id, expectedVersion: edit.version, name: String(data.get('name')).trim(), priceCents: amountCents(String(data.get('price'))), durationDays: Number(data.get('duration')), active: data.get('active') === 'on', sortOrder: Number(data.get('order')), reason: String(data.get('reason')).trim() };
      setConfirmation({ message: `${command.name}\n${money(command.priceCents)} / ${command.durationDays} días\n${command.active ? 'Activo' : 'Inactivo'}\nLos pagos y coberturas existentes no cambian.\nMotivo: ${command.reason}`, perform: async () => {
        const r = await updateSnipersPlan(command); if (r.ok) { setEdit(null); setMessage('Plan actualizado.'); } else { setMessage(r.message); if (r.code === 'STALE') setEdit(null); }
        await refreshAudit(); router.refresh();
      } });
    } catch { setMessage('Revisá el importe del plan.'); }
  }
  function select(user: User) { start(async () => {
    setSelected(null); const r = await getSnipersPermissions(user.id);
    if (r.ok) { setSelected(user); setGrants(r.data); } else setMessage(r.message);
  }); }
  function toggle(permission: string, label: string) {
    if (!selected) return; const user = selected; const grant = !grants.includes(permission);
    setConfirmation({ message: `${grant ? 'Conceder' : 'Revocar'}: ${label}\n${user.email}\nNo modifica roles globales.`, perform: async () => {
      const r = await setSnipersPermission({ userId: user.id, permission, grant });
      if (!r.ok) setMessage(r.message); else { setMessage('Permisos actualizados.'); const current = await getSnipersPermissions(user.id); if (current.ok) setGrants(current.data); }
      await refreshAudit(); router.refresh();
    } });
  }
  return <div className="space-y-5">{message && <Notice>{message}</Notice>}
    <Panel title="Planes comerciales"><p className="mb-4 text-sm text-slate-500">Los tres planes otorgan el mismo acceso académico. Desactivar un plan no impide renovar a quienes ya lo tienen asignado.</p><div className="grid gap-4 md:grid-cols-3">{initial.map(p => <article className="rounded-xl border border-slate-200 p-4" key={p.id}><p className="text-sm font-semibold">{p.name}</p><p className="my-3 text-xl font-bold">{money(p.priceCents)}</p><p className="mb-4 text-sm text-slate-500">{p.durationDays} días · {p.active ? 'Activo' : 'Inactivo'}</p><button className={secondaryClass} disabled={pending} onClick={() => setEdit(p)}>Editar {p.name}</button></article>)}</div>
      {edit && <form key={edit.id} action={save} className="mt-5 space-y-4 rounded-xl bg-slate-50 p-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre"><input className={inputClass} name="name" required maxLength={100} defaultValue={edit.name} /></Field><Field label="Precio (USD)"><input className={inputClass} name="price" required inputMode="decimal" defaultValue={String(edit.priceCents / 100)} /></Field><Field label="Duración en días"><input className={inputClass} name="duration" required type="number" min="1" max="2147483647" defaultValue={edit.durationDays} /></Field><Field label="Orden"><input className={inputClass} name="order" required type="number" min="0" max="1000" defaultValue={edit.sortOrder} /></Field></div><label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={edit.active} />Plan activo para nuevas asignaciones</label><Field label="Motivo del cambio"><textarea name="reason" className={inputClass} required maxLength={1000} /></Field><div className="flex gap-3"><button className={buttonClass} disabled={pending}>Revisar cambio</button><button type="button" className={secondaryClass} onClick={() => setEdit(null)}>Cancelar</button></div></form>}
    </Panel>
    <Panel title="Permisos exclusivos de Snipers"><form onSubmit={e => { e.preventDefault(); start(async () => { const r = await searchSnipersUsers({ email: query, limit: 20, offset: 0 }); if (r.ok) { setUsers(r.data); if (!r.data.length) setMessage('No se encontraron usuarios.'); } else setMessage(r.message); }); }} className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><Field label="Correo del usuario"><input className={inputClass} value={query} onChange={e => setQuery(e.target.value)} minLength={3} maxLength={254} required /></Field></div><button className={buttonClass} disabled={pending}>Buscar usuario</button></form>
      <div className="mt-4 space-y-2">{users.map(u => <button key={u.id} className={`${secondaryClass} mr-2 break-all text-left`} disabled={pending} onClick={() => select(u)}>{u.name || 'Usuario'} · {u.email}</button>)}</div>
      {selected && <div className="mt-5 space-y-3 rounded-xl border border-slate-200 p-4"><p className="break-all font-semibold">{selected.email}</p><p className="text-sm text-slate-500">Supervisión incluye gestión comercial y edición. Revocar una concesión explícita no elimina capacidades implícitas.</p>{permissions.map(([permission, label]) => <div key={permission} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className="text-sm">{label}{grants.includes(permission) ? ' · Concesión activa' : grants.includes('SNIPERS_ADMIN') && permission !== 'SNIPERS_ADMIN' ? ' · Incluido por supervisión' : ' · Sin concesión explícita'}</span><button className={secondaryClass} disabled={pending} onClick={() => toggle(permission, label)}>{grants.includes(permission) ? 'Revocar' : 'Conceder'} {label}</button></div>)}</div>}
    </Panel>
    <Panel title="Auditoría de supervisión"><div className="space-y-3">{history.map(e => <article key={e.id} className="rounded-xl border border-slate-200 p-3 text-sm"><p className="font-semibold">{e.action === 'PLAN_CHANGED' ? 'Plan actualizado' : e.action === 'PERMISSION_GRANTED' ? 'Permiso concedido' : 'Permiso revocado'} · {e.target}</p><p className="mt-1 text-slate-500">{date(e.createdAt)} · {e.actor}</p>{e.permission && <p>{permissions.find(p => p[0] === e.permission)?.[1] ?? 'Permiso de Snipers'}</p>}{e.changes.map(c => <p key={c.field}>{catalogLabels[c.field]}: {catalogValue(c.field, c.before)} → {catalogValue(c.field, c.after)}</p>)}{e.reason && <p>{e.reason}</p>}</article>)}</div><div className="mt-4 flex items-center justify-between"><button className={secondaryClass} disabled={pending || offset === 0} onClick={() => start(() => refreshAudit(Math.max(0, offset - 15)))}>Anterior</button><span className="text-xs text-slate-500">Página {offset / 15 + 1}</span><button className={secondaryClass} disabled={pending || history.length < 15} onClick={() => start(() => refreshAudit(offset + 15))}>Siguiente</button></div></Panel>
    <ConfirmModal isOpen={!!confirmation} title="Confirmar cambio de supervisión" message={confirmation?.message ?? ''} onCancel={() => { if (!pending) setConfirmation(null); }} onConfirm={() => { if (!confirmation || pending) return; const work = confirmation.perform; setConfirmation(null); start(work); }} />
  </div>;
}

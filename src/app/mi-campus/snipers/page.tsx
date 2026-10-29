import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import { date } from '@/lib/snipers/presentation';
import { Panel, Status } from '@/components/snipers/ui';

export default async function MySnipersMembership() {
  const m = await pageData(() => snipers.getMyMembership());
  const access = await pageData(() => snipers.getAcademicAccess());
  return <div className="space-y-5"><Panel title="Mi membresía">{!m ? <p className="text-sm text-slate-600">Todavía no tenés una membresía registrada en Grupo de Snipers. Consultá al mentor para incorporarte.</p> : <><Status value={m.status} /><div className="mt-5 grid gap-6 sm:grid-cols-2"><div><p className="text-xs uppercase tracking-wide text-slate-500">Cobertura actual</p><p className="mt-1 font-semibold">{m.currentCoverage?.planName || 'Sin cobertura actual'}</p>{m.currentCoverage && <p className="mt-1 text-sm">Hasta {date(m.currentCoverage.endsAt)}</p>}</div><div><p className="text-xs uppercase tracking-wide text-slate-500">Próxima renovación no abonada</p><p className="mt-1 font-semibold">{m.renewalPlanName}</p></div></div><p className="mt-5 text-sm text-slate-600">{access.allowed ? access.via === 'MANAGEMENT' ? 'Tenés acceso por tus permisos de gestión.' : 'Tu membresía tiene acceso vigente.' : access.reason === 'UNAVAILABLE' ? 'No se pudo verificar el acceso en este momento.' : 'El acceso académico no está habilitado en este momento. Consultá al mentor.'}</p></>}</Panel>
    {m && <Panel title="Coberturas futuras confirmadas">{m.futureCoverages.length ? <div className="space-y-3">{m.futureCoverages.map(c => <div className="rounded-xl border border-slate-200 p-3 text-sm" key={c.startsAt}><p className="font-semibold">{c.planName} · {c.origin === 'COURTESY' ? 'Cortesía' : 'Pagada'}</p><p className="mt-1">{date(c.startsAt)} → {date(c.endsAt)}</p></div>)}</div> : <p className="text-sm text-slate-500">No hay períodos futuros confirmados.</p>}</Panel>}
    <Panel title="Contenido del grupo"><p className="text-sm text-slate-600">Los tres planes tienen el mismo contenido académico y acceso al historial completo de clases. El contenido todavía no está disponible en este entorno.</p></Panel>
  </div>;
}

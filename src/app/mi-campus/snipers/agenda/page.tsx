import Link from 'next/link';
import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import { date } from '@/lib/snipers/presentation';
import { Panel,Notice,secondaryClass } from '@/components/snipers/ui';
export default async function Agenda({searchParams}:{searchParams:Promise<{offset?:string}>}){
  const q=await searchParams;const offset=q.offset?Number(q.offset):0;
  const access=await pageData(()=>snipers.getAcademicAccess());
  if(!access.allowed)return <Panel title="Agenda privada"><Notice>No tenés acceso académico en este momento. <Link className="underline" href="/mi-campus/snipers">Consultar mi membresía</Link></Notice></Panel>;
  const data=await pageData(()=>snipers.listPublishedMeetings({offset,limit:25}));
  return <Panel title="Agenda privada de encuentros"><div className="divide-y divide-slate-200">{data.items.map(item=><article key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-6"><div className="min-w-0"><p className="text-xs font-semibold text-teal-800">{date(item.startsAt)} → {date(item.endsAt)}</p><h3 className="mt-2 break-words text-xl font-bold">{item.title}</h3></div><a className={secondaryClass} href={`/mi-campus/snipers/agenda/${item.id}/acceso`} target="_blank" rel="noopener noreferrer">Acceder a Zoom</a></article>)}</div>{!data.items.length&&<Notice>No hay encuentros publicados.</Notice>}<nav aria-label="Páginas de agenda" className="mt-5 flex gap-3">{offset>0&&<Link className={secondaryClass} href={`?offset=${Math.max(0,offset-25)}`}>Anterior</Link>}{data.hasMore&&<Link className={secondaryClass} href={`?offset=${offset+25}`}>Siguiente</Link>}</nav></Panel>;
}

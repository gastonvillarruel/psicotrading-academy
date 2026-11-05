import Link from 'next/link';
import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import LibraryList from '@/components/snipers/LibraryList';
import { Panel,Notice,inputClass,buttonClass,secondaryClass } from '@/components/snipers/ui';

export default async function Library({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const q=await searchParams;
  const access=await pageData(()=>snipers.getAcademicAccess());
  if(!access.allowed)return <Panel title="Biblioteca del grupo"><Notice>No tenés acceso académico en este momento. <Link href="/mi-campus/snipers" className="underline">Consultar mi membresía</Link></Notice></Panel>;
  const filter={offset:q.offset?Number(q.offset):0,limit:25,...(q.categoryId?{categoryId:q.categoryId}:{}),...(q.year?{year:Number(q.year)}:{}),...(q.month&&q.year?{month:Number(q.month)}:{})};
  const [data,categories]=await pageData(()=>Promise.all([snipers.listPublishedClasses(filter),snipers.listPublishedCategories()]));
  function page(offset:number){const params=new URLSearchParams();for(const key of ['categoryId','year','month'])if(q[key])params.set(key,q[key]!);params.set('offset',String(offset));return `?${params}`;}
  return <section className="space-y-6"><header className="border-b border-slate-200 pb-5"><p className="text-xs font-bold uppercase tracking-widest text-teal-700">El archivo del grupo</p><h2 className="mt-2 text-3xl font-bold">Biblioteca de clases</h2><p className="mt-2 text-sm text-slate-600">Todo el historial publicado, para los tres niveles.</p></header>{q.month&&!q.year&&<Notice>Para filtrar por mes, elegí también un año.</Notice>}<form className="grid items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4"><label className="text-sm font-medium">Categoría<select aria-label="Categoría" name="categoryId" defaultValue={q.categoryId??''} className={inputClass}><option value="">Todas</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-sm font-medium">Año<input type="number" name="year" min="1900" max="9998" defaultValue={q.year} className={inputClass} placeholder="Todos"/></label><label className="text-sm font-medium">Mes<select aria-label="Mes" name="month" defaultValue={q.month??''} className={inputClass}><option value="">Todos</option>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{String(i+1).padStart(2,'0')}</option>)}</select></label><button className={buttonClass}>Filtrar clases</button></form><LibraryList items={data.items}/>{!data.items.length&&<Notice>No hay clases publicadas en esta selección.</Notice>}<nav aria-label="Páginas de biblioteca" className="flex gap-3">{filter.offset>0&&<Link className={secondaryClass} href={page(Math.max(0,filter.offset-25))}>Anterior</Link>}{data.hasMore&&<Link className={secondaryClass} href={page(filter.offset+25)}>Siguiente</Link>}</nav></section>;
}

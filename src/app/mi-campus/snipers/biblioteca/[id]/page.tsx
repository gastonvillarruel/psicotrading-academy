import Link from 'next/link';
import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import { date } from '@/lib/snipers/presentation';
import ContentBody from '@/components/snipers/ContentBody';
export default async function ClassPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const item=await pageData(()=>snipers.getPublishedClass(id));
  return <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10"><Link href="/mi-campus/snipers/biblioteca" className="text-sm font-semibold text-teal-800">← Biblioteca</Link><p className="mt-8 text-xs font-bold uppercase tracking-wide text-teal-800">{date(item.classDate)} · {item.categoryName??'Sin categoría'}</p><h2 className="mb-8 mt-3 break-words text-3xl font-bold leading-tight sm:text-4xl">{item.title}</h2><ContentBody body={item.body}/></article>;
}

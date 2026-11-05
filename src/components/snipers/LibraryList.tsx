import Link from 'next/link';
import { date, zone } from '@/lib/snipers/presentation';

type LibraryItem = { id: string; title: string; classDate: string; categoryName: string | null };

export default function LibraryList({ items }: { items: LibraryItem[] }) {
  const groups = new Map<string, LibraryItem[]>();
  const month = new Intl.DateTimeFormat('es-AR', { timeZone: zone, month: 'long', year: 'numeric' });
  for (const item of items) {
    const label = month.format(new Date(item.classDate));
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }
  return <div className="space-y-8">{Array.from(groups, ([label, classes]) => (
    <section key={label} className="space-y-3">
      <h3 className="border-l-4 border-teal-600 pl-3 text-lg font-bold capitalize text-slate-800">{label}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{classes.map(item => (
        <article key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">{date(item.classDate)} · {item.categoryName ?? 'Sin categoría'}</p>
          <h4 className="mb-6 mt-3 break-words text-xl font-bold">{item.title}</h4>
          <Link href={`/mi-campus/snipers/biblioteca/${item.id}`} className="mt-auto font-semibold text-teal-800 underline-offset-4 hover:underline">Leer clase →</Link>
        </article>
      ))}</div>
    </section>
  ))}</div>;
}

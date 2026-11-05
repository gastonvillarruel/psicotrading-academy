import React from 'react';
import { requireValidSession } from '@/lib/auth-helpers';
import { getCampusDashboardData } from '@/app/actions/campus';
import CampusDashboard from '@/components/campus/CampusDashboard';
import Link from 'next/link';
import { snipers } from '@/lib/snipers/server';

export default async function StudentCampusPage() {
  const session = await requireValidSession();

  const result = await getCampusDashboardData();
  let snipersVisible = false;
  if (process.env.SNIPERS_ENABLED === 'true') {
    try { const caps = await snipers.getCapabilities(); snipersVisible = caps.member || caps.manager || caps.editor; } catch { /* Deny module visibility on errors. */ }
  }

  if (!result.success || !result.courses) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Error al cargar el campus</h2>
        <p className="text-slate-500 text-sm">Por favor, intentá recargar la página en unos minutos.</p>
      </div>
    );
  }

  const userName = session.user.name || session.user.email?.split('@')[0] || 'Trader';

  return (
    <main className="bg-slate-50 min-h-screen">
      {snipersVisible && <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8"><Link href="/mi-campus/snipers" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 p-6 text-white shadow-sm"><div><span className="text-xs font-semibold uppercase tracking-widest text-teal-300">Tu grupo</span><h2 className="mt-1 text-xl font-bold">Grupo de Snipers</h2><p className="mt-1 text-sm text-slate-300">Consultar mi membresía e ingresar al grupo</p></div><span className="font-semibold">Ingresar →</span></Link></div>}
      <CampusDashboard
        userName={userName}
        courses={result.courses as any}
        subscription={result.subscription}
      />
    </main>
  );
}

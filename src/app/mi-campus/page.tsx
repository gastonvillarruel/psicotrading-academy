import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCampusDashboardData } from '@/app/actions/campus';
import CampusDashboard from '@/components/campus/CampusDashboard';

export default async function StudentCampusPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return null; // El middleware redirecciona
  }

  const result = await getCampusDashboardData();

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
      <CampusDashboard
        userName={userName}
        courses={result.courses as any}
        subscription={result.subscription}
      />
    </main>
  );
}

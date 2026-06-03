import React from 'react';
import { db } from '@/lib/db';

async function getAdminStats() {
  try {
    const totalUsers = await db.user.count({
      where: { role: 'STUDENT' },
    });

    const activeSubscriptions = await db.subscription.count({
      where: {
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
    });

    const completedPurchases = await db.purchase.findMany({
      where: { status: 'approved' },
      include: { course: true },
    });

    let revenueARS = 0;
    let revenueUSD = 0;
    let revenueUSDT = 0;

    for (const p of completedPurchases) {
      const amt = Number(p.amount) || p.course?.price || 0;
      const curr = (p.currency || 'ARS').toUpperCase();
      if (curr === 'ARS') {
        revenueARS += amt;
      } else if (curr === 'USD') {
        revenueUSD += amt;
      } else if (curr === 'USDT') {
        revenueUSDT += amt;
      }
    }

    const latestUsers = await db.user.findMany({
      where: { role: 'STUDENT' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      totalUsers,
      activeSubscriptions,
      revenueARS,
      revenueUSD,
      revenueUSDT,
      latestUsers,
    };
  } catch (error) {
    console.error('Error al obtener estadísticas del admin:', error);
    return {
      totalUsers: 0,
      activeSubscriptions: 0,
      revenueARS: 0,
      revenueUSD: 0,
      revenueUSDT: 0,
      latestUsers: [],
    };
  }
}

export default async function AdminDashboardPage() {
  const stats = await getAdminStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Dashboard General</h1>
        <p className="text-gray-500 mt-1">Métricas y desempeño comercial de la plataforma.</p>
      </div>

      {/* Grid de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {/* Ingresos ARS */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="h-12 w-12 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center font-bold text-xl shadow-inner">
            $
          </div>
          <div>
            <span className="text-xs text-gray-400 font-semibold block uppercase">Ingresos ARS</span>
            <span className="text-2xl font-extrabold text-gray-900 block mt-0.5">
              ${stats.revenueARS.toLocaleString('es-AR')}
            </span>
          </div>
        </div>

        {/* Ingresos USD */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-xl shadow-inner">
            $
          </div>
          <div>
            <span className="text-xs text-gray-400 font-semibold block uppercase">Ingresos USD</span>
            <span className="text-2xl font-extrabold text-gray-900 block mt-0.5">
              ${stats.revenueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Ingresos USDT */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="h-12 w-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center font-bold text-lg shadow-inner">
            ₮
          </div>
          <div>
            <span className="text-xs text-gray-400 font-semibold block uppercase">Ingresos USDT</span>
            <span className="text-2xl font-extrabold text-gray-900 block mt-0.5">
              {stats.revenueUSDT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Alumnos */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="h-12 w-12 bg-gray-50 text-gray-600 rounded-xl flex items-center justify-center shadow-inner">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <span className="text-xs text-gray-400 font-semibold block uppercase">Alumnos Activos</span>
            <span className="text-2xl font-extrabold text-gray-900 block mt-0.5">
              {stats.totalUsers}
            </span>
          </div>
        </div>

        {/* Membresías */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
          <div className="h-12 w-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <span className="text-xs text-gray-400 font-semibold block uppercase">Suscripciones</span>
            <span className="text-2xl font-extrabold text-gray-900 block mt-0.5">
              {stats.activeSubscriptions}
            </span>
          </div>
        </div>
      </div>

      {/* Últimos estudiantes registrados */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Últimos Alumnos Registrados</h2>
        {stats.latestUsers.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay alumnos registrados.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {stats.latestUsers.map((user) => (
              <div key={user.id} className="py-3 flex justify-between items-center text-sm">
                <div>
                  <span className="font-semibold text-gray-900 block">{user.name || 'Sin nombre'}</span>
                  <span className="text-xs text-gray-400 block">{user.email}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(user.createdAt).toLocaleDateString('es-AR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

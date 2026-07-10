import React from 'react';
import { db } from '@/lib/db';
import { LuDollarSign, LuCoins, LuUsers, LuShieldCheck, LuWallet } from 'react-icons/lu';
import { ManualEnrollmentForm } from '@/components/admin/ManualEnrollmentForm';

export const dynamic = 'force-dynamic';

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

    const availableCourses = await db.course.findMany({
      where: {
        available: { not: false },
        NOT: [
          { slug: 'suscripcion-mensual' },
          { slug: 'suscripcion-anual' },
        ],
      },
      select: {
        id: true,
        title: true,
        scheduleOptions: {
          where: { isActive: true },
          select: { id: true, name: true, description: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { title: 'asc' },
    });

    return {
      totalUsers,
      activeSubscriptions,
      revenueARS,
      revenueUSD,
      revenueUSDT,
      latestUsers,
      availableCourses,
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
      availableCourses: [],
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Ingresos ARS */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 w-full min-h-[112px]">
          <div className="h-12 w-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
            <LuCoins size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide block leading-tight">
              Ingresos
            </span>
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide block leading-tight">
              ARS
            </span>
            <span className="text-2xl font-bold text-gray-900 block mt-1 whitespace-nowrap">
              ${stats.revenueARS.toLocaleString('es-AR')}
            </span>
          </div>
        </div>

        {/* Ingresos USD */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 w-full min-h-[112px]">
          <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
            <LuDollarSign size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide block leading-tight">
              Ingresos
            </span>
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide block leading-tight">
              USD
            </span>
            <span className="text-2xl font-bold text-gray-900 block mt-1 whitespace-nowrap">
              ${stats.revenueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Ingresos USDT */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 w-full min-h-[112px]">
          <div className="h-12 w-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
            <LuWallet size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide block leading-tight">
              Ingresos
            </span>
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide block leading-tight">
              USDT
            </span>
            <span className="text-2xl font-bold text-gray-900 block mt-1 whitespace-nowrap">
              {stats.revenueUSDT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Alumnos */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 w-full min-h-[112px]">
          <div className="h-12 w-12 bg-neutral-100 text-neutral-600 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
            <LuUsers size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide block leading-tight">
              Alumnos
            </span>
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide block leading-tight">
              Activos
            </span>
            <span className="text-2xl font-bold text-gray-900 block mt-1 whitespace-nowrap">
              {stats.totalUsers}
            </span>
          </div>
        </div>

        {/* Membresías / Suscripciones */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 w-full min-h-[112px]">
          <div className="h-12 w-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
            <LuShieldCheck size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide block leading-tight">
              Suscripciones
            </span>
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide block leading-tight select-none opacity-0">
              &nbsp;
            </span>
            <span className="text-2xl font-bold text-gray-900 block mt-1 whitespace-nowrap">
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

      {/* Inscripción Manual */}
      <div id="inscripcion-manual">
        <ManualEnrollmentForm courses={stats.availableCourses} />
      </div>
    </div>
  );
}

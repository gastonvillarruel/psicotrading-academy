import React from 'react';
import { db } from '@/lib/db';

async function getUsersWithAccess() {
  try {
    const students = await db.user.findMany({
      where: { role: 'STUDENT' },
      include: {
        purchases: {
          where: { status: 'COMPLETED' },
          include: { course: true },
        },
        subscriptions: {
          orderBy: { expiresAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return students;
  } catch (error) {
    console.error('Error al obtener lista de usuarios en admin:', error);
    return [];
  }
}

export default async function AdminUsersPage() {
  const users = await getUsersWithAccess();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Lista de Alumnos</h1>
        <p className="text-gray-500 mt-1">Monitoreá las inscripciones y el estado de membresías de tus estudiantes.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {users.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            Aún no hay alumnos registrados en la plataforma.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Estudiante</th>
                  <th className="px-6 py-4">Fecha de Registro</th>
                  <th className="px-6 py-4">Cursos Adquiridos</th>
                  <th className="px-6 py-4">Membresía</th>
                  <th className="px-6 py-4 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {users.map((user) => {
                  // Determinar si tiene suscripción activa
                  const latestSub = user.subscriptions[0];
                  const hasActiveSub = latestSub && latestSub.status === 'ACTIVE' && new Date(latestSub.expiresAt).getTime() > Date.now();

                  // Filtrar compras para no contar las dummy de suscripción como cursos regulares
                  const regularPurchases = user.purchases.filter(
                    (p) => p.course && p.course.slug !== 'suscripcion-mensual' && p.course.slug !== 'suscripcion-anual'
                  );

                  return (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900 block">{user.name || 'Sin nombre'}</span>
                        <span className="text-xs text-gray-400 block mt-0.5">{user.email}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-700">{regularPurchases.length}</span>{' '}
                        <span className="text-xs text-gray-400">
                          {regularPurchases.length === 1 ? 'curso' : 'cursos'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {hasActiveSub ? (
                          <div>
                            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded-md">
                              Activa ({latestSub.plan === 'MONTHLY' ? 'Mensual' : 'Anual'})
                            </span>
                            <span className="text-[10px] text-gray-400 block mt-1">
                              Vence: {new Date(latestSub.expiresAt).toLocaleDateString('es-AR')}
                            </span>
                          </div>
                        ) : latestSub ? (
                          <div>
                            <span className="text-xs font-semibold text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                              Expirada ({latestSub.plan === 'MONTHLY' ? 'Mensual' : 'Anual'})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium">Sin suscripción</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="h-2 w-2 rounded-full bg-teal-500 inline-block" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

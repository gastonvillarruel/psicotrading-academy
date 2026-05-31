import React from 'react';
import { db } from '@/lib/db';

async function getPaymentsHistory() {
  try {
    return await db.purchase.findMany({
      include: {
        user: true,
        course: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.error('Error al obtener historial de pagos en admin:', error);
    return [];
  }
}

export default async function AdminPaymentsPage() {
  const purchases = await getPaymentsHistory();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Auditoría de Pagos</h1>
        <p className="text-gray-500 mt-1">Registros históricos de todas las transacciones generadas en el sistema.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {purchases.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            Aún no se han generado registros de pago.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Estudiante</th>
                  <th className="px-6 py-4">Concepto</th>
                  <th className="px-6 py-4">Pasarela</th>
                  <th className="px-6 py-4">ID Transacción</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {purchases.map((purchase) => {
                  let statusBadge = '';
                  switch (purchase.status) {
                    case 'COMPLETED':
                      statusBadge = 'bg-teal-100 text-teal-800';
                      break;
                    case 'FAILED':
                      statusBadge = 'bg-red-100 text-red-800';
                      break;
                    case 'PENDING':
                    default:
                      statusBadge = 'bg-yellow-100 text-yellow-800';
                      break;
                  }

                  const isSubscription = purchase.course && (purchase.course.slug === 'suscripcion-mensual' || purchase.course.slug === 'suscripcion-anual');

                  return (
                    <tr key={purchase.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900 block">{purchase.user?.name || 'Sin nombre'}</span>
                        <span className="text-xs text-gray-400 block mt-0.5">{purchase.user?.email}</span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-800">
                        <span className="block line-clamp-1">{purchase.course?.title || 'Curso desconocido'}</span>
                        {isSubscription && (
                          <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md inline-block mt-1">
                            Membresía
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 uppercase font-semibold text-xs text-gray-500">
                        {purchase.paymentProvider}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-400">
                        {purchase.paymentId || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">
                        {new Date(purchase.createdAt).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full shadow-sm ${statusBadge}`}>
                          {purchase.status === 'COMPLETED' ? 'Aprobado' : purchase.status === 'FAILED' ? 'Rechazado' : 'Pendiente'}
                        </span>
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

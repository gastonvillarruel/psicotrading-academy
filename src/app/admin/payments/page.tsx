import React from 'react';
import { db } from '@/lib/db';
import PaymentsTable from './PaymentsTable';

async function getPaymentsHistory() {
  try {
    const purchases = await db.purchase.findMany({
      include: {
        user: true,
        course: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Serializar objetos complejos (como Decimal y Date) para pasarlos a componentes de cliente de forma segura.
    return purchases.map((purchase) => ({
      id: purchase.id,
      userId: purchase.userId,
      user: purchase.user
        ? {
            id: purchase.user.id,
            name: purchase.user.name,
            email: purchase.user.email,
          }
        : null,
      course: purchase.course
        ? {
            id: purchase.course.id,
            title: purchase.course.title,
            slug: purchase.course.slug,
          }
        : null,
      paymentMethod: purchase.paymentMethod,
      providerPaymentId: purchase.providerPaymentId,
      amount: purchase.amount ? Number(purchase.amount) : 0,
      currency: purchase.currency,
      checkoutUrl: purchase.checkoutUrl,
      providerStatus: purchase.providerStatus,
      status: purchase.status,
      createdAt: purchase.createdAt.toISOString(),
    }));
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

      <PaymentsTable initialPurchases={purchases} />
    </div>
  );
}

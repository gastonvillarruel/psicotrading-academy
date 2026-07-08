import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getProvider } from '@/lib/payments';
import { createOrRestoreEnrollment } from '@/lib/campus/access';

export async function POST(req: NextRequest) {
  try {
    const provider = getProvider('paypal');
    const result = await provider.handleWebhook(req);

    if (!result.success || !result.purchaseId) {
      return NextResponse.json({ error: result.error || 'Ignorado' }, { status: 400 });
    }

    const { purchaseId, paymentId, status } = result;

    // Buscar compra
    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: { course: true },
    });

    if (!purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });
    }

    // Evitar procesamiento duplicado
    if (purchase.status === 'approved') {
      return NextResponse.json({ message: 'Ya procesado' }, { status: 200 });
    }

    // Actualizar compra en BD
    await db.purchase.update({
      where: { id: purchaseId },
      data: {
        status: status || 'pending',
        providerPaymentId: paymentId || null,
        providerStatus: status || null,
      },
    });

    // Si la compra es exitosa y corresponde a un curso
    if (status === 'approved' && purchase.course) {
      // Crear o restaurar matrícula tras el pago aprobado (solución transitoria)
      await createOrRestoreEnrollment({
        userId: purchase.userId,
        courseId: purchase.courseId,
        purchaseId: purchase.id,
        scheduleOptionId: purchase.scheduleOptionId,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error en webhook de PayPal:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

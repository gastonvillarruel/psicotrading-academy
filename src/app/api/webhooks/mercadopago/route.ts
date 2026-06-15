import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getProvider } from '@/lib/payments';

export async function POST(req: NextRequest) {
  try {
    const provider = getProvider('mercadopago');
    const result = await provider.handleWebhook(req);

    if (!result.success || !result.purchaseId) {
      // Retornar 200 de todos modos para que MercadoPago no reintente infinitamente notificaciones no válidas
      return NextResponse.json({ message: result.error || 'Ignorado' }, { status: 200 });
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

    // Si la compra es exitosa y corresponde a un curso o membresía
    if (status === 'approved' && purchase.course) {
      // Crear registro de inscripción (Enrollment) de forma idempotente
      try {
        await db.enrollment.create({
          data: {
            userId: purchase.userId,
            courseId: purchase.courseId,
            purchaseId: purchase.id,
            scheduleOptionId: purchase.scheduleOptionId ?? null,
          },
        });
      } catch (err) {
        // Ignorar si ya existía (llave duplicada)
      }

      // Si corresponde a una membresía/suscripción
      if (purchase.course.slug === 'suscripcion-mensual' || purchase.course.slug === 'suscripcion-anual') {
        const isMonthly = purchase.course.slug === 'suscripcion-mensual';
        const days = isMonthly ? 30 : 365;
        const plan = isMonthly ? 'MONTHLY' : 'ANNUAL';

        // Crear o extender suscripción
        await db.subscription.create({
          data: {
            userId: purchase.userId,
            plan,
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error en webhook de MercadoPago:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// MercadoPago a veces hace peticiones GET de prueba para validar el endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
export async function PUT() {
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

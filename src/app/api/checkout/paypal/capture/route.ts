import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { getProvider } from '@/lib/payments';
import { PayPalProvider } from '@/lib/payments/paypal';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: 'Falta orderId para capturar el pago.' }, { status: 400 });
    }

    // Buscar la compra asociada a este orderId de PayPal
    const purchase = await db.purchase.findFirst({
      where: {
        providerPaymentId: orderId,
        paymentMethod: 'paypal',
      },
      include: { course: true },
    });

    if (!purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });
    }

    // Idempotencia: Si ya fue aprobada, retornar de inmediato
    if (purchase.status === 'approved') {
      return NextResponse.json({ success: true, message: 'Pago ya capturado y aprobado previamente.' });
    }

    // Ejecutar captura de la orden en PayPal
    const paypalProvider = getProvider('paypal') as PayPalProvider;
    const captureResult = await paypalProvider.captureOrder(orderId);

    const status = captureResult.status; // COMPLETED, etc.
    const captureId = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderId;

    if (status === 'COMPLETED') {
      // Transacción en base de datos para asegurar consistencia
      await db.$transaction(async (tx) => {
        // Actualizar compra
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            status: 'approved',
            providerStatus: status,
            providerPaymentId: captureId,
          },
        });

        // Crear inscripción (Enrollment) de forma idempotente
        const existingEnrollment = await tx.enrollment.findUnique({
          where: {
            userId_courseId: {
              userId: purchase.userId,
              courseId: purchase.courseId,
            },
          },
        });

        if (!existingEnrollment) {
          await tx.enrollment.create({
            data: {
              userId: purchase.userId,
              courseId: purchase.courseId,
              purchaseId: purchase.id,
              scheduleOptionId: purchase.scheduleOptionId ?? null,
            },
          });
        }
      });

      return NextResponse.json({ success: true });
    } else {
      // Actualizar compra a fallida
      await db.purchase.update({
        where: { id: purchase.id },
        data: {
          status: 'failed',
          providerStatus: status,
        },
      });

      return NextResponse.json({ error: `La orden de PayPal no pudo ser capturada. Estado: ${status}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error en captura de PayPal:', error);
    return NextResponse.json({ error: error.message || 'Error interno al capturar el pago.' }, { status: 500 });
  }
}

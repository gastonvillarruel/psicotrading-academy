import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getProvider } from '@/lib/payments';

export async function POST(req: NextRequest) {
  try {
    const provider = getProvider('stripe');
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
        status: (status as any) || 'pending',
        providerPaymentId: paymentId || null,
        providerStatus: status || null,
      },
    });

    // Si la compra es exitosa y corresponde a una membresía/suscripción
    if (status === 'approved' && purchase.course && (purchase.course.slug === 'suscripcion-mensual' || purchase.course.slug === 'suscripcion-anual')) {
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

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error en webhook de Stripe:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// Para prevenir problemas de parsing automático de raw body en Next.js, 
// no es necesario desactivar el bodyParser de forma explícita en Next.js 14+ 
// usando config = { api: { bodyParser: false } } si leemos req.text() en la API Route normal,
// pero dado que es una ruta de App Router, Next.js no parsea el body a menos que invoquemos req.json().
// Como en stripe.ts llamamos a req.text() directamente, se lee el buffer en bruto de manera correcta.

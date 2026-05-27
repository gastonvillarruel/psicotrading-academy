import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { getProvider } from '@/lib/payments';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { courseId, plan, provider } = await req.json();

    if (!provider || (provider !== 'mercadopago' && provider !== 'stripe')) {
      return NextResponse.json({ error: 'Proveedor de pago no válido' }, { status: 400 });
    }

    let amount = 0;
    let title = '';
    let description = '';
    let targetCourseId = '';
    let isSubscription = false;

    // Caso 1: Compra de un curso
    if (courseId) {
      const course = await db.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
      }

      amount = course.price;
      title = course.title;
      description = course.shortDescription;
      targetCourseId = course.id;
    }
    // Caso 2: Suscripción mensual / anual
    else if (plan) {
      isSubscription = true;
      const isMonthly = plan === 'MONTHLY';
      amount = isMonthly ? 8500 : 81600;
      title = isMonthly ? 'Suscripción Académica Mensual' : 'Suscripción Académica Anual';
      description = isMonthly
        ? 'Acceso completo a todos los cursos y talleres por 30 días.'
        : 'Acceso completo a todos los cursos y talleres por 1 año.';

      // Buscar o crear curso dummy de suscripción para cumplir con la integridad del esquema
      const subscriptionSlug = isMonthly ? 'suscripcion-mensual' : 'suscripcion-anual';
      let subscriptionCourse = await db.course.findUnique({
        where: { slug: subscriptionSlug },
      });

      if (!subscriptionCourse) {
        subscriptionCourse = await db.course.create({
          data: {
            slug: subscriptionSlug,
            title,
            shortDescription: description,
            longDescription: description,
            price: amount,
            type: 'RECORDED', // Tipo genérico
          },
        });
      }
      targetCourseId = subscriptionCourse.id;
    } else {
      return NextResponse.json({ error: 'Falta courseId o plan para procesar el pago' }, { status: 400 });
    }

    // Crear registro de compra PENDING en base de datos
    const purchase = await db.purchase.create({
      data: {
        userId: session.user.id,
        courseId: targetCourseId,
        paymentProvider: provider,
        status: 'PENDING',
      },
    });

    // Llamar al adaptador seleccionado
    const paymentProvider = getProvider(provider);
    const checkoutResult = await paymentProvider.createCheckout({
      userId: session.user.id,
      userEmail: session.user.email || '',
      amount,
      title,
      description,
      itemId: isSubscription ? plan : targetCourseId,
      type: isSubscription ? 'SUBSCRIPTION' : 'COURSE',
      plan: isSubscription ? plan : undefined,
      purchaseId: purchase.id,
    });

    return NextResponse.json({ url: checkoutResult.url });
  } catch (error: any) {
    console.error('Error en API checkout:', error);
    return NextResponse.json({ error: 'Ocurrió un error al procesar el pago.' }, { status: 500 });
  }
}

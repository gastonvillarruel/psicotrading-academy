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
    const { courseId, plan, provider, payCurrency, scheduleOptionId, startDateId } = await req.json();

    if (!provider || (provider !== 'mercadopago' && provider !== 'paypal' && provider !== 'nowpayments')) {
      return NextResponse.json({ error: 'Proveedor de pago no válido' }, { status: 400 });
    }

    if (provider === 'paypal' && process.env.PAYPAL_ENABLED === 'false') {
      return NextResponse.json({ error: 'El pago vía PayPal no está disponible en este momento.' }, { status: 400 });
    }

    let amount = 0;
    let currency = 'ARS';
    let title = '';
    let description = '';
    let targetCourseId = '';
    let isSubscription = false;
    let validatedScheduleOptionId: string | null = null;

    // Caso 1: Compra de un curso
    if (courseId) {
      const course = await db.course.findUnique({
        where: { id: courseId },
      });

      if (!course) {
        return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
      }

      title = course.title;
      description = course.shortDescription;
      targetCourseId = course.id;

      // Validar startDateId si viene en la compra
      if (startDateId) {
        const matchedStartDate = await db.courseStartDate.findFirst({
          where: { id: startDateId, courseId: course.id, isActive: true },
          select: { id: true, scheduleOptionId: true }
        });
        if (!matchedStartDate) {
          return NextResponse.json(
            { error: 'La fecha de inicio seleccionada no es válida para este curso.' },
            { status: 400 }
          );
        }
        // Si la fecha de inicio está vinculada a una comisión, forzar que coincida con scheduleOptionId o autocompletarlo
        if (matchedStartDate.scheduleOptionId) {
          if (scheduleOptionId && matchedStartDate.scheduleOptionId !== scheduleOptionId) {
            return NextResponse.json(
              { error: 'Inconsistencia en la comisión seleccionada para la fecha de inicio.' },
              { status: 400 }
            );
          }
        }
      }

      // Validar scheduleOptionId si el curso tiene comisiones activas
      const activeOptions = await db.courseScheduleOption.findMany({
        where: { courseId: course.id, isActive: true },
        select: { id: true },
      });

      if (activeOptions.length > 0) {
        if (!scheduleOptionId) {
          return NextResponse.json(
            { error: 'Este curso tiene comisiones disponibles. Debés elegir un horario antes de continuar.' },
            { status: 400 }
          );
        }
        const matchedOption = activeOptions.find((o) => o.id === scheduleOptionId);
        if (!matchedOption) {
          return NextResponse.json(
            { error: 'El horario seleccionado no es válido para este curso.' },
            { status: 400 }
          );
        }
        validatedScheduleOptionId = scheduleOptionId;
      }

      if (provider === 'paypal') {
        if (course.priceUSD === null || course.priceUSD === undefined) {
          return NextResponse.json({ error: 'Este curso no tiene precio en USD configurado.' }, { status: 400 });
        }
        amount = course.priceUSD;
        currency = 'USD';
      } else if (provider === 'nowpayments') {
        if (course.priceUSDT === null || course.priceUSDT === undefined) {
          return NextResponse.json({ error: 'Este curso no tiene precio en USDT configurado.' }, { status: 400 });
        }
        amount = Number(course.priceUSDT);
        currency = 'USDT';
      } else {
        // mercadopago
        const pricingARS = course.priceARS ?? Math.round(course.price);
        if (!pricingARS) {
          return NextResponse.json({ error: 'Este curso no tiene precio en ARS configurado.' }, { status: 400 });
        }
        amount = pricingARS;
        currency = 'ARS';
      }
    }
    // Caso 2: Suscripción mensual / anual
    else if (plan) {
      if (provider !== 'mercadopago') {
        return NextResponse.json({ error: 'Las membresías actualmente solo se pueden pagar con Mercado Pago.' }, { status: 400 });
      }
      isSubscription = true;
      const isMonthly = plan === 'MONTHLY';
      amount = isMonthly ? 8500 : 81600;
      currency = 'ARS';
      title = isMonthly ? 'Suscripción Mensual - Sistema de Entrenamiento' : 'Suscripción Anual - Sistema de Entrenamiento';
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
            priceARS: amount,
            type: 'RECORDED', // Tipo genérico
          },
        });
      }
      targetCourseId = subscriptionCourse.id;
    } else {
      return NextResponse.json({ error: 'Falta courseId o plan para procesar el pago' }, { status: 400 });
    }

    // Crear registro de compra pending en base de datos
    const purchase = await db.purchase.create({
      data: {
        userId: session.user.id,
        courseId: targetCourseId,
        paymentMethod: provider,
        amount,
        currency,
        status: 'pending',
        scheduleOptionId: validatedScheduleOptionId ?? null,
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
      payCurrency,
    });

    // Guardar URL de redirección en el registro de compra
    await db.purchase.update({
      where: { id: purchase.id },
      data: {
        checkoutUrl: checkoutResult.url,
        providerPaymentId: checkoutResult.providerPaymentId || null,
      },
    });

    return NextResponse.json({ url: checkoutResult.url });
  } catch (error: any) {
    console.error('Error en API checkout:', error);
    return NextResponse.json({ error: error.message || 'Ocurrió un error al procesar el pago.' }, { status: 500 });
  }
}

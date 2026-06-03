import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import CheckoutForm from '@/components/CheckoutForm';
import { formatCoursePrice, getAvailableCurrencies, getDefaultCurrency } from '@/lib/price';
import { getAvailableStartDates } from '@/lib/courseStartDates';

interface CheckoutPageProps {
  searchParams: Promise<{ courseId?: string; plan?: 'MONTHLY' | 'ANNUAL'; currency?: string; startDateId?: string }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const resolvedParams = await searchParams;
  const { courseId, plan, startDateId } = resolvedParams;
  const currencyParam = resolvedParams.currency || 'ARS';

  // Si no hay parámetros válidos, redirigir a catálogo
  if (!courseId && !plan) {
    redirect('/');
  }

  let title = '';
  let description = '';
  let price = 0;
  let validatedCurrency: 'ARS' | 'USD' = 'ARS';
  let paymentMode = 'cash';
  let durationInMonths = 0;
  let formattedPriceLabel = '';
  let selectedStartDate: any = null;

  let courseObj: any = null;

  if (courseId) {
    const course = await db.course.findUnique({
      where: { id: courseId },
      include: {
        startDates: true,
      },
    });

    if (!course || course.available === false) {
      redirect('/');
    }

    courseObj = course;
    title = course.title;
    description = course.shortDescription;
    paymentMode = course.paymentMode || 'cash';
    durationInMonths = course.durationInMonths || 0;

    const available = getAvailableCurrencies(course);
    const defaultCurrency = getDefaultCurrency(course);
    validatedCurrency = available.includes(currencyParam as any) ? (currencyParam as 'ARS' | 'USD') : defaultCurrency;

    const pricing = formatCoursePrice(course, validatedCurrency);
    price = pricing.priceValue;
    formattedPriceLabel = pricing.currentPriceLabel;

    // Obtener fechas del helper
    const availableDates = getAvailableStartDates(course);

    // Validar startDateId
    if (startDateId) {
      // El ID debe pertenecer al curso y estar activo (disponible en la lista filtrada)
      const matchedDate = availableDates.find((d) => d.id === startDateId);
      if (matchedDate) {
        selectedStartDate = matchedDate;
      } else {
        // Fallback seguro: primera fecha disponible o null
        selectedStartDate = availableDates.length > 0 ? availableDates[0] : null;
      }
    } else {
      // Si no viene fecha, usar la predeterminada si existe
      selectedStartDate = availableDates.length > 0 ? availableDates[0] : null;
    }

    // Si sigue sin haber fecha y el curso tiene legacy scheduledAt, usarlo como fallback
    if (!selectedStartDate && course.scheduledAt) {
      selectedStartDate = {
        startDate: course.scheduledAt,
        startTime: null,
        teacherName: null,
      };
    }
  } else if (plan) {
    const isMonthly = plan === 'MONTHLY';
    title = isMonthly ? 'Suscripción Mensual - Sistema de Entrenamiento' : 'Suscripción Anual - Sistema de Entrenamiento';
    description = isMonthly
      ? 'Acceso ilimitado a todos los contenidos por 30 días.'
      : 'Acceso ilimitado a todos los contenidos por 365 días.';
    price = isMonthly ? 8500 : 81600;
    validatedCurrency = 'ARS';
    formattedPriceLabel = `$${price.toLocaleString('es-AR')} ARS`;
  }

  return (
    <main className="min-h-screen bg-brand-bg py-12 transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span className="text-xs font-bold tracking-widest text-brand-primary uppercase mb-2 block">
            Paso Final
          </span>
          <h1 className="text-3xl font-extrabold text-brand-text tracking-tight">Finalizar tu Inscripción</h1>
          <p className="text-brand-text-muted mt-2">Estás a un paso de comenzar tu entrenamiento mental.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-5xl mx-auto">
          {/* Resumen del pedido */}
          <div className="lg:col-span-4 bg-brand-card border border-brand-border/30 rounded-xl p-6 shadow-sm">
            <h2 className="text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-4">Resumen del pedido</h2>
            <div className="space-y-4">
              <div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wider uppercase inline-block ${
                  courseId 
                    ? 'bg-brand-secondary/15 text-brand-secondary border border-brand-secondary/20' 
                    : 'bg-brand-accent/15 text-brand-accent border border-brand-accent/20'
                }`}>
                  {courseId ? 'Curso Individual' : 'Membresía Completa'}
                </span>
                <h3 className="font-bold text-brand-text text-base mt-3 leading-snug">{title}</h3>
                <p className="text-xs text-brand-text-muted mt-1 leading-relaxed font-light">{description}</p>
                
                {selectedStartDate && (
                  <div className="mt-3 p-3 bg-brand-bg-sec/40 border border-brand-border/10 rounded-lg space-y-1">
                    <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider block">Fecha de cursada</span>
                    <span className="text-xs font-semibold text-brand-text block">
                      Inicio: {new Date(selectedStartDate.startDate).toLocaleDateString('es-AR')}
                    </span>
                    {selectedStartDate.startTime && (
                      <span className="text-[10px] text-brand-text-muted block">Horario: {selectedStartDate.startTime}</span>
                    )}
                    {selectedStartDate.teacherName && (
                      <span className="text-[10px] text-brand-text-muted block">Docente: {selectedStartDate.teacherName}</span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="border-t border-brand-border/20 pt-4 flex justify-between items-center">
                <span className="text-xs text-brand-text-muted font-medium">Subtotal</span>
                <span className="font-bold text-brand-text text-sm">{formattedPriceLabel}</span>
              </div>
              <div className="flex justify-between items-center text-brand-primary font-bold border-t border-brand-border/20 pt-4">
                <span className="text-sm">Total</span>
                <span className="text-xl font-extrabold">{formattedPriceLabel}</span>
              </div>
            </div>
          </div>

          {/* Formulario de Checkout */}
          <div className="lg:col-span-8">
            <Suspense fallback={
              <div className="bg-brand-card rounded-xl border border-brand-border/30 p-8 shadow-sm flex justify-center py-20">
                <svg className="animate-spin h-8 w-8 text-brand-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            }>
              <CheckoutForm
                courseId={courseId}
                plan={plan}
                title={title}
                priceARS={courseObj ? (courseObj.priceARS ?? Math.round(courseObj.price ?? 0)) : (plan ? price : null)}
                priceUSD={courseObj ? courseObj.priceUSD : null}
                priceUSDT={courseObj ? (courseObj.priceUSDT ? Number(courseObj.priceUSDT) : null) : null}
                paymentMode={paymentMode}
                durationInMonths={durationInMonths}
                startDate={selectedStartDate ? selectedStartDate.startDate : undefined}
                startTime={selectedStartDate ? selectedStartDate.startTime : undefined}
                teacherName={selectedStartDate ? selectedStartDate.teacherName : undefined}
                paypalEnabled={process.env.PAYPAL_ENABLED !== 'false'}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}

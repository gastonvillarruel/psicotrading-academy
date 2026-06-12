import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import CheckoutForm from '@/components/CheckoutForm';
import { formatCoursePrice, getAvailableCurrencies, getDefaultCurrency } from '@/lib/price';
import { getAvailableStartDates } from '@/lib/courseStartDates';
import { FiCalendar, FiClock, FiUser, FiShoppingBag, FiShield, FiCheck, FiLock } from 'react-icons/fi';

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
  let validatedCurrency: 'ARS' | 'USD' | 'CRYPTO' = 'ARS';
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
    validatedCurrency = available.includes(currencyParam as any) ? (currencyParam as 'ARS' | 'USD' | 'CRYPTO') : defaultCurrency;

    const pricing = formatCoursePrice(course, validatedCurrency);
    price = pricing.priceValue;
    formattedPriceLabel = pricing.currentPriceLabel;

    // Obtener fechas del helper
    const availableDates = getAvailableStartDates(course);

    // Validar startDateId
    if (startDateId) {
      const matchedDate = availableDates.find((d) => d.id === startDateId);
      if (matchedDate) {
        selectedStartDate = matchedDate;
      } else {
        selectedStartDate = availableDates.length > 0 ? availableDates[0] : null;
      }
    } else {
      selectedStartDate = availableDates.length > 0 ? availableDates[0] : null;
    }

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
    <main className="min-h-screen bg-linear-to-b from-slate-50 via-slate-100 to-slate-200/50 pt-8 pb-16 transition-all duration-200 relative overflow-hidden">
      {/* Decorative blurred background shapes */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-1/4 w-[500px] h-[500px] bg-brand-secondary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Step Indicator Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center space-x-2 bg-brand-primary/10 border border-brand-primary/20 px-3.5 py-1.5 rounded-full mb-4">
            <span className="h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
            <span className="text-xs font-bold tracking-wider text-brand-primary uppercase">
              Checkout Seguro
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-brand-text tracking-tight">
            Finalizá tu Inscripción
          </h1>
          <p className="text-brand-text-muted mt-2 text-sm sm:text-base max-w-md mx-auto">
            Estás a punto de iniciar tu transformación mental y emocional en el trading.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-5xl mx-auto">
          {/* Resumen del pedido */}
          <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/30 flex flex-col space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black text-brand-primary uppercase tracking-wider flex items-center">
                  <FiShoppingBag className="mr-1.5 text-sm" /> Resumen de tu Inscripción
                </h2>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wider uppercase inline-block ${courseId
                  ? 'bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/25'
                  : 'bg-brand-accent/10 text-brand-accent border border-brand-accent/25'
                  }`}>
                  {courseId ? 'Curso Individual' : 'Membresía'}
                </span>
              </div>

              <h3 className="font-extrabold text-brand-text text-xl leading-snug tracking-tight">
                {title}
              </h3>
              <p className="text-xs text-brand-text-muted mt-2 leading-relaxed font-light">
                {description}
              </p>

              {selectedStartDate && (
                <div className="mt-5 p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2.5">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block">Detalles de la Cursada</span>
                  <div className="grid grid-cols-1 gap-2 text-xs text-brand-text-muted">
                    <div className="flex items-center">
                      <FiCalendar className="mr-2 text-brand-primary/80 text-sm flex-shrink-0" />
                      <span>Inicio: <strong className="text-brand-text font-bold">{new Date(selectedStartDate.startDate).toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</strong></span>
                    </div>
                    {selectedStartDate.startTime && (
                      <div className="flex items-center">
                        <FiClock className="mr-2 text-brand-primary/80 text-sm flex-shrink-0" />
                        <span>Horario: <strong className="text-brand-text font-medium">{selectedStartDate.startTime}</strong></span>
                      </div>
                    )}
                    {selectedStartDate.teacherName && (
                      <div className="flex items-center">
                        <FiUser className="mr-2 text-brand-primary/80 text-sm flex-shrink-0" />
                        <span>Instructor: <strong className="text-brand-text font-medium">{selectedStartDate.teacherName}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Price breakdown */}
            <div className="border-t border-slate-100 pt-5 space-y-3.5">
              <div className="flex justify-between items-center text-xs text-brand-text-muted font-medium">
                <span>Subtotal del programa</span>
                <span className="font-bold text-brand-text">{formattedPriceLabel}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-brand-text-muted font-medium">
                <span>Tasas e Impuestos</span>
                <span className="text-brand-secondary font-bold">Sin cargos extra</span>
              </div>
              <div className="flex justify-between items-center text-brand-text font-bold border-t border-slate-100 pt-5">
                <span className="text-sm">Total Final</span>
                <span className="text-2xl font-black text-brand-primary tracking-tight">{formattedPriceLabel}</span>
              </div>
            </div>

            {/* Benefits / Guarantees Checklist */}
            <div className="border-t border-slate-100 pt-6 space-y-3">
              <div className="flex items-start">
                <div className="h-5 w-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0 mr-3 mt-0.5">
                  <FiCheck className="text-xs stroke-[3]" />
                </div>
                <div className="text-xs">
                  <strong className="text-brand-text block font-bold">Acceso inmediato al campus virtual</strong>
                  <span className="text-brand-text-muted font-light">Materiales de estudio y comunidad privada.</span>
                </div>
              </div>
              <div className="flex items-start">
                <div className="h-5 w-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0 mr-3 mt-0.5">
                  <FiCheck className="text-xs stroke-[3]" />
                </div>
                <div className="text-xs">
                  <strong className="text-brand-text block font-bold">Soporte continuo y mentoría</strong>
                  <span className="text-brand-text-muted font-light">Resolución de dudas directo con tutores.</span>
                </div>
              </div>
              <div className="flex items-start">
                <div className="h-5 w-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0 mr-3 mt-0.5">
                  <FiCheck className="text-xs stroke-[3]" />
                </div>
                <div className="text-xs">
                  <strong className="text-brand-text block font-bold">Seguridad garantizada</strong>
                  <span className="text-brand-text-muted font-light">Procesamiento seguro con encriptación SSL de 256 bits.</span>
                </div>
              </div>
            </div>

            {/* Lock/Security disclaimer */}
            <div className="flex items-center justify-center space-x-2 text-[10px] text-slate-400 bg-slate-50 py-3 px-4 rounded-xl border border-slate-100">
              <FiLock className="text-xs flex-shrink-0" />
              <span>Checkout Seguro • Transacción Protegida</span>
            </div>
          </div>

          {/* Formulario de Checkout */}
          <div className="lg:col-span-7">
            <Suspense fallback={
              <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-xl flex justify-center py-24">
                <div className="flex flex-col items-center space-y-4">
                  <svg className="animate-spin h-10 w-10 text-brand-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-xs text-brand-text-muted font-semibold">Cargando pasarela segura...</span>
                </div>
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
                selectedCurrency={validatedCurrency}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}

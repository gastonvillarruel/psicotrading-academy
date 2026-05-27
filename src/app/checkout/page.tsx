import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import CheckoutForm from '@/components/CheckoutForm';

interface CheckoutPageProps {
  searchParams: Promise<{ courseId?: string; plan?: 'MONTHLY' | 'ANNUAL' }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const resolvedParams = await searchParams;
  const { courseId, plan } = resolvedParams;

  // Si no hay parámetros válidos, redirigir a catálogo
  if (!courseId && !plan) {
    redirect('/campus');
  }

  let title = '';
  let description = '';
  let price = 0;

  if (courseId) {
    const course = await db.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      redirect('/campus');
    }

    title = course.title;
    description = course.shortDescription;
    price = course.price;
  } else if (plan) {
    const isMonthly = plan === 'MONTHLY';
    title = isMonthly ? 'Suscripción Académica Mensual' : 'Suscripción Académica Anual';
    description = isMonthly
      ? 'Acceso ilimitado a todos los contenidos por 30 días.'
      : 'Acceso ilimitado a todos los contenidos por 365 días.';
    price = isMonthly ? 8500 : 81600;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Finalizar tu Inscripción</h1>
        <p className="text-gray-500 mt-2">Estás a un paso de comenzar tu entrenamiento.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start max-w-5xl mx-auto">
        {/* Resumen del pedido */}
        <div className="lg:col-span-1 bg-gray-50 border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Resumen del pedido</h2>
          <div className="space-y-4">
            <div>
              <span className="text-xs text-teal-600 font-semibold bg-teal-50 px-2.5 py-1 rounded-md">
                {courseId ? 'Curso Individual' : 'Suscripción'}
              </span>
              <h3 className="font-bold text-gray-900 text-base mt-3 leading-snug">{title}</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
            </div>
            
            <div className="border-t border-gray-200/60 pt-4 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Subtotal</span>
              <span className="font-bold text-gray-950 text-sm">${price.toLocaleString('es-AR')} ARS</span>
            </div>
            <div className="flex justify-between items-center text-teal-700 font-semibold">
              <span className="text-sm">Total</span>
              <span className="text-xl font-extrabold">${price.toLocaleString('es-AR')} ARS</span>
            </div>
          </div>
        </div>

        {/* Formulario de Checkout */}
        <div className="lg:col-span-2">
          <Suspense fallback={
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-lg flex justify-center py-20">
              <svg className="animate-spin h-8 w-8 text-teal-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          }>
            <CheckoutForm courseId={courseId} plan={plan} title={title} price={price} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

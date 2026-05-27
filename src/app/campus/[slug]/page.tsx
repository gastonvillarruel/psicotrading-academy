import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';

interface CoursePageProps {
  params: Promise<{ slug: string }>;
}

async function getCourseBySlug(slug: string) {
  try {
    return await db.course.findUnique({
      where: { slug },
    });
  } catch (error) {
    console.error('Error al obtener curso por slug:', error);
    return null;
  }
}

export default async function CourseDetailPage({ params }: CoursePageProps) {
  const resolvedParams = await params;
  const course = await getCourseBySlug(resolvedParams.slug);

  if (!course) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session;

  // URLs de Checkout dinámicas según autenticación
  const checkoutCourseUrl = isAuthenticated
    ? `/checkout?courseId=${course.id}`
    : `/login?callbackUrl=/campus/${course.slug}`;

  const checkoutMonthlyUrl = isAuthenticated
    ? `/checkout?plan=MONTHLY`
    : `/login?callbackUrl=/campus/${course.slug}`;

  const checkoutAnnualUrl = isAuthenticated
    ? `/checkout?plan=ANNUAL`
    : `/login?callbackUrl=/campus/${course.slug}`;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Volver */}
      <div className="mb-6">
        <Link href="/campus" className="text-teal-600 hover:text-teal-700 text-sm font-semibold flex items-center space-x-1">
          <span>← Volver al catálogo</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Columna izquierda: Información detallada */}
        <div className="lg:col-span-2">
          {course.thumbnail && (
            <div className="h-72 sm:h-96 w-full rounded-2xl overflow-hidden bg-gray-100 mb-8 border border-gray-100 shadow-sm">
              <img
                src={course.thumbnail}
                alt={course.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex items-center space-x-3 mb-4">
            <span className={`px-3 py-1 text-xs font-semibold rounded-full shadow-sm ${
              course.type === 'LIVE' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
            }`}>
              {course.type === 'LIVE' ? 'Curso en Vivo' : 'Curso Grabado'}
            </span>
            {course.type === 'LIVE' && course.scheduledAt && (
              <span className="text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded-full font-medium">
                Comienza: {new Date(course.scheduledAt).toLocaleDateString('es-AR')}
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            {course.title}
          </h1>

          <p className="text-lg text-gray-600 leading-relaxed mb-8">
            {course.shortDescription}
          </p>

          <div className="border-t border-gray-100 pt-8 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Acerca de este curso</h2>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              {course.longDescription.split('\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>

          {/* Instructor Placeholder */}
          <div className="border-t border-gray-100 pt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Tu Instructor</h2>
            <div className="flex items-center space-x-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
              <div className="h-16 w-16 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
                PT
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Prof. Tomás Psicotrader</h3>
                <p className="text-gray-500 text-xs mt-0.5">Especialista en Psicología de Mercados y Coach de Traders</p>
                <p className="text-gray-600 text-xs mt-2 leading-relaxed">
                  Con más de 10 años operando en mercados de futuros y acciones, Tomás ayuda a traders de habla hispana a superar barreras emocionales para operar con consistencia.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha: Compra e inscripciones */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-white rounded-2xl border border-gray-100 p-8 shadow-md flex flex-col">
            <div className="mb-6">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Precio del Curso</span>
              <span className="text-4xl font-extrabold text-teal-700 block mt-1">
                ${course.price.toLocaleString('es-AR')} <span className="text-lg font-medium text-gray-500">ARS</span>
              </span>
            </div>

            {/* Opción 1: Compra Individual */}
            <div className="mb-6 p-4 rounded-xl border border-teal-50 bg-teal-50/20">
              <h3 className="font-bold text-teal-800 text-sm">Acceso Vitalicio</h3>
              <p className="text-xs text-gray-500 mt-1">Comprá el curso individualmente y accedé para siempre.</p>
              <Link
                href={checkoutCourseUrl}
                className="w-full text-center block mt-4 py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-teal-600/10 active:scale-[0.98]"
              >
                Comprar este curso
              </Link>
            </div>

            {/* Divisor */}
            <div className="flex items-center my-4">
              <div className="flex-grow border-t border-gray-100" />
              <span className="mx-3 text-xs text-gray-400 font-semibold uppercase">O</span>
              <div className="flex-grow border-t border-gray-100" />
            </div>

            {/* Opción 2: Suscripción */}
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">Suscripción Académica</h3>
                <p className="text-xs text-gray-500 mt-1">Accedé a todos los cursos y talleres en vivo mediante una membresía activa.</p>
              </div>

              {/* Plan Mensual */}
              <div className="p-4 rounded-xl border border-gray-100 hover:border-teal-200 transition-colors flex justify-between items-center">
                <div>
                  <span className="text-xs text-gray-400 block font-medium">Membresía Mensual</span>
                  <span className="font-bold text-gray-800 text-sm mt-0.5">$8.500 / mes</span>
                </div>
                <Link
                  href={checkoutMonthlyUrl}
                  className="px-4 py-2 bg-gray-900 hover:bg-teal-600 text-white hover:text-white text-xs font-semibold rounded-lg transition-all"
                >
                  Suscribirme
                </Link>
              </div>

              {/* Plan Anual */}
              <div className="p-4 rounded-xl border border-gray-100 hover:border-teal-200 transition-colors flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-teal-600 text-white text-[9px] font-bold uppercase px-2 py-0.5 rounded-bl-lg">
                  Ahorrá 20%
                </div>
                <div>
                  <span className="text-xs text-gray-400 block font-medium">Membresía Anual</span>
                  <span className="font-bold text-gray-800 text-sm mt-0.5">$81.600 / año</span>
                </div>
                <Link
                  href={checkoutAnnualUrl}
                  className="px-4 py-2 bg-gray-900 hover:bg-teal-600 text-white hover:text-white text-xs font-semibold rounded-lg transition-all"
                >
                  Suscribirme
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

import React from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { formatCoursePrice, getDefaultCurrency } from '@/lib/price';
import Countdown from '@/components/Countdown';

interface CourseDetailPageProps {
  params: Promise<{ slug: string }>;
}

async function verifyAccess(userId: string, courseId: string, userRole: string) {
  try {
    // 1. Los administradores siempre tienen acceso
    if (userRole === 'ADMIN') return true;

    // 2. Comprobar si tiene una suscripción activa
    const activeSubscription = await db.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
    });

    if (activeSubscription) return true;

    // 3. Comprobar si compró este curso individualmente
    const completedPurchase = await db.purchase.findFirst({
      where: {
        userId,
        courseId,
        status: 'COMPLETED',
      },
    });

    return !!completedPurchase;
  } catch (error) {
    console.error('Error al verificar acceso al curso:', error);
    return false;
  }
}

export default async function StudentCourseDetailPage({ params }: CourseDetailPageProps) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return null; // El middleware redirecciona
  }

  const resolvedParams = await params;
  const course = await db.course.findUnique({
    where: { slug: resolvedParams.slug },
  });

  if (!course) {
    notFound();
  }

  const isAvailable = course.available !== false;
  const isAdmin = session.user.role === 'ADMIN';

  if (!isAvailable && !isAdmin) {
    redirect('/mi-campus');
  }

  const hasAccess = await verifyAccess(session.user.id, course.id, session.user.role);

  // --- ESCENARIO 1: NO TIENE ACCESO (UPSELL GATE) ---
  if (!hasAccess) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white rounded-3xl border border-gray-100 p-8 md:p-12 shadow-xl text-center">
          <div className="h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0-6v2m0-8H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-5" />
            </svg>
          </div>

          <h1 className="text-3xl font-extrabold text-gray-900 mb-4">Contenido Restringido</h1>
          <p className="text-gray-500 text-sm max-w-lg mx-auto mb-8 leading-relaxed">
            No tenés acceso a <strong>{course.title}</strong>. Para ingresar a esta clase necesitas comprar el curso de manera individual o contar con una membresía activa.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl mx-auto">
            {/* Opción Individual */}
            <div className="p-6 rounded-2xl border border-gray-100 bg-gray-50 text-left flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Acceso Vitalicio</h3>
                <p className="text-xs text-gray-500 mt-1">Accedé a este programa de forma permanente.</p>
              </div>
              <div className="mt-6">
                {(() => {
                  const defaultCurrency = getDefaultCurrency(course);
                  const pricing = formatCoursePrice(course, defaultCurrency);
                  return (
                    <>
                      {pricing.hasOriginalPrice && (
                        <span className="text-xs text-gray-400 line-through block mb-0.5 font-light">
                          {pricing.originalPriceLabel}
                        </span>
                      )}
                      <span className="text-xl font-extrabold text-teal-700 block mb-3">
                        {pricing.currentPriceLabel}
                      </span>
                      <Link
                        href={`/checkout?courseId=${course.id}&currency=${defaultCurrency}`}
                        className="w-full text-center block py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-teal-600/10 active:scale-[0.98]"
                      >
                        Comprar Curso
                      </Link>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Opción Suscripción */}
            <div className="p-6 rounded-2xl border border-gray-100 bg-teal-50/10 text-left flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-teal-600 text-white text-[8px] font-bold uppercase px-2.5 py-0.5 rounded-bl-lg">
                Recomendado
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Pase Completo</h3>
                <p className="text-xs text-gray-500 mt-1">Acceso a TODOS los cursos y grabaciones.</p>
              </div>
              <div className="mt-6">
                <span className="text-xl font-extrabold text-teal-700 block">$8.500 <span className="text-[10px] font-medium text-gray-500">/ mes</span></span>
                <Link
                  href="/checkout?plan=MONTHLY"
                  className="w-full text-center block mt-3 py-2.5 px-4 bg-gray-900 hover:bg-teal-600 text-white text-xs font-semibold rounded-xl transition-all active:scale-[0.98]"
                >
                  Suscribirse
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-gray-100 pt-6">
            <Link href="/" className="text-sm font-semibold text-teal-600 hover:text-teal-700">
              ← Volver al catálogo público
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // --- ESCENARIO 2: TIENE ACCESO (VISUALIZADOR) ---
  const isLive = course.type === 'LIVE';
  const scheduledTime = course.scheduledAt ? new Date(course.scheduledAt).getTime() : 0;
  const isFutureLive = isLive && scheduledTime > Date.now();

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Botón de retroceso */}
      <div className="mb-6">
        <Link href="/mi-campus" className="text-teal-600 hover:text-teal-700 text-sm font-semibold flex items-center space-x-1">
          <span>← Volver a mi campus</span>
        </Link>
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-6">
        {course.title}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Columna Izquierda: Reproductor o Control de Vivo */}
        <div className="lg:col-span-2 space-y-6">
          {/* Si es un vivo programado en el futuro */}
          {isFutureLive ? (
            <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-md flex flex-col items-center justify-center min-h-[350px] text-center">
              <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full uppercase tracking-wider mb-6 animate-pulse">
                Transmisión En Vivo Programada
              </span>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Comienza en:</h2>
              
              <div className="w-full max-w-sm mb-8">
                {course.scheduledAt && (
                  <Countdown targetDate={course.scheduledAt} />
                )}
              </div>

              <button
                disabled
                className="px-8 py-3.5 bg-gray-100 text-gray-400 font-semibold rounded-xl cursor-not-allowed text-sm"
              >
                Ingresar a la sala (Inactivo hasta comenzar)
              </button>
              <p className="text-[10px] text-gray-400 mt-2">
                La sala se habilitará 10 minutos antes del inicio.
              </p>
            </div>
          ) : (
            /* Si es curso grabado o un vivo que ya pasó/está transcurriendo */
            <div>
              {course.videoUrl ? (
                <div className="aspect-video w-full rounded-3xl overflow-hidden bg-black shadow-lg border border-gray-100">
                  <iframe
                    src={course.videoUrl}
                    title={course.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-md flex flex-col items-center justify-center min-h-[350px] text-center">
                  <svg className="h-12 w-12 text-teal-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {isLive ? (
                    <>
                      <h2 className="text-lg font-bold text-gray-900 mb-2">¡El taller está en curso!</h2>
                      <p className="text-gray-500 text-xs max-w-sm mb-6">Hacé clic abajo para unirte a la transmisión interactiva.</p>
                      <a
                        href="https://zoom.us" // Enlace de prueba simulado
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-8 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl transition-all shadow-md shadow-teal-600/10 active:scale-[0.98]"
                      >
                        Unirse a Zoom Live
                      </a>
                    </>
                  ) : (
                    <>
                      <h2 className="text-lg font-bold text-gray-900 mb-2">Clase en Preparación</h2>
                      <p className="text-gray-500 text-xs max-w-sm">Próximamente se subirá el material audiovisual de esta sesión operativa.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-2">Descripción del programa</h2>
            <p className="text-gray-600 text-sm leading-relaxed">{course.longDescription}</p>
          </div>
        </div>

        {/* Columna Derecha: Temario / Recursos */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-4">Temas de la sesión</h2>
            <div className="space-y-3">
              <div className="flex items-start space-x-3 text-sm">
                <span className="h-5 w-5 bg-teal-100 text-teal-700 font-bold rounded-full flex items-center justify-center text-xs mt-0.5">1</span>
                <div>
                  <span className="font-semibold text-gray-800 block">Diagnóstico Emocional Inicial</span>
                  <span className="text-[10px] text-gray-400">Reconocer los sesgos cognitivos propios.</span>
                </div>
              </div>
              <div className="flex items-start space-x-3 text-sm">
                <span className="h-5 w-5 bg-teal-100 text-teal-700 font-bold rounded-full flex items-center justify-center text-xs mt-0.5">2</span>
                <div>
                  <span className="font-semibold text-gray-800 block">Manejo Práctico del Stop Loss</span>
                  <span className="text-[10px] text-gray-400">Técnicas de aceptación psicológica de la pérdida.</span>
                </div>
              </div>
              <div className="flex items-start space-x-3 text-sm">
                <span className="h-5 w-5 bg-teal-100 text-teal-700 font-bold rounded-full flex items-center justify-center text-xs mt-0.5">3</span>
                <div>
                  <span className="font-semibold text-gray-800 block">Plan de Trading Personalizado</span>
                  <span className="text-[10px] text-gray-400">Diseño de reglas inviolables en tu bitácora.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-3">Recursos Descargables</h2>
            <div className="space-y-2">
              <span className="block text-xs text-gray-400">No hay archivos para descargar en esta clase.</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

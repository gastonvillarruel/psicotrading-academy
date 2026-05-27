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
    <main className="min-h-screen bg-brand-bg py-12 transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Volver */}
        <div className="mb-6">
          <Link href="/campus" className="text-brand-secondary hover:text-brand-primary text-sm font-semibold flex items-center space-x-1 transition-colors">
            <span>← Volver al catálogo</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Columna izquierda: Información detallada */}
          <div className="lg:col-span-8">
            {course.thumbnail && (
              <div className="h-72 sm:h-96 w-full rounded-xl overflow-hidden bg-brand-bg-sec mb-8 border border-brand-border/30 shadow-sm relative">
                <img
                  src={course.thumbnail}
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="flex items-center space-x-3 mb-4">
              <span className={`px-3 py-1 text-xs font-bold rounded-md shadow-sm ${
                course.type === 'LIVE' 
                  ? 'bg-brand-accent/15 text-brand-accent border border-brand-accent/20' 
                  : 'bg-brand-secondary/15 text-brand-secondary border border-brand-secondary/20'
              }`}>
                {course.type === 'LIVE' ? 'Mentoria en Vivo' : 'Entrenamiento Grabado'}
              </span>
              {course.type === 'LIVE' && course.scheduledAt && (
                <span className="text-xs text-brand-accent bg-brand-accent/10 px-3 py-1 rounded-md font-semibold border border-brand-accent/20">
                  Comienza: {new Date(course.scheduledAt).toLocaleDateString('es-AR')}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-brand-text tracking-tight mb-4">
              {course.title}
            </h1>

            <p className="text-lg text-brand-text-muted leading-relaxed mb-8">
              {course.shortDescription}
            </p>

            <div className="border-t border-brand-border/20 pt-8 mb-8">
              <h2 className="text-xl font-bold text-brand-text mb-4">Acerca de este curso</h2>
              <div className="text-brand-text-muted text-sm leading-relaxed space-y-4 font-light">
                {course.longDescription.split('\n').map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>

            {/* Instructor */}
            <div className="border-t border-brand-border/20 pt-8">
              <h2 className="text-xl font-bold text-brand-text mb-4">Tu Instructor</h2>
              <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 bg-brand-card p-6 rounded-xl border border-brand-border/30">
                <div className="h-16 w-16 rounded-full bg-brand-primary text-white flex items-center justify-center font-bold text-xl shadow-sm flex-shrink-0">
                  EG
                </div>
                <div>
                  <h3 className="font-bold text-brand-text text-center sm:text-left">El Gonzo</h3>
                  <p className="text-brand-text-muted text-xs mt-0.5 text-center sm:text-left">Especialista en Psicología de Trading y Fundador de PSICOEMOTRADING</p>
                  <p className="text-brand-text-muted text-xs mt-3 leading-relaxed text-center sm:text-left font-light">
                    Con años de experiencia acompañando a traders en su desarrollo mental, El Gonzo enfoca su mentoría en erradicar conductas compulsivas y reconfigurar la respuesta ante el riesgo y la incertidumbre.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Columna derecha: Compra e inscripciones */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 bg-brand-card rounded-xl border border-brand-border/30 p-8 shadow-sm flex flex-col transition-all">
              <div className="mb-6">
                <span className="text-xs text-brand-text-muted font-bold uppercase tracking-wider block">Precio del Curso</span>
                <span className="text-4xl font-extrabold text-brand-primary block mt-1">
                  ${course.price.toLocaleString('es-AR')} <span className="text-lg font-medium text-brand-text-muted">ARS</span>
                </span>
              </div>

              {/* Opción 1: Compra Individual */}
              <div className="mb-6 p-5 rounded-lg border border-brand-secondary/15 bg-brand-secondary/5">
                <h3 className="font-bold text-brand-secondary text-sm">Acceso Vitalicio</h3>
                <p className="text-xs text-brand-text-muted mt-1 font-light">Comprá el curso individualmente y accedé para siempre a todas las lecciones.</p>
                <Link
                  href={checkoutCourseUrl}
                  className="w-full text-center block mt-4 py-3 px-4 bg-brand-primary hover:bg-brand-primary/95 text-white text-sm font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98]"
                >
                  Comprar este curso
                </Link>
              </div>

              {/* Divisor */}
              <div className="flex items-center my-4">
                <div className="flex-grow border-t border-brand-border/20" />
                <span className="mx-3 text-[10px] text-brand-text-muted/60 font-bold uppercase tracking-wider">O también</span>
                <div className="flex-grow border-t border-brand-border/20" />
              </div>

              {/* Opción 2: Suscripción */}
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-brand-text text-sm">Membresía Completa</h3>
                  <p className="text-xs text-brand-text-muted mt-1 font-light">Accedé a todos los cursos y talleres de acompañamiento mediante una membresía activa.</p>
                </div>

                {/* Plan Mensual */}
                <div className="p-4 rounded-lg border border-brand-border/30 hover:border-brand-primary/45 transition-colors flex justify-between items-center bg-brand-bg-sec/10">
                  <div>
                    <span className="text-[10px] text-brand-text-muted block font-bold uppercase tracking-wider">Suscripción Mensual</span>
                    <span className="font-bold text-brand-text text-sm mt-0.5">$8.500 / mes</span>
                  </div>
                  <Link
                    href={checkoutMonthlyUrl}
                    className="px-4 py-2 bg-brand-secondary hover:bg-brand-primary text-white text-xs font-semibold rounded-md transition-all shadow-sm"
                  >
                    Suscribirme
                  </Link>
                </div>

                {/* Plan Anual */}
                <div className="p-4 rounded-lg border border-brand-border/30 hover:border-brand-primary/45 transition-colors flex justify-between items-center bg-brand-bg-sec/10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-brand-accent text-white text-[9px] font-bold uppercase px-2 py-0.5 rounded-bl-md">
                    Ahorrá 20%
                  </div>
                  <div>
                    <span className="text-[10px] text-brand-text-muted block font-bold uppercase tracking-wider">Suscripción Anual</span>
                    <span className="font-bold text-brand-text text-sm mt-0.5">$81.600 / año</span>
                  </div>
                  <Link
                    href={checkoutAnnualUrl}
                    className="px-4 py-2 bg-brand-secondary hover:bg-brand-primary text-white text-xs font-semibold rounded-md transition-all shadow-sm"
                  >
                    Suscribirme
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

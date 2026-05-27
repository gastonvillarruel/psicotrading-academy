import React from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';

async function getFeaturedCourses() {
  try {
    const courses = await db.course.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
    });
    return courses;
  } catch (error) {
    console.error('Error al cargar cursos destacados en Landing:', error);
    return [];
  }
}

export default async function LandingPage() {
  const courses = await getFeaturedCourses();

  return (
    <main className="w-full">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gray-900 via-teal-950 to-gray-900 text-white py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.1),transparent_50%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
            Psicotrading Academy
          </h1>
          <p className="text-xl md:text-2xl text-teal-200 max-w-3xl mx-auto mb-10 leading-relaxed font-light">
            Controlá tu mente. Dominá tus emociones. Conquistá los mercados financieros con disciplina militar.
          </p>
          <div className="flex justify-center space-x-4">
            <Link
              href="/campus"
              className="px-8 py-4 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl shadow-lg shadow-teal-500/20 active:scale-[0.98] transition-all"
            >
              Ver cursos
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">¿Qué vas a aprender?</h2>
            <p className="text-gray-500 mt-2">Los tres pilares esenciales de un trader consistente.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="p-8 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
              <div className="h-12 w-12 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center font-bold text-lg mb-6">
                01
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Control Emocional</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Aprendé a identificar y erradicar el miedo a perder, la codicia excesiva y el FOMO (miedo a quedarse afuera) antes de que destruyan tu cuenta.
              </p>
            </div>

            {/* Card 2 */}
            <div className="p-8 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
              <div className="h-12 w-12 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center font-bold text-lg mb-6">
                02
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Bitácora y Métricas</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Descubrí cómo llevar una bitácora operativa enfocada en tu estado mental para correlacionar tus emociones con tus resultados técnicos.
              </p>
            </div>

            {/* Card 3 */}
            <div className="p-8 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
              <div className="h-12 w-12 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center font-bold text-lg mb-6">
                03
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Gestión de Riesgo</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Mantené la calma durante las rachas perdedoras (drawdown) calculando de manera científica el tamaño de tu posición según tu perfil de tolerancia.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Courses Section */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center mb-12">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Cursos Destacados</h2>
              <p className="text-gray-500 mt-1">Nuestros programas de entrenamiento más elegidos.</p>
            </div>
            <Link
              href="/campus"
              className="mt-4 md:mt-0 text-teal-600 hover:text-teal-700 font-semibold flex items-center space-x-1"
            >
              <span>Ver todos los cursos</span>
              <span>→</span>
            </Link>
          </div>

          {courses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
              <p className="text-gray-500">Pronto tendremos cursos disponibles. ¡Mantente al tanto!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {courses.map((course) => (
                <div
                  key={course.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all"
                >
                  {course.thumbnail && (
                    <div className="h-48 w-full overflow-hidden bg-gray-100 relative">
                      <img
                        src={course.thumbnail}
                        alt={course.title}
                        className="w-full h-full object-cover"
                      />
                      <span className={`absolute top-4 right-4 px-3 py-1 text-xs font-semibold rounded-full shadow-sm ${
                        course.type === 'LIVE' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
                      }`}>
                        {course.type === 'LIVE' ? 'En Vivo' : 'Grabado'}
                      </span>
                    </div>
                  )}
                  <div className="p-6 flex-grow flex flex-col">
                    <h3 className="text-lg font-bold text-gray-900 line-clamp-1 mb-2">
                      {course.title}
                    </h3>
                    <p className="text-gray-500 text-sm line-clamp-2 mb-4">
                      {course.shortDescription}
                    </p>
                    <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                      <span className="text-lg font-extrabold text-teal-700">
                        ${course.price.toLocaleString('es-AR')} ARS
                      </span>
                      <Link
                        href={`/campus/${course.slug}`}
                        className="text-sm font-semibold text-teal-600 hover:text-teal-700"
                      >
                        Más info
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

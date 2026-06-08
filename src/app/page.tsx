import React, { Suspense } from 'react';
import { db } from '@/lib/db';
import HeroSlider from '@/components/HeroSlider';
import { heroSlides } from '@/config/heroSlides';
import CampusCourseCard from '@/components/CampusCourseCard';

interface PageProps {
  searchParams: Promise<{ q?: string; type?: string; priceSort?: string }>;
}

async function getFilteredCourses(params: { q?: string; type?: string; priceSort?: string }) {
  try {
    const where: any = {};

    if (params.q) {
      where.title = {
        contains: params.q,
        mode: 'insensitive',
      };
    }

    if (params.type) {
      where.type = params.type;
    }

    const courses = await db.course.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Serializar campos Decimal para evitar errores de transmisión a componentes cliente
    const serializedCourses = courses.map(course => ({
      ...course,
      priceUSDT: course.priceUSDT ? Number(course.priceUSDT) : null,
      originalPriceUSDT: course.originalPriceUSDT ? Number(course.originalPriceUSDT) : null,
    }));

    if (params.priceSort === 'asc' || params.priceSort === 'desc') {
      return serializedCourses.sort((a, b) => {
        return params.priceSort === 'asc' ? a.price - b.price : b.price - a.price;
      });
    }

    // Custom sorting: sortOrder > 0 (asc), then sortOrder = 0 (createdAt desc)
    return serializedCourses.sort((a, b) => {
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;

      if (orderA > 0 && orderB > 0) {
        return orderA - orderB;
      }
      if (orderA > 0 && orderB <= 0) {
        return -1;
      }
      if (orderA <= 0 && orderB > 0) {
        return 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } catch (error) {
    console.error('Error al obtener cursos filtrados:', error);
    return [];
  }
}

export default async function HomePage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const courses = await getFilteredCourses(resolvedParams);

  const activeSlides = heroSlides
    .filter((slide) => slide.active)
    .sort((a, b) => a.order - b.order);

  const liveCourses = courses.filter((course) => course.type === 'LIVE');
  const recordedCourses = courses.filter((course) => course.type === 'RECORDED');

  return (
    <main className="min-h-screen bg-brand-bg pb-12 home-typography">
      <HeroSlider slides={activeSlides} />

      {/* Banner de Descuento Criptomonedas */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-950/10 via-brand-card to-amber-950/5 py-2.5 px-4 shadow-[0_2px_12px_-3px_rgba(245,158,11,0.06)] flex flex-col sm:flex-row items-center justify-between gap-3 group hover:border-amber-500/35 transition-all duration-300">
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <img
              src="https://assets.coingecko.com/coins/images/1/large/bitcoin.png"
              alt="Crypto"
              className="h-8 w-8 rounded-full object-contain flex-shrink-0 group-hover:scale-105 transition-transform duration-300"
            />
            <div className="text-left">
              <p className="text-sm sm:text-base font-bold text-brand-text flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>¡Descuento Extra con Criptomonedas!</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-black bg-amber-500/15 text-amber-500 border border-amber-500/25 uppercase tracking-wider animate-pulse">
                  Exclusivo Crypto
                </span>
                <span className="text-brand-text-muted font-normal text-xs sm:text-sm">
                  Ahorrá pagando con criptomonedas. Seleccioná Crypto al finalizar tu compra.
                </span>
              </p>
            </div>
          </div>

          <div className="flex-shrink-0">
            <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-500 text-xs font-black uppercase tracking-wider select-none shadow-sm">
              Hasta 20% OFF
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        {courses.length === 0 ? (
          <div className="bg-brand-card rounded-xl border border-brand-border/30 p-16 text-center shadow-sm">
            <svg className="mx-auto h-12 w-12 text-brand-text-muted/60 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-bold text-brand-text mb-1">No encontramos entrenamientos</h3>
            <p className="text-brand-text-muted text-base">Intentá cambiar tus filtros o el término de búsqueda.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Sección: Cursos y Talleres en Vivo */}
            {liveCourses.length > 0 && (
              <details open className="group transition-all duration-300">
                <summary className="flex items-center justify-between p-5 sm:p-6 cursor-pointer list-none select-none rounded-2xl border border-brand-border/20 border-l-4 border-l-brand-accent/80 bg-gradient-to-r from-brand-accent/[0.04] to-brand-card/30 hover:from-brand-accent/[0.08] hover:to-brand-card/50 transition-all duration-300 shadow-[0_2px_8px_-3px_rgba(180,83,9,0.08)]">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-brand-accent/15 rounded-xl text-brand-accent border border-brand-accent/25">
                      <svg className="h-6 w-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text flex items-center gap-2">
                        Cursos y Talleres en Vivo
                      </h2>
                      <p className="text-brand-text-muted text-base mt-1">
                        Participa de clases en vivo, talleres interactivos y espacios de acompañamiento en tiempo real.
                      </p>
                    </div>
                  </div>
                  <span className="text-brand-text-muted group-open:rotate-180 transition-transform duration-300">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <div className="mt-4 p-4 sm:p-6 rounded-2xl border border-brand-border/15 bg-brand-card shadow-sm">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {liveCourses.map((course) => (
                      <CampusCourseCard key={course.id} course={course} />
                    ))}
                  </div>
                </div>
              </details>
            )}

            {/* Sección: Cursos y Talleres Grabados */}
            {recordedCourses.length > 0 && (
              <details open className="group transition-all duration-300">
                <summary className="flex items-center justify-between p-5 sm:p-6 cursor-pointer list-none select-none rounded-2xl border border-brand-border/20 border-l-4 border-l-brand-secondary/80 bg-gradient-to-r from-brand-secondary/[0.04] to-brand-card/30 hover:from-brand-secondary/[0.08] hover:to-brand-card/50 transition-all duration-300 shadow-[0_2px_8px_-3px_rgba(15,118,110,0.08)]">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-brand-secondary/15 rounded-xl text-brand-secondary border border-brand-secondary/25">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text flex items-center gap-2">
                        Cursos y Talleres Grabados
                      </h2>
                      <p className="text-brand-text-muted text-base mt-1">
                        Aprende a tu ritmo con contenidos disponibles las 24 horas.
                      </p>
                    </div>
                  </div>
                  <span className="text-brand-text-muted group-open:rotate-180 transition-transform duration-300">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <div className="mt-4 p-4 sm:p-6 rounded-2xl border border-brand-border/15 bg-brand-card shadow-sm">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {recordedCourses.map((course) => (
                      <CampusCourseCard key={course.id} course={course} />
                    ))}
                  </div>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

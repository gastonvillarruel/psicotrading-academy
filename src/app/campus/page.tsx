import React, { Suspense } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import HeroSlider from '@/components/HeroSlider';
import { heroSlides } from '@/config/heroSlides';
import { formatCoursePrice, getDefaultCurrency } from '@/lib/price';

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

    const orderBy: any = {};
    if (params.priceSort === 'asc' || params.priceSort === 'desc') {
      orderBy.price = params.priceSort;
    } else {
      orderBy.createdAt = 'desc';
    }

    return await db.course.findMany({
      where,
      orderBy,
    });
  } catch (error) {
    console.error('Error al obtener cursos filtrados:', error);
    return [];
  }
}

export default async function CampusPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const courses = await getFilteredCourses(resolvedParams);

  const activeSlides = heroSlides
    .filter((slide) => slide.active)
    .sort((a, b) => a.order - b.order);

  const liveCourses = courses.filter((course) => course.type === 'LIVE');
  const recordedCourses = courses.filter((course) => course.type === 'RECORDED');

  return (
    <main className="min-h-screen bg-brand-bg pb-12">
      <HeroSlider slides={activeSlides} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        {courses.length === 0 ? (
          <div className="bg-brand-card rounded-xl border border-brand-border/30 p-16 text-center shadow-sm">
            <svg className="mx-auto h-12 w-12 text-brand-text-muted/60 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-bold text-brand-text mb-1">No encontramos entrenamientos</h3>
            <p className="text-brand-text-muted text-sm">Intentá cambiar tus filtros o el término de búsqueda.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Sección: Cursos y Talleres en Vivo */}
            {liveCourses.length > 0 && (
              <details open className="group border border-brand-border/20 rounded-2xl bg-brand-card/50 overflow-hidden transition-all duration-300">
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none select-none hover:bg-brand-card transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-brand-accent/15 rounded-xl text-brand-accent border border-brand-accent/25">
                      <svg className="h-6 w-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <h2 className="text-xl font-extrabold text-brand-text flex items-center gap-2">
                        Cursos y Talleres en Vivo
                        <span className="text-xs bg-brand-accent/10 text-brand-accent border border-brand-accent/25 px-2.5 py-0.5 rounded-full font-bold">
                          {liveCourses.length}
                        </span>
                      </h2>
                      <p className="text-brand-text-muted text-sm mt-0.5">
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
                <div className="p-6 border-t border-brand-border/15 bg-brand-bg/20">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {liveCourses.map((course) => {
                      const isAvailable = (course as any).available !== false;
                      return (
                        <div
                          key={course.id}
                          className={`bg-brand-card rounded-xl border border-brand-border/30 shadow-sm overflow-hidden flex flex-col transition-all duration-300 ${
                            isAvailable 
                              ? "hover:shadow-md hover:-translate-y-0.5" 
                              : "opacity-85 cursor-not-allowed"
                          }`}
                        >
                          {course.thumbnail && (
                            <div className="h-48 w-full overflow-hidden bg-brand-bg-sec relative">
                              <img
                                src={course.thumbnail}
                                alt={course.title}
                                className={`w-full h-full object-cover animate-fade-in ${!isAvailable ? 'grayscale' : ''}`}
                              />
                              {!isAvailable ? (
                                <>
                                  <div className="absolute inset-0 bg-black/45 backdrop-blur-[0.5px]" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="px-3.5 py-2 text-xs font-bold rounded-lg shadow-lg bg-black/75 text-white border border-white/10 uppercase tracking-wider backdrop-blur-sm">
                                      Próximamente
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <span className="absolute top-4 right-4 px-3 py-1 text-xs font-bold rounded-md shadow-sm bg-brand-accent/15 text-brand-accent border border-brand-accent/25">
                                  En Vivo
                                </span>
                              )}
                            </div>
                          )}
                          <div className="p-6 flex-grow flex flex-col">
                            <h3 className="text-lg font-bold text-brand-text line-clamp-1 mb-2">
                              {course.title}
                            </h3>
                            <p className="text-brand-text-muted text-sm line-clamp-2 mb-4">
                              {course.shortDescription}
                            </p>

                            {course.scheduledAt && (
                              <div className="mb-4 text-xs text-brand-accent bg-brand-accent/10 px-3 py-1.5 rounded-md font-semibold border border-brand-accent/20 inline-block self-start">
                                Comienza: {new Date(course.scheduledAt).toLocaleDateString('es-AR', {
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric'
                                })}
                              </div>
                            )}

                            <div className="mt-auto pt-4 border-t border-brand-border/20 flex items-center justify-between">
                              <div className="flex flex-col">
                                {isAvailable && (() => {
                                  const pricing = formatCoursePrice(course, getDefaultCurrency(course));
                                  return (
                                    <>
                                      {pricing.hasOriginalPrice && (
                                        <span className="text-xs text-brand-text-muted/65 line-through font-light">
                                          {pricing.originalPriceLabel}
                                        </span>
                                      )}
                                      <span className="text-lg font-extrabold text-brand-primary">
                                        {pricing.currentPriceLabel}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                              {isAvailable ? (
                                <Link
                                  href={`/campus/${course.slug}`}
                                  className="text-sm font-semibold text-white bg-brand-primary hover:bg-brand-primary/95 px-4 py-2 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                                >
                                  Ver detalles
                                </Link>
                              ) : (
                                <button
                                  disabled
                                  className="text-sm font-semibold text-brand-text-muted bg-brand-border/40 px-4 py-2 rounded-lg cursor-not-allowed border border-brand-border/10"
                                >
                                  Próximamente
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </details>
            )}

            {/* Sección: Cursos y Talleres Grabados */}
            {recordedCourses.length > 0 && (
              <details open className="group border border-brand-border/20 rounded-2xl bg-brand-card/50 overflow-hidden transition-all duration-300">
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none select-none hover:bg-brand-card transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-brand-secondary/15 rounded-xl text-brand-secondary border border-brand-secondary/25">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <h2 className="text-xl font-extrabold text-brand-text flex items-center gap-2">
                        Cursos y Talleres Grabados
                        <span className="text-xs bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/25 px-2.5 py-0.5 rounded-full font-bold">
                          {recordedCourses.length}
                        </span>
                      </h2>
                      <p className="text-brand-text-muted text-sm mt-0.5">
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
                <div className="p-6 border-t border-brand-border/15 bg-brand-bg/20">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {recordedCourses.map((course) => {
                      const isAvailable = (course as any).available !== false;
                      return (
                        <div
                          key={course.id}
                          className={`bg-brand-card rounded-xl border border-brand-border/30 shadow-sm overflow-hidden flex flex-col transition-all duration-300 ${
                            isAvailable 
                              ? "hover:shadow-md hover:-translate-y-0.5" 
                              : "opacity-85 cursor-not-allowed"
                          }`}
                        >
                          {course.thumbnail && (
                            <div className="h-48 w-full overflow-hidden bg-brand-bg-sec relative">
                              <img
                                src={course.thumbnail}
                                alt={course.title}
                                className={`w-full h-full object-cover animate-fade-in ${!isAvailable ? 'grayscale' : ''}`}
                              />
                              {!isAvailable ? (
                                <>
                                  <div className="absolute inset-0 bg-black/45 backdrop-blur-[0.5px]" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="px-3.5 py-2 text-xs font-bold rounded-lg shadow-lg bg-black/75 text-white border border-white/10 uppercase tracking-wider backdrop-blur-sm">
                                      Próximamente
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <span className="absolute top-4 right-4 px-3 py-1 text-xs font-bold rounded-md shadow-sm bg-brand-secondary/15 text-brand-secondary border border-brand-secondary/25">
                                  Grabado
                                </span>
                              )}
                            </div>
                          )}
                          <div className="p-6 flex-grow flex flex-col">
                            <h3 className="text-lg font-bold text-brand-text line-clamp-1 mb-2">
                              {course.title}
                            </h3>
                            <p className="text-brand-text-muted text-sm line-clamp-2 mb-4">
                              {course.shortDescription}
                            </p>

                            <div className="mt-auto pt-4 border-t border-brand-border/20 flex items-center justify-between">
                              <div className="flex flex-col">
                                {isAvailable && (() => {
                                  const pricing = formatCoursePrice(course, getDefaultCurrency(course));
                                  return (
                                    <>
                                      {pricing.hasOriginalPrice && (
                                        <span className="text-xs text-brand-text-muted/65 line-through font-light">
                                          {pricing.originalPriceLabel}
                                        </span>
                                      )}
                                      <span className="text-lg font-extrabold text-brand-primary">
                                        {pricing.currentPriceLabel}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                              {isAvailable ? (
                                <Link
                                  href={`/campus/${course.slug}`}
                                  className="text-sm font-semibold text-white bg-brand-primary hover:bg-brand-primary/95 px-4 py-2 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                                >
                                  Ver detalles
                                </Link>
                              ) : (
                                <button
                                  disabled
                                  className="text-sm font-semibold text-brand-text-muted bg-brand-border/40 px-4 py-2 rounded-lg cursor-not-allowed border border-brand-border/10"
                                >
                                  Próximamente
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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

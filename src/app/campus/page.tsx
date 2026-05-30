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

    if (params.priceSort === 'asc' || params.priceSort === 'desc') {
      return courses.sort((a, b) => {
        return params.priceSort === 'asc' ? a.price - b.price : b.price - a.price;
      });
    }

    // Custom sorting: sortOrder > 0 (asc), then sortOrder = 0 (createdAt desc)
    return courses.sort((a, b) => {
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
                    {liveCourses.map((course) => (
                      <CampusCourseCard key={course.id} course={course} />
                    ))}
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

import React, { Suspense } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import CatalogFilters from '@/components/CatalogFilters';

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

  return (
    <main className="min-h-screen bg-brand-bg py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center md:text-left">
          <span className="text-xs font-bold tracking-widest text-brand-primary uppercase mb-2 block">
            Nuestros Entrenamientos
          </span>
          <h1 className="text-3xl font-extrabold text-brand-text tracking-tight">Catálogo de Cursos</h1>
          <p className="text-brand-text-muted mt-2">Explorá nuestros programas intensivos de psicotrading y control mental.</p>
        </div>

        <Suspense fallback={<div className="h-16 bg-brand-bg-sec/50 animate-pulse rounded-xl mb-10 border border-brand-border/30" />}>
          <CatalogFilters />
        </Suspense>

        {courses.length === 0 ? (
          <div className="bg-brand-card rounded-xl border border-brand-border/30 p-16 text-center shadow-sm">
            <svg className="mx-auto h-12 w-12 text-brand-text-muted/60 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-bold text-brand-text mb-1">No encontramos entrenamientos</h3>
            <p className="text-brand-text-muted text-sm">Intentá cambiar tus filtros o el término de búsqueda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {courses.map((course) => (
              <div
                key={course.id}
                className="bg-brand-card rounded-xl border border-brand-border/30 shadow-sm overflow-hidden flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                {course.thumbnail && (
                  <div className="h-48 w-full overflow-hidden bg-brand-bg-sec relative">
                    <img
                      src={course.thumbnail}
                      alt={course.title}
                      className="w-full h-full object-cover animate-fade-in"
                    />
                    <span className={`absolute top-4 right-4 px-3 py-1 text-xs font-bold rounded-md shadow-sm ${
                      course.type === 'LIVE' 
                        ? 'bg-brand-accent/15 text-brand-accent border border-brand-accent/25' 
                        : 'bg-brand-secondary/15 text-brand-secondary border border-brand-secondary/25'
                    }`}>
                      {course.type === 'LIVE' ? 'En Vivo' : 'Grabado'}
                    </span>
                  </div>
                )}
                <div className="p-6 flex-grow flex flex-col">
                  <h3 className="text-lg font-bold text-brand-text line-clamp-1 mb-2">
                    {course.title}
                  </h3>
                  <p className="text-brand-text-muted text-sm line-clamp-2 mb-4">
                    {course.shortDescription}
                  </p>

                  {course.type === 'LIVE' && course.scheduledAt && (
                    <div className="mb-4 text-xs text-brand-accent bg-brand-accent/10 px-3 py-1.5 rounded-md font-semibold border border-brand-accent/20 inline-block self-start">
                      Comienza: {new Date(course.scheduledAt).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </div>
                  )}

                  <div className="mt-auto pt-4 border-t border-brand-border/20 flex items-center justify-between">
                    <span className="text-lg font-extrabold text-brand-primary">
                      ${course.price.toLocaleString('es-AR')} ARS
                    </span>
                    <Link
                      href={`/campus/${course.slug}`}
                      className="text-sm font-semibold text-white bg-brand-primary hover:bg-brand-primary/95 px-4 py-2 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                    >
                      Ver detalles
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

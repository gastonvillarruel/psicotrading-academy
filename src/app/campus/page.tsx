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
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Catálogo de Cursos</h1>
        <p className="text-gray-500 mt-2">Explorá nuestros programas intensivos de psicotrading.</p>
      </div>

      <Suspense fallback={<div className="h-16 bg-gray-100 animate-pulse rounded-2xl mb-10" />}>
        <CatalogFilters />
      </Suspense>

      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center shadow-sm">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No encontramos cursos</h3>
          <p className="text-gray-500 text-sm">Intentá cambiar tus filtros o la búsqueda.</p>
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

                {course.type === 'LIVE' && course.scheduledAt && (
                  <div className="mb-4 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg font-medium inline-block self-start">
                    Comienza: {new Date(course.scheduledAt).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </div>
                )}

                <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-lg font-extrabold text-teal-700">
                    ${course.price.toLocaleString('es-AR')} ARS
                  </span>
                  <Link
                    href={`/campus/${course.slug}`}
                    className="text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 px-4 py-2 rounded-xl transition-all shadow-md shadow-teal-600/5 hover:shadow-teal-600/15"
                  >
                    Ver detalles
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

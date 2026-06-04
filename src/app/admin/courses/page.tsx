import React from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import AdminCourseList from '@/components/AdminCourseList';

async function getCourses() {
  try {
    const courses = await db.course.findMany({
      where: {
        NOT: [
          { slug: 'suscripcion-mensual' },
          { slug: 'suscripcion-anual' },
        ],
      },
    });

    // Serializar campos decimales y fechas para evitar errores de transmisión a componentes cliente
    return courses.map(course => ({
      ...course,
      priceUSDT: course.priceUSDT ? Number(course.priceUSDT) : null,
      originalPriceUSDT: course.originalPriceUSDT ? Number(course.originalPriceUSDT) : null,
      createdAt: course.createdAt.toISOString(),
      scheduledAt: course.scheduledAt ? course.scheduledAt.toISOString() : null,
    }));
  } catch (error) {
    console.error('Error al cargar cursos en Admin Panel:', error);
    return [];
  }
}

export default async function AdminCoursesPage() {
  const courses = await getCourses();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Gestión de Cursos</h1>
          <p className="text-gray-500 mt-1">Creá, editá y eliminá el contenido educativo del sistema.</p>
        </div>
        <Link
          href="/admin/courses/new"
          className="px-5 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl transition-all shadow-md shadow-teal-600/10 active:scale-[0.98] self-start"
        >
          + Nuevo Curso
        </Link>
      </div>

      <AdminCourseList courses={courses} />
    </div>
  );
}

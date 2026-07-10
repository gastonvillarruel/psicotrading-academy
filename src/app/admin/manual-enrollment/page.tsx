import React from 'react';
import { db } from '@/lib/db';
import { ManualEnrollmentForm } from '@/components/admin/ManualEnrollmentForm';

export const dynamic = 'force-dynamic';

async function getAvailableCourses() {
  try {
    const availableCourses = await db.course.findMany({
      where: {
        available: { not: false },
        NOT: [
          { slug: 'suscripcion-mensual' },
          { slug: 'suscripcion-anual' },
        ],
      },
      select: {
        id: true,
        title: true,
        scheduleOptions: {
          where: { isActive: true },
          select: { id: true, name: true, description: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { title: 'asc' },
    });
    return availableCourses;
  } catch (error) {
    console.error('Error al obtener cursos disponibles para inscripcion manual:', error);
    return [];
  }
}

export default async function AdminManualEnrollmentPage() {
  const availableCourses = await getAvailableCourses();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Inscripcion Manual de Alumnos</h1>
        <p className="text-gray-500 mt-1">
          Otorga acceso a cursos a usuarios registrados de manera manual.
        </p>
      </div>

      <div className="max-w-3xl">
        <ManualEnrollmentForm courses={availableCourses} />
      </div>
    </div>
  );
}

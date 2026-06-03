import React from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import EditCourseForm from '@/components/EditCourseForm';

interface EditCoursePageProps {
  params: Promise<{ id: string }>;
}

async function getCourseById(id: string) {
  try {
    return await db.course.findUnique({
      where: { id },
      include: {
        startDates: {
          orderBy: { startDate: 'asc' },
        },
      },
    });
  } catch (error) {
    console.error('Error al obtener curso por ID:', error);
    return null;
  }
}

export default async function AdminEditCoursePage({ params }: EditCoursePageProps) {
  const resolvedParams = await params;
  const course = await getCourseById(resolvedParams.id);

  if (!course) {
    notFound();
  }

  // Serializar campos Decimal para evitar errores de transmisión a componentes cliente
  const serializedCourse = {
    ...course,
    priceUSDT: course.priceUSDT ? Number(course.priceUSDT) : null,
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/admin/courses" className="text-teal-600 hover:text-teal-700 text-sm font-semibold flex items-center space-x-1">
          <span>← Volver a cursos</span>
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mt-3">Editar Curso</h1>
        <p className="text-gray-500 mt-1">Modificá los detalles del curso: {course.title}</p>
      </div>

      <EditCourseForm course={serializedCourse} />
    </div>
  );
}

import React from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import DeleteCourseButton from '@/components/DeleteCourseButton';

async function getCourses() {
  try {
    return await db.course.findMany({
      where: {
        NOT: [
          { slug: 'suscripcion-mensual' },
          { slug: 'suscripcion-anual' },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
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
          <p className="text-gray-500 mt-1">Creá, editá y eliminá el contenido educativo de tu academia.</p>
        </div>
        <Link
          href="/admin/courses/new"
          className="px-5 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl transition-all shadow-md shadow-teal-600/10 active:scale-[0.98] self-start"
        >
          + Nuevo Curso
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {courses.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No hay cursos creados todavía. ¡Hacé clic en "+ Nuevo Curso" para empezar!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Miniatura</th>
                  <th className="px-6 py-4">Curso</th>
                  <th className="px-6 py-4">Modalidad</th>
                  <th className="px-6 py-4">Precio</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {courses.map((course) => (
                  <tr key={course.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      {course.thumbnail ? (
                        <img
                          src={course.thumbnail}
                          alt={course.title}
                          className="h-10 w-16 object-cover rounded-lg bg-gray-100"
                        />
                      ) : (
                        <div className="h-10 w-16 bg-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-400">
                          Sin img
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-gray-900 block line-clamp-1">{course.title}</span>
                      <span className="text-xs text-gray-400 block mt-0.5">/{course.slug}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                        course.type === 'LIVE' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
                      }`}>
                        {course.type === 'LIVE' ? 'En Vivo' : 'Grabado'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-teal-700">
                      ${course.price.toLocaleString('es-AR')} ARS
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Link
                        href={`/admin/courses/${course.id}/edit`}
                        className="text-xs font-semibold text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors inline-block"
                      >
                        Editar
                      </Link>
                      <DeleteCourseButton courseId={course.id} courseTitle={course.title} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

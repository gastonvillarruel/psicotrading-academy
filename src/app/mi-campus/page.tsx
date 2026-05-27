import React from 'react';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';

async function getStudentAccess(userId: string) {
  try {
    // 1. Verificar si tiene suscripción activa
    const activeSubscription = await db.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    let courses: any[] = [];
    const hasActiveSubscription = !!activeSubscription;

    if (hasActiveSubscription) {
      // Si tiene suscripción activa, tiene acceso a TODOS los cursos
      // Excluyendo los cursos de suscripción dummy
      courses = await db.course.findMany({
        where: {
          NOT: [
            { slug: 'suscripcion-mensual' },
            { slug: 'suscripcion-anual' },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // Si no tiene suscripción, cargar solo los cursos que compró individualmente
      const purchases = await db.purchase.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          NOT: [
            { course: { slug: 'suscripcion-mensual' } },
            { course: { slug: 'suscripcion-anual' } },
          ],
        },
        include: {
          course: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      courses = purchases.map((p) => p.course);
    }

    return {
      courses,
      subscription: activeSubscription,
    };
  } catch (error) {
    console.error('Error al obtener accesos de estudiante:', error);
    return { courses: [], subscription: null };
  }
}

export default async function StudentCampusPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return null; // El middleware redirecciona
  }

  const { courses, subscription } = await getStudentAccess(session.user.id);

  // Clasificar cursos
  const recordedCourses = courses.filter((c) => c.type === 'RECORDED');
  const liveCourses = courses.filter((c) => c.type === 'LIVE');

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Cabecera del Campus */}
      <div className="bg-gradient-to-r from-teal-800 to-teal-950 rounded-3xl p-8 text-white shadow-xl mb-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <span className="text-teal-200 text-xs font-bold uppercase tracking-wider">Campus Virtual</span>
          <h1 className="text-3xl font-extrabold mt-1">¡Hola, {session.user.name || 'Trader'}!</h1>
          <p className="text-teal-100 text-sm mt-2 max-w-xl">
            Bienvenido a tu panel de estudio. Acá vas a encontrar tus programas y talleres en vivo activos.
          </p>
        </div>

        {subscription && (
          <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 self-start md:self-auto">
            <span className="text-xs text-teal-200 block uppercase font-bold tracking-wider">Membresía Activa</span>
            <span className="text-base font-bold block mt-1">Plan {subscription.plan === 'MONTHLY' ? 'Mensual' : 'Anual'}</span>
            <span className="text-[10px] text-teal-200 block mt-1">
              Expira: {new Date(subscription.expiresAt).toLocaleDateString('es-AR')}
            </span>
          </div>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-100 p-16 text-center shadow-lg max-w-2xl mx-auto">
          <div className="h-16 w-16 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Aún no tenés acceso a ningún curso</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-8">
            Comenzá a potenciar tu disciplina de trading adquiriendo un curso individual o activando una suscripción académica.
          </p>
          <Link
            href="/campus"
            className="px-6 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/10 transition-all active:scale-[0.98]"
          >
            Explorar catálogo de cursos
          </Link>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Cursos Grabados */}
          {recordedCourses.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-teal-600" />
                <span>Mis cursos grabados</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {recordedCourses.map((course) => (
                  <div
                    key={course.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all"
                  >
                    {course.thumbnail && (
                      <div className="h-44 w-full overflow-hidden bg-gray-100 relative">
                        <img
                          src={course.thumbnail}
                          alt={course.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-6 flex-grow flex flex-col justify-between">
                      <div>
                        <h3 className="text-base font-bold text-gray-900 line-clamp-2 leading-snug mb-2">
                          {course.title}
                        </h3>
                        <p className="text-gray-500 text-xs line-clamp-2 mb-4">
                          {course.shortDescription}
                        </p>
                      </div>
                      <Link
                        href={`/mi-campus/${course.slug}`}
                        className="w-full text-center block py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold text-sm rounded-xl transition-all"
                      >
                        Ingresar a cursar
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cursos en Vivo */}
          {liveCourses.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Mis talleres en vivo</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {liveCourses.map((course) => (
                  <div
                    key={course.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all"
                  >
                    {course.thumbnail && (
                      <div className="h-44 w-full overflow-hidden bg-gray-100 relative">
                        <img
                          src={course.thumbnail}
                          alt={course.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-6 flex-grow flex flex-col justify-between">
                      <div>
                        <h3 className="text-base font-bold text-gray-900 line-clamp-2 leading-snug mb-2">
                          {course.title}
                        </h3>
                        {course.scheduledAt && (
                          <div className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md self-start inline-block mb-3">
                            Fecha: {new Date(course.scheduledAt).toLocaleDateString('es-AR')}
                          </div>
                        )}
                        <p className="text-gray-500 text-xs line-clamp-2 mb-4">
                          {course.shortDescription}
                        </p>
                      </div>
                      <Link
                        href={`/mi-campus/${course.slug}`}
                        className="w-full text-center block py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-sm rounded-xl transition-all"
                      >
                        Ir al taller
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

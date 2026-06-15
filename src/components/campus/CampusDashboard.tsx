'use client';

import React from 'react';
import Link from 'next/link';
import ProgressBar from './ProgressBar';

interface DashboardCourse {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  thumbnail: string | null;
  type: 'LIVE' | 'RECORDED';
  scheduledAt: Date | string | null;
  legacyMode: boolean;
  totalLessons: number;
  completedLessons: number;
  percent: number;
  certificate: any | null;
}

interface CampusDashboardProps {
  userName: string;
  courses: DashboardCourse[];
  subscription: any | null;
}

export default function CampusDashboard({
  userName,
  courses,
  subscription,
}: CampusDashboardProps) {
  // 1. Identificar curso para "Continuar aprendiendo" (el primero incompleto o el primero de la lista)
  const activeCourse = courses.find(c => c.percent > 0 && c.percent < 100) || courses.find(c => c.percent === 0) || courses[0];

  // 2. Estadísticas globales del alumno
  const totalCourses = courses.length;
  const completedCourses = courses.filter(c => c.percent === 100).length;
  const averageProgress = totalCourses > 0
    ? Math.round(courses.reduce((acc, c) => acc + c.percent, 0) / totalCourses)
    : 0;

  // 3. Próxima clase en vivo de cualquier curso
  const upcomingLive = courses
    .filter(c => c.type === 'LIVE' && c.scheduledAt && new Date(c.scheduledAt).getTime() > Date.now())
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];

  // 4. Clasificación dinámica de cursos
  const isMentorship = (c: DashboardCourse) =>
    c.title.toLowerCase().includes('mentor') ||
    c.slug.toLowerCase().includes('mentor') ||
    c.shortDescription.toLowerCase().includes('mentor');

  const mentorias = courses.filter(isMentorship);
  const recordedCourses = courses.filter(c => c.type === 'RECORDED' && !isMentorship(c));
  const liveCourses = courses.filter(c => c.type === 'LIVE' && !isMentorship(c));

  if (courses.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-24 text-center space-y-8 animate-fade-in">
        <div className="h-20 w-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm text-slate-400 border border-slate-200/50">
          <svg className="h-10 w-10 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Comenzá tu formación profesional</h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
            Aún no tenés acceso a ningún programa de estudio. Adquirí un curso individual o activá una suscripción para comenzar tu camino.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-8 py-3.5 bg-slate-900 hover:bg-slate-850 text-white font-bold text-sm rounded-xl transition-all shadow-md active:scale-[0.98] border border-transparent"
          >
            Explorar catálogo público
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in text-slate-800">

      {/* 1. Hero Superior Premium Súper Compacto */}
      <div className="bg-white border border-slate-200/70 rounded-2xl px-5 py-4 sm:py-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative overflow-hidden transition-all duration-300">
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 via-slate-800 to-indigo-600"></div>

        <div className="space-y-1 relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">¡Hola, {userName}! 👋</h1>
            <span className="text-[9px] text-teal-700 font-extrabold uppercase tracking-wider bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
              Área de Alumnos
            </span>
            {subscription && (
              <span className="text-[9px] text-indigo-700 font-extrabold uppercase tracking-wider bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                Club VIP
              </span>
            )}
          </div>
          <p className="text-slate-500 text-xs sm:text-sm font-normal">
            Te damos la bienvenida. Tenés acceso a <span className="font-semibold text-slate-800">{totalCourses} {totalCourses === 1 ? 'programa activo' : 'programas activos'}</span>.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10">
          {upcomingLive && upcomingLive.scheduledAt && (
            <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl px-3 py-1.5 flex items-center gap-2.5 flex-shrink-0">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <div className="text-left">
                <span className="text-[9px] text-amber-800 block font-bold uppercase tracking-wider">Vivo Próximo</span>
                <span className="text-[11px] font-extrabold text-slate-900 block max-w-[140px] truncate">{upcomingLive.title}</span>
              </div>
            </div>
          )}

          {activeCourse && (
            <Link
              href={`/mi-campus/${activeCourse.slug}`}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-850 text-white font-extrabold text-xs rounded-xl shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              <span>Continuar aprendiendo</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* 2. Distribución de Pantalla Principal en 2 Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Columna Izquierda: Contenido Principal (8/12) */}
        <div className="lg:col-span-8 space-y-8">

          {/* 3. Tarjeta de Continuidad Premium: "Seguir leyendo / viendo" */}
          {activeCourse && (
            <div className="space-y-3">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                Continuar clase activa
              </h2>

              <div className="bg-white border-2 border-slate-900/10 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-6 items-center justify-between hover:shadow-md hover:border-slate-900/15 transition-all duration-300 relative overflow-hidden">
                <div className="absolute top-0 bottom-0 left-0 w-1 bg-teal-550"></div>

                <div className="flex flex-col sm:flex-row gap-5 items-center w-full md:w-auto">
                  {activeCourse.thumbnail ? (
                    <div className="h-24 w-40 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200/30 shadow-sm relative">
                      <img src={activeCourse.thumbnail} alt={activeCourse.title} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-24 w-40 rounded-xl bg-slate-100 flex-shrink-0 border border-slate-200/50 flex items-center justify-center shadow-inner">
                      <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  )}

                  <div className="text-center sm:text-left space-y-1">
                    <span className="inline-flex items-center text-[9px] font-extrabold px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-100 uppercase tracking-wider">
                      {activeCourse.type === 'LIVE' ? 'Taller en Vivo' : 'Programa Grabado'}
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 leading-tight tracking-tight line-clamp-1">
                      {activeCourse.title}
                    </h3>
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-slate-700 flex items-center justify-center sm:justify-start gap-1">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        </svg>
                        <span>{activeCourse.percent > 0 ? 'Continuar con el temario' : 'Iniciar primera clase'}</span>
                      </p>
                      {!activeCourse.legacyMode ? (
                        <p className="text-[11px] text-slate-400 font-medium">
                          Avance: <span className="font-bold text-slate-600">{activeCourse.completedLessons}</span> de <span className="font-bold text-slate-600">{activeCourse.totalLessons} lecciones</span> ({activeCourse.percent}%)
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 font-medium">
                          Material de estudio completo y descargas
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-full md:w-auto flex flex-col gap-3.5 min-w-[200px] border-t border-slate-100 md:border-0 pt-4 md:pt-0">
                  {!activeCourse.legacyMode && (
                    <div className="space-y-1">
                      <ProgressBar percent={activeCourse.percent} size="sm" />
                      <span className="text-[10px] text-slate-400 font-bold text-right block">{activeCourse.percent}% completado</span>
                    </div>
                  )}
                  <Link
                    href={`/mi-campus/${activeCourse.slug}`}
                    className="w-full text-center px-6 py-2.5 bg-slate-900 hover:bg-slate-850 text-white font-extrabold text-xs rounded-xl shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98]"
                  >
                    Continuar clase
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* 4. Listado de Todos los Cursos */}
          <div className="space-y-8">

            {/* Programas Grabados */}
            {recordedCourses.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                  Programas de Estudio ({recordedCourses.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {recordedCourses.map(course => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              </div>
            )}

            {/* Talleres en Vivo */}
            {liveCourses.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                  Talleres y Entrenamientos en Vivo ({liveCourses.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {liveCourses.map(course => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              </div>
            )}

            {/* Mentorías */}
            {mentorias.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                  Mentorías y Consultorías Premium ({mentorias.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {mentorias.map(course => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Columna Derecha: Sidebar Lateral Informativo (4/12) */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8">

          {/* Resumen Académico: "Tu avance" */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-5 space-y-4 shadow-sm transition-all duration-300">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Tu avance</h3>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                <span className="block text-xl font-extrabold text-slate-900 leading-none">{totalCourses}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-1.5">Cursos</span>
              </div>
              <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                <span className="block text-xl font-extrabold text-teal-600 leading-none">{completedCourses}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-1.5">Listos</span>
              </div>
              <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                <span className="block text-xl font-extrabold text-indigo-600 leading-none">{averageProgress}%</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-1.5">Avance</span>
              </div>
            </div>

            {totalCourses > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400">
                  <span>Progreso curricular global</span>
                  <span className="font-bold text-slate-600">{averageProgress}%</span>
                </div>
                <ProgressBar percent={averageProgress} size="sm" />
              </div>
            )}
          </div>

          {/* Suscripción activa */}
          {subscription && (
            <div className="bg-slate-900 border border-slate-850 text-white rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-teal-500/5 rounded-full blur-xl -mr-4 -mt-4"></div>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Suscripción Activa</h3>
                <span className="px-2 py-0.5 rounded text-[8px] font-extrabold bg-teal-500/20 text-teal-400 border border-teal-500/30 tracking-wider">
                  CLUB VIP
                </span>
              </div>
              <div className="space-y-1 pt-0.5">
                <span className="text-base font-extrabold block tracking-tight">Plan {subscription.plan === 'MONTHLY' ? 'Mensual' : 'Anual'}</span>
                <p className="text-[11px] text-slate-400 leading-normal font-normal">
                  Acceso total premium habilitado. Vence el <strong className="text-slate-300 font-semibold">{new Date(subscription.expiresAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Soporte y ayuda */}
          <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-teal-55 text-teal-600 flex items-center justify-center border border-teal-100 flex-shrink-0 shadow-sm">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Asistencia al Estudiante</h3>
            </div>
            <p className="text-xs text-slate-500 leading-normal font-normal">
              ¿Tenés dudas técnicas con los módulos o el funcionamiento de la plataforma? Escribinos para que podamos ayudarte de inmediato.
            </p>
            <a
              href="https://wa.me/5491176632244"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center block py-2.5 border border-slate-200 hover:border-slate-350 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all shadow-sm"
            >
              Contactar Soporte Técnico
            </a>
          </div>

        </div>

      </div>

    </div>
  );
}

function CourseCard({ course }: { course: DashboardCourse }) {
  // Clasificación del curso para mostrar badge customizado
  const isMentorship = course.title.toLowerCase().includes('mentor') || course.slug.toLowerCase().includes('mentor');

  let typeLabel = 'Grabado';
  let typeClass = 'bg-slate-50 text-slate-700 border-slate-200/50';
  if (isMentorship) {
    typeLabel = 'Mentoría';
    typeClass = 'bg-indigo-55 text-indigo-700 border-indigo-100';
  } else if (course.type === 'LIVE') {
    typeLabel = 'Taller en Vivo';
    typeClass = 'bg-amber-50 text-amber-700 border-amber-100';
  }

  // Comprobar estado del curso
  let statusLabel = '';
  if (course.percent === 100) {
    statusLabel = 'Completado';
  } else if (course.percent > 0) {
    statusLabel = 'En curso';
  } else {
    statusLabel = 'No iniciado';
  }

  return (
    <div className="group bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md overflow-hidden flex flex-col justify-between h-full transition-all duration-300 transform hover:-translate-y-1">
      <div>
        {course.thumbnail ? (
          <div className="h-44 w-full overflow-hidden bg-slate-100 relative border-b border-slate-200/20 shadow-inner">
            <img
              src={course.thumbnail}
              alt={course.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            />
            <div className="absolute top-3 right-3">
              <span className={`rounded-lg border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider backdrop-blur-sm shadow-sm ${typeClass}`}>
                {typeLabel}
              </span>
            </div>
            {course.percent === 100 && (
              <div className="absolute bottom-3 left-3 bg-teal-500 text-white rounded-lg border border-teal-400 px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
                <span>Certificado Disponible</span>
              </div>
            )}
          </div>
        ) : (
          <div className="h-44 w-full bg-slate-50 flex items-center justify-center relative border-b border-slate-200/20">
            <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <div className="absolute top-3 right-3">
              <span className={`rounded-lg border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider backdrop-blur-sm shadow-sm ${typeClass}`}>
                {typeLabel}
              </span>
            </div>
          </div>
        )}

        <div className="p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
              {course.legacyMode ? 'Contenido disponible' : `${course.totalLessons} lecciones`}
            </span>
            <span className={`text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusLabel === 'Completado' ? 'bg-teal-50 text-teal-700' :
                statusLabel === 'En curso' ? 'bg-indigo-50 text-indigo-700' :
                  'bg-slate-100 text-slate-500'
              }`}>
              {statusLabel}
            </span>
          </div>

          <h3 className="text-sm font-extrabold text-slate-900 leading-snug line-clamp-1 group-hover:text-teal-600 transition-colors">
            {course.title}
          </h3>

          <p className="text-slate-500 text-[11px] leading-relaxed font-normal line-clamp-2">
            {course.shortDescription}
          </p>
        </div>
      </div>

      <div className="p-5 pt-0 mt-auto space-y-4">
        {/* Progreso del curso (Oculto en Legacy) */}
        {!course.legacyMode ? (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400">
              <span>{course.completedLessons} de {course.totalLessons} clases</span>
              <span className="font-bold">{course.percent}%</span>
            </div>
            <ProgressBar percent={course.percent} size="sm" />
          </div>
        ) : (
          <div className="text-[10px] text-slate-400 font-medium italic border-t border-slate-100 pt-2.5">
            Acceso completo al material
          </div>
        )}

        <Link
          href={`/mi-campus/${course.slug}`}
          className="w-full text-center block py-2.5 bg-slate-900 hover:bg-slate-855 text-white font-bold text-xs rounded-xl shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98] border border-transparent"
        >
          {course.legacyMode ? 'Ingresar al aula' : course.percent === 100 ? 'Repasar Temario' : course.percent === 0 ? 'Iniciar Curso' : 'Continuar'}
        </Link>
      </div>
    </div>
  );
}

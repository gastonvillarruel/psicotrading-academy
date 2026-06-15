'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CourseSidebar from './CourseSidebar';
import LessonPlayer from './LessonPlayer';
import LiveClassRoom from './LiveClassRoom';
import SafeMarkdown from '../SafeMarkdown';
import ProgressBar from './ProgressBar';
import { CourseResource, CourseWithProgress, LessonWithStatus } from '@/lib/campus/types';
import { getCampusCourseData } from '@/app/actions/campus';

interface CampusCourseViewerProps {
  course: CourseWithProgress;
}

export default function CampusCourseViewer({ course: initialCourse }: CampusCourseViewerProps) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseWithProgress>(initialCourse);
  const [activeLesson, setActiveLesson] = useState<LessonWithStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'clase' | 'recursos'>('clase');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [lockedAlert, setLockedAlert] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    let selected: LessonWithStatus | null = null;

    for (const mod of course.modules) {
      if (mod.isUnlocked) {
        const firstAvailable = mod.lessons.find((lesson) => lesson.status === 'available');
        if (firstAvailable) {
          selected = firstAvailable;
          break;
        }
      }
    }

    if (!selected) {
      for (const mod of course.modules) {
        if (mod.isUnlocked && mod.lessons.length > 0) {
          selected = mod.lessons[0];
          break;
        }
      }
    }

    setActiveLesson(selected);
  }, [course.id]);

  const handleLessonCompleted = async (lessonId: string) => {
    try {
      const result = await getCampusCourseData(course.slug);
      if (result.success && result.course) {
        const nextCourse = result.course as CourseWithProgress;
        setCourse(nextCourse);

        const refreshedLesson =
          nextCourse.modules.flatMap((mod) => mod.lessons).find((lesson) => lesson.id === lessonId) ?? null;

        if (refreshedLesson) {
          setActiveLesson(refreshedLesson);
        }
      }
    } catch (err) {
      console.error('Error al sincronizar datos del curso:', err);
    }
  };

  const handleSelectLesson = (lesson: LessonWithStatus) => {
    if (lesson.status === 'locked') {
      setLockedAlert(true);
      setTimeout(() => setLockedAlert(false), 4000);
      return;
    }

    setActiveLesson(lesson);
    setIsMobileSidebarOpen(false);
  };

  const triggerManualCompletion = async () => {
    if (!activeLesson || activeLesson.status === 'completed' || isCompleting) return;

    setIsCompleting(true);
    try {
      const response = await fetch('/api/campus/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: activeLesson.id }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        await handleLessonCompleted(activeLesson.id);
      } else {
        console.error('No se pudo completar la leccion:', data.error || 'Respuesta invalida');
      }
    } catch (error) {
      console.error('Error al completar leccion manualmente:', error);
    } finally {
      setIsCompleting(false);
    }
  };

  const allLessons = course.modules.flatMap((moduleItem) => moduleItem.lessons);
  const currentIdx = activeLesson ? allLessons.findIndex((lesson) => lesson.id === activeLesson.id) : -1;
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx >= 0 && currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;

  const activeModule = course.modules.find((moduleItem) => moduleItem.lessons.some((lesson) => lesson.id === activeLesson?.id));
  const activeModuleIndex = activeModule ? course.modules.indexOf(activeModule) + 1 : 1;
  const activeLessonIndex = activeModule ? activeModule.lessons.findIndex((lesson) => lesson.id === activeLesson?.id) + 1 : 1;

  const parsedResources: CourseResource[] = Array.isArray(course.resources)
    ? (course.resources as unknown as CourseResource[])
    : [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/mi-campus"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-600 transition-colors font-bold"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Mi Campus</span>
          </Link>
          <span className="h-4 w-px bg-slate-200" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3">
            <h1 className="text-xs sm:text-sm font-extrabold text-slate-900 line-clamp-1 max-w-[150px] sm:max-w-xs md:max-w-md">
              {course.title}
            </h1>
            {!course.legacyMode && (
              <span className="inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-100 uppercase tracking-wider self-start sm:self-auto">
                {course.percent}% Completado
              </span>
            )}
            {course.studentScheduleOptionName && (
              <span className="inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wider self-start sm:self-auto">
                Comisión: {course.studentScheduleOptionName}
              </span>
            )}
          </div>
        </div>

        <nav className="flex items-center gap-4 text-xs font-bold">
          {!course.legacyMode && (
            <div className="hidden md:block w-36 lg:w-48">
              <ProgressBar percent={course.percent} size="sm" />
            </div>
          )}
          <a
            href="https://wa.me/5491176632244"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-teal-600 transition-colors flex items-center gap-1 font-bold"
          >
            Soporte Alumno
          </a>
          <span className="h-4 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => router.push('/mi-campus')}
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all text-slate-700 font-bold active:scale-[0.98] cursor-pointer"
          >
            Salir
          </button>
        </nav>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        <div className="hidden lg:block">
          <CourseSidebar
            modules={course.modules}
            activeLessonId={activeLesson?.id || null}
            onSelectLesson={handleSelectLesson}
          />
        </div>

        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300"
            onClick={() => setIsMobileSidebarOpen(false)}
          >
            <div
              className="w-80 max-w-[85%] h-full bg-white shadow-2xl relative flex flex-col animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-4 right-4 z-40">
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-grow overflow-y-auto">
                <CourseSidebar
                  modules={course.modules}
                  activeLessonId={activeLesson?.id || null}
                  onSelectLesson={handleSelectLesson}
                />
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="lg:hidden flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm mb-2">
            <div className="text-left space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Contenido curricular</span>
              <span className="block text-xs font-bold text-slate-800">Temario e indice del programa</span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl transition-all shadow-sm active:scale-[0.98] cursor-pointer"
            >
              Ver Temario
            </button>
          </div>

          {activeLesson ? (
            <div className="grid grid-cols-1 gap-6 max-w-4xl mx-auto">
              {activeLesson.type === 'LIVE' && !activeLesson.recordingUrl ? (
                <LiveClassRoom lesson={activeLesson} />
              ) : (
                <LessonPlayer key={activeLesson.id} lesson={activeLesson} onLessonCompleted={handleLessonCompleted} />
              )}

              <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-100 pb-5">
                  <div className="space-y-1.5 flex-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {activeModule ? `Modulo ${activeModuleIndex} · Clase ${activeLessonIndex}` : 'Leccion de la sesion'}
                    </span>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-snug">
                      {activeLesson.title}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2 self-start">
                    {activeLesson.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>Completada</span>
                      </span>
                    ) : activeLesson.status === 'locked' ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m0-6v2m0-8H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-5" />
                        </svg>
                        <span>Bloqueada</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={triggerManualCompletion}
                        disabled={isCompleting}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isCompleting ? 'Procesando...' : 'Marcar como Completada'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-b border-slate-200 flex gap-6 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveTab('clase')}
                    className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === 'clase'
                        ? 'border-teal-600 text-teal-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                  >
                    Detalles de la Clase
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('recursos')}
                    className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === 'recursos'
                        ? 'border-teal-600 text-teal-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                  >
                    Recursos Descargables ({parsedResources.length})
                  </button>
                </div>

                <div className="py-2">
                  {activeTab === 'clase' ? (
                    <div className="space-y-4 prose max-w-none text-slate-600 text-xs sm:text-sm leading-relaxed">
                      {activeLesson.description ? (
                        <SafeMarkdown content={activeLesson.description} />
                      ) : (
                        <p className="text-xs text-slate-400 italic">No hay descripcion disponible para esta clase.</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {parsedResources.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {parsedResources.map((res, idx) => (
                            <a
                              key={idx}
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-4 rounded-xl border border-slate-250 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs text-slate-700 hover:text-teal-600 font-bold transition-all"
                            >
                              <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 .707.707 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="text-left">
                                  <span className="block text-slate-800 line-clamp-1">{res.title}</span>
                                  {res.description && (
                                    <span className="block text-[10px] text-slate-500 font-normal line-clamp-1 mt-0.5">
                                      {res.description}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No hay archivos para descargar en esta sesion.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4 pt-6 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => prevLesson && handleSelectLesson(prevLesson)}
                    disabled={!prevLesson}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 text-xs font-bold text-slate-700 hover:text-slate-900 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-750 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                    </svg>
                    <span>Clase Anterior</span>
                  </button>

                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => nextLesson && handleSelectLesson(nextLesson)}
                      disabled={!nextLesson || nextLesson.status === 'locked'}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold disabled:opacity-40 disabled:hover:bg-slate-900 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <span>Siguiente Clase</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    {nextLesson && nextLesson.status === 'locked' && (
                      <span className="text-[10px] text-slate-400 font-semibold max-w-[180px] text-right">
                        * Completá esta clase para desbloquear la siguiente
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto text-center py-20 space-y-4 bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
              <svg className="h-12 w-12 text-slate-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="font-bold text-slate-700 text-sm">Lección no disponible</h3>
              <p className="text-xs text-slate-500">Este curso no cuenta con lecciones publicadas o desbloqueadas.</p>
            </div>
          )}
        </main>
      </div>

      {lockedAlert && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in border border-slate-700">
          <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m0-6v2m0-8H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-5" />
            </svg>
          </div>
          <span className="text-xs font-bold leading-normal">
            Completá la clase anterior para desbloquear esta lección.
          </span>
        </div>
      )}
    </div>
  );
}

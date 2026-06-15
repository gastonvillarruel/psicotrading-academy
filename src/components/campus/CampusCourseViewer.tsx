'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import CourseSidebar from './CourseSidebar';
import LessonPlayer from './LessonPlayer';
import LiveClassRoom from './LiveClassRoom';
import SafeMarkdown from '../SafeMarkdown';
import CampusSidebar from './CampusSidebar';
import { CourseResource, CourseWithProgress, LessonWithStatus } from '@/lib/campus/types';
import { getCampusCourseData } from '@/app/actions/campus';

interface CampusCourseViewerProps {
  course: CourseWithProgress;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    role?: string;
  } | null;
}

export default function CampusCourseViewer({ course: initialCourse, user }: CampusCourseViewerProps) {
  const [course, setCourse] = useState<CourseWithProgress>(initialCourse);
  const [activeLesson, setActiveLesson] = useState<LessonWithStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'clase' | 'recursos'>('clase');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false); // Para el temario del curso en mobile
  const [isCampusSidebarOpen, setIsCampusSidebarOpen] = useState(false); // Para la barra lateral del campus en mobile
  const [lockedAlert, setLockedAlert] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // --- 1. CONFIGURACIÓN DINÁMICA DE TEXTOS (campusSettings) ---
  const campusTitle = course.campusSettings?.title || course.title;
  const campusSubtitle = course.campusSettings?.subtitle || course.shortDescription || 'Campus Virtual PsicoEmoTrading';
  const welcomeText = course.campusSettings?.welcomeText || null;
  const currentLessonLabel = course.campusSettings?.currentLessonLabel || 'Clase en curso';
  const modulesLabel = course.campusSettings?.modulesLabel || 'Módulos del Curso';
  const motivationalQuote = course.campusSettings?.motivationalQuote || '"El trading no es de tener razón, se trata de hacer lo correcto de manera consistente."';

  // --- 2. CHECKLIST DINÁMICO (campusChecklist) ---
  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; checked: boolean }[]>([]);

  useEffect(() => {
    if (course.campusChecklist && course.campusChecklist.length > 0) {
      setChecklistItems(
        course.campusChecklist
          .filter((item) => item.enabled)
          .sort((a, b) => a.order - b.order)
          .map((item) => ({ id: item.id, text: item.text, checked: false }))
      );
    } else {
      // Fallback estático clásico por defecto
      setChecklistItems([
        { id: '1', text: 'Estoy en calma y enfocado.', checked: false },
        { id: '2', text: 'Revisé mi plan de trading.', checked: false },
        { id: '3', text: 'Acepto el riesgo definido.', checked: false },
        { id: '4', text: 'No operaré por impulso emocional.', checked: false },
        { id: '5', text: 'Estoy listo para ejecutar mi plan.', checked: false },
      ]);
    }
  }, [course.id, course.campusChecklist]);

  const toggleChecklistItem = (id: string) => {
    setChecklistItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  // --- 3. MATERIALES DESCARGABLES DINÁMICOS (campusMaterials) ---
  const [currentMaterials, setCurrentMaterials] = useState<any[]>([]);

  useEffect(() => {
    const list = (course.campusMaterials || [])
      .filter((mat) => mat.enabled)
      .filter((mat) => !mat.lessonId || (activeLesson && mat.lessonId === activeLesson.id))
      .sort((a, b) => a.order - b.order);
    setCurrentMaterials(list);
  }, [course.id, course.campusMaterials, activeLesson?.id]);

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

  // Recursos antiguos heredados como fallback compatible
  const parsedResources: CourseResource[] = Array.isArray(course.resources)
    ? (course.resources as unknown as CourseResource[])
    : [];

  const userName = user?.name || user?.email?.split('@')[0] || 'Trader';
  const userRole = user?.role === 'ADMIN' ? 'Administrador' : 'Alumno activo';
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  const renderMaterialIcon = (type: string) => {
    switch (type) {
      case 'PDF':
        return (
          <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
      case 'Excel':
        return (
          <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'Notion':
        return (
          <svg className="w-4 h-4 text-slate-800 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'Link':
        return (
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 .707.707 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 flex font-sans">
      {/* Sidebar de navegación del campus izquierda */}
      <CampusSidebar
        userName={userName}
        userRole={userRole}
        activeSlug={course.slug}
        isOpen={isCampusSidebarOpen}
        onClose={() => setIsCampusSidebarOpen(false)}
        welcomeText={welcomeText}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Header superior */}
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-6 z-20 shadow-sm shadow-slate-100/30">
          <div className="flex items-center gap-4">
            {/* Botón menú lateral campus (mobile) */}
            <button
              type="button"
              onClick={() => setIsCampusSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-slate-50 text-slate-600 rounded-xl transition-all"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight line-clamp-1 max-w-[200px] sm:max-w-md">
                  {campusTitle}
                </h1>
                {course.studentScheduleOptionName && (
                  <span className="hidden sm:inline-flex items-center text-[9px] font-extrabold px-2 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-100/50 uppercase tracking-wider">
                    Comisión: {course.studentScheduleOptionName}
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium line-clamp-1">
                {campusSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Botón de Soporte */}
            <a
              href="https://wa.me/5491176632244"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 border border-slate-150 rounded-xl text-xs font-bold text-slate-600 hover:text-orange-600 hover:border-orange-200 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Soporte</span>
            </a>

            {/* Icono Notificaciones estético */}
            <button
              type="button"
              className="p-2 hover:bg-slate-50 text-slate-500 hover:text-orange-600 rounded-xl transition-all relative cursor-pointer"
            >
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" />
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>

            {/* Separador */}
            <span className="h-5 w-px bg-slate-200 hidden sm:block" />

            {/* Avatar e iniciales */}
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-orange-50 text-orange-600 font-extrabold text-xs flex items-center justify-center border border-orange-100/50 shadow-sm uppercase">
                {initials}
              </div>
              <span className="text-xs font-bold text-slate-700 hidden md:block max-w-[100px] truncate">
                {userName}
              </span>
            </div>
          </div>
        </header>

        {/* Contenido Principal */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Botón de temario para mobile */}
          <div className="lg:hidden flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm mb-2">
            <div className="text-left space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{modulesLabel}</span>
              <span className="block text-xs font-extrabold text-slate-800">Ver clases y temario</span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-sm active:scale-[0.98] cursor-pointer"
            >
              Ver Temario
            </button>
          </div>

          {activeLesson ? (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Sección superior de dos columnas (Clase actual + Temario a la derecha) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Columna Izquierda: Reproductor de la clase */}
                <div className="lg:col-span-2 space-y-6 flex flex-col justify-between">
                  <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 shadow-sm shadow-slate-100/50 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-4">
                      <div>
                        <span className="text-[9px] sm:text-[10px] text-orange-600 font-extrabold uppercase tracking-widest bg-orange-50 px-2.5 py-1 rounded-full">
                          {activeModule ? `Módulo ${activeModuleIndex} · Clase ${activeLessonIndex}` : 'Lección en curso'}
                        </span>
                        <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight mt-2.5">
                          {activeLesson.title}
                        </h2>
                      </div>
                      
                      <div className="self-start sm:self-auto flex-shrink-0">
                        {activeLesson.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100/60 shadow-sm">
                            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>Completada</span>
                          </span>
                        ) : activeLesson.status === 'locked' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-100 text-slate-500 border border-slate-200">
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
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                          >
                            {isCompleting ? 'Procesando...' : 'Marcar como Completada'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Reproductor Real de LessonPlayer */}
                    <div className="overflow-hidden rounded-2xl shadow-inner border border-slate-100/50 bg-slate-950">
                      {activeLesson.type === 'LIVE' && !activeLesson.recordingUrl ? (
                        <LiveClassRoom lesson={activeLesson} />
                      ) : (
                        <LessonPlayer key={activeLesson.id} lesson={activeLesson} onLessonCompleted={handleLessonCompleted} />
                      )}
                    </div>

                    {/* Controles de Navegación de Clases */}
                    <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-50">
                      <button
                        type="button"
                        onClick={() => prevLesson && handleSelectLesson(prevLesson)}
                        disabled={!prevLesson}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-slate-350 text-xs font-bold text-slate-650 hover:text-slate-900 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500 transition-all active:scale-[0.98] cursor-pointer"
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
                          <span className="text-[9px] text-slate-400 font-semibold max-w-[180px] text-right">
                            * Completá esta clase para desbloquear
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Detalles de la Clase / Descripción */}
                  <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-8 shadow-sm shadow-slate-100/50 mt-6 space-y-4">
                    <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-widest border-b border-slate-50 pb-2">
                      {currentLessonLabel}
                    </h3>
                    <div className="space-y-4 prose max-w-none text-slate-650 text-xs sm:text-sm leading-relaxed">
                      {activeLesson.description ? (
                        <SafeMarkdown content={activeLesson.description} />
                      ) : (
                        <p className="text-xs text-slate-400 italic">No hay descripción disponible para esta clase.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Columna Derecha: Temario del curso (Módulos/Lecciones) en Desktop */}
                <div className="hidden lg:block">
                  <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm shadow-slate-100/50 h-[650px] flex flex-col">
                    <div className="p-4 border-b border-slate-50 bg-slate-50/20">
                      <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-widest">
                        {modulesLabel}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-1 font-medium">
                        Navegá por el temario y lecciones
                      </p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <CourseSidebar
                        modules={course.modules}
                        activeLessonId={activeLesson?.id || null}
                        onSelectLesson={handleSelectLesson}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección Inferior de Tarjetas (Dashboard) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
                {/* Card 1: Mi progreso general */}
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm shadow-slate-100/30 flex flex-col justify-between hover:shadow-md hover:border-slate-200/60 transition-all duration-250">
                  <div className="space-y-3">
                    <span className="text-[9px] font-extrabold text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-full">
                      Mi Progreso
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-800 tracking-tight mt-2">
                      Progreso General
                    </h4>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-3xl font-black text-slate-900">{course.percent}%</span>
                      <span className="text-xs text-slate-450 font-bold">completado</span>
                    </div>
                    <div className="w-full mt-2 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-orange-500 h-full rounded-full transition-all duration-500" style={{ width: `${course.percent}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold">
                      {course.completedLessons || 0} de {course.totalLessons || 0} clases completadas
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                    <p className="text-[10px] text-slate-500 font-medium italic">
                      ¡Seguí así! Camino a tu consistencia.
                    </p>
                    {course.certificate && (
                      <Link
                        href={`/certificado/${course.certificate.certificateCode}`}
                        className="text-[10px] font-bold text-orange-600 hover:text-orange-700 hover:underline flex items-center gap-0.5"
                      >
                        Ver Certificado →
                      </Link>
                    )}
                  </div>
                </div>

                {/* Card 2: Checklist del Trader (Dinámico) */}
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm shadow-slate-100/30 flex flex-col justify-between hover:shadow-md hover:border-slate-200/60 transition-all duration-250">
                  <div>
                    <span className="text-[9px] font-extrabold text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-full">
                      Mindset Diario
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-800 tracking-tight mt-2 mb-3">
                      Checklist del Trader
                    </h4>
                    {checklistItems.length > 0 ? (
                      <ul className="space-y-2.5 text-xs font-semibold text-slate-650">
                        {checklistItems.map((item) => (
                          <li key={item.id} className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={() => toggleChecklistItem(item.id)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-250 text-orange-650 focus:ring-orange-500 cursor-pointer"
                            />
                            <span className={item.checked ? 'line-through text-slate-400 font-medium' : ''}>
                              {item.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10px] text-slate-400 font-bold italic py-4">
                        No hay checklist configurado.
                      </p>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-50 text-[10px] text-slate-400 font-medium text-center">
                    Criterios esenciales antes de cada trade.
                  </div>
                </div>

                {/* Card 3: Materiales descargables (Dinámico: campusMaterials con fallback a course.resources) */}
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm shadow-slate-100/30 flex flex-col justify-between hover:shadow-md hover:border-slate-200/60 transition-all duration-250">
                  <div className="flex flex-col h-full">
                    <span className="text-[9px] font-extrabold text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-full self-start">
                      Recursos
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-800 tracking-tight mt-2 mb-3">
                      Materiales Descargables
                    </h4>
                    <div className="space-y-2 overflow-y-auto max-h-[140px] flex-1 pr-1">
                      {currentMaterials.length > 0 ? (
                        currentMaterials.map((mat) => (
                          <a
                            key={mat.id}
                            href={mat.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-slate-100/70 flex items-center justify-between text-xs font-bold text-slate-700 hover:text-orange-600 transition-all"
                          >
                            <div className="flex items-center gap-2 truncate">
                              {renderMaterialIcon(mat.type)}
                              <span className="truncate" title={mat.description || mat.title}>
                                {mat.title}
                              </span>
                            </div>
                            <svg className="w-3.5 h-3.5 text-slate-450 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </a>
                        ))
                      ) : parsedResources.length > 0 ? (
                        // Fallback a los recursos del curso completo si no se ha configurado campusMaterials
                        parsedResources.map((res, idx) => (
                          <a
                            key={idx}
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-slate-100/70 flex items-center justify-between text-xs font-bold text-slate-700 hover:text-orange-600 transition-all"
                          >
                            <span className="truncate max-w-[120px]">{res.title}</span>
                            <svg className="w-3.5 h-3.5 text-slate-450 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </a>
                        ))
                      ) : (
                        <div className="text-center py-6">
                          <p className="text-[10px] text-slate-400 font-bold italic">
                            No hay recursos para esta sesión.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-50 text-[10px] text-slate-400 font-medium text-center">
                    Planillas, PDF e información de estudio.
                  </div>
                </div>

                {/* Card 4: Tu progreso / Métricas */}
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm shadow-slate-100/30 flex flex-col justify-between hover:shadow-md hover:border-slate-200/60 transition-all duration-250">
                  <div className="space-y-3">
                    <span className="text-[9px] font-extrabold text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-full">
                      Rendimiento
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-800 tracking-tight mt-2">
                      Métricas del Curso
                    </h4>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/30 text-center">
                        <span className="block text-[10px] text-slate-450 font-bold uppercase">Módulos</span>
                        <span className="text-lg font-black text-slate-800">{course.modules?.length || 0}</span>
                      </div>
                      <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/30 text-center">
                        <span className="block text-[10px] text-slate-450 font-bold uppercase">Lecciones</span>
                        <span className="text-lg font-black text-slate-800">{allLessons.length || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-50 flex flex-col gap-1 text-[10px] text-slate-400 font-bold">
                    <div className="flex justify-between items-center text-slate-500">
                      <span>Frase del Día:</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium italic mt-0.5 leading-snug">
                      {motivationalQuote}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto text-center py-20 space-y-4 bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
              <svg className="h-12 w-12 text-slate-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="font-bold text-slate-700 text-sm">Lección no disponible</h3>
              <p className="text-xs text-slate-500">Este curso no cuenta con lecciones publicadas o desbloqueadas.</p>
            </div>
          )}
        </main>
      </div>

      {/* Alerta flotante de lección bloqueada */}
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

      {/* Temario Drawer colapsable para mobile */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300"
          onClick={() => setIsMobileSidebarOpen(false)}
        >
          <div
            className="w-80 max-w-[85%] h-full bg-white shadow-2xl relative flex flex-col animate-fade-in ml-auto"
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
            <div className="flex-grow overflow-y-auto pt-14">
              <div className="p-4 border-b border-slate-50 bg-slate-50/20">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-widest">
                  Módulos del Curso
                </h3>
              </div>
              <CourseSidebar
                modules={course.modules}
                activeLessonId={activeLesson?.id || null}
                onSelectLesson={handleSelectLesson}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

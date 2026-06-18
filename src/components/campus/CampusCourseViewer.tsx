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
import { useSessionHeartbeat } from '@/lib/useSessionHeartbeat';

const CARD_STYLE = "rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 transition-colors p-5";
const CARD_COMPACT_STYLE = "rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 transition-colors p-4";

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
  useSessionHeartbeat();
  
  const [course, setCourse] = useState<CourseWithProgress>(initialCourse);
  const [activeLesson, setActiveLesson] = useState<LessonWithStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'clase' | 'recursos'>('clase');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false); // Para el temario del curso en mobile
  const [isCampusSidebarOpen, setIsCampusSidebarOpen] = useState(false); // Para la barra lateral del campus en mobile
  const [lockedAlert, setLockedAlert] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const [isDark, setIsDark] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedTheme = localStorage.getItem('campus-theme');
    setIsDark(savedTheme === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('campus-theme', next ? 'dark' : 'light');
  };

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

  const isLiveClassButtonDisabled = (() => {
    if (!activeLesson || activeLesson.type !== 'LIVE') return false;
    const hasResolvedSession = !!activeLesson.resolvedLiveSession;
    const effectiveScheduledAt = hasResolvedSession
      ? activeLesson.resolvedLiveSession!.startDateTime
      : (activeLesson.scheduledAt as any);

    if (!effectiveScheduledAt) return false;
    const scheduledTime = new Date(effectiveScheduledAt).getTime();
    return Date.now() < (scheduledTime + 60 * 60 * 1000);
  })();

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

  const renderModulesCard = (compact: boolean) => (
    <div className={`${compact ? CARD_COMPACT_STYLE : CARD_STYLE} overflow-hidden flex flex-col h-[380px] !p-0 min-w-0`}>
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
        <h3 className="text-sm font-extrabold text-slate-950 dark:text-slate-50 uppercase tracking-wider">
          {modulesLabel}
        </h3>
      </div>
      <div className="flex-grow overflow-hidden">
        <CourseSidebar
          modules={course.modules}
          activeLessonId={activeLesson?.id || null}
          onSelectLesson={handleSelectLesson}
        />
      </div>
    </div>
  );

  const renderProgressCard = (compact: boolean) => (
    <div className={`${compact ? CARD_COMPACT_STYLE : CARD_STYLE} min-w-0`}>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[11px] font-extrabold text-orange-700 dark:text-orange-400 uppercase tracking-wider bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded-full">
            Mi Progreso
          </span>
          <span className="text-sm font-black text-slate-900 dark:text-slate-50">{course.percent}%</span>
        </div>
        <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
          Progreso General
        </h4>
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div className="bg-orange-500 h-full rounded-full transition-all duration-500" style={{ width: `${course.percent}%` }} />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold">
          {course.completedLessons || 0} de {course.totalLessons || 0} clases completadas
        </p>
      </div>
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium italic">
          Camino a tu consistencia.
        </p>
        {course.certificate && (
          <Link
            href={`/certificado/${course.certificate.certificateCode}`}
            className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline flex items-center gap-0.5"
          >
            Ver Certificado →
          </Link>
        )}
      </div>
    </div>
  );

  const renderChecklistCard = (compact: boolean) => (
    <div className={`${compact ? CARD_COMPACT_STYLE : CARD_STYLE} min-w-0`}>
      <div>
        <span className="text-[11px] font-extrabold text-orange-700 dark:text-orange-400 uppercase tracking-wider bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded-full">
          Mindset Diario
        </span>
        <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mt-2 mb-2.5">
          Checklist del Trader
        </h4>
        {checklistItems.length > 0 ? (
          <ul className="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {checklistItems.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleChecklistItem(item.id)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-700 text-orange-600 dark:text-orange-500 focus:ring-orange-500 bg-white dark:bg-slate-900 cursor-pointer"
                />
                <span className={item.checked ? 'line-through text-slate-400 dark:text-slate-500 font-medium' : ''}>
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500 font-bold italic py-2">
            No hay checklist configurado.
          </p>
        )}
      </div>
    </div>
  );

  const renderResourcesCard = (compact: boolean) => (
    <div className={`${compact ? CARD_COMPACT_STYLE : CARD_STYLE} min-w-0`}>
      <div className="flex flex-col h-full">
        <span className="text-[11px] font-extrabold text-orange-700 dark:text-orange-400 uppercase tracking-wider bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded-full self-start mb-2">
          Recursos
        </span>
        <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mb-2">
          Materiales Descargables
        </h4>
        <div className="space-y-2 overflow-y-auto max-h-[140px] flex-1 pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
          {currentMaterials.length > 0 ? (
            currentMaterials.map((mat) => (
              <a
                key={mat.id}
                href={mat.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 hover:bg-slate-100/75 dark:hover:bg-slate-800 flex items-center justify-between text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition-all"
              >
                <div className="flex items-center gap-2 truncate">
                  {renderMaterialIcon(mat.type)}
                  <span className="truncate" title={mat.description || mat.title}>
                    {mat.title}
                  </span>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
            ))
          ) : parsedResources.length > 0 ? (
            parsedResources.map((res, idx) => (
              <a
                key={idx}
                href={res.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 hover:bg-slate-100/75 dark:hover:bg-slate-800 flex items-center justify-between text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition-all"
              >
                <span className="truncate max-w-[150px]">{res.title}</span>
                <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
            ))
          ) : (
            <div className="text-center py-4">
              <p className="text-xs text-slate-400 dark:text-slate-500 font-bold italic">
                No hay recursos para esta sesión.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderPerformanceCard = (compact: boolean) => (
    <div className={`${compact ? CARD_COMPACT_STYLE : CARD_STYLE} min-w-0`}>
      <div className="space-y-3">
        <span className="text-[11px] font-extrabold text-orange-700 dark:text-orange-400 uppercase tracking-wider bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded-full">
          Rendimiento
        </span>
        <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mt-1">
          Métricas del Curso
        </h4>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div className="border border-slate-100 dark:border-slate-800/80 rounded-xl p-2 bg-slate-50/30 dark:bg-slate-950/20 text-center">
            <span className="block text-xs text-slate-400 dark:text-slate-500 font-bold uppercase">Módulos</span>
            <span className="text-base font-black text-slate-800 dark:text-slate-50">{course.modules?.length || 0}</span>
          </div>
          <div className="border border-slate-100 dark:border-slate-800/80 rounded-xl p-2 bg-slate-50/30 dark:bg-slate-950/20 text-center">
            <span className="block text-xs text-slate-400 dark:text-slate-500 font-bold uppercase">Lecciones</span>
            <span className="text-base font-black text-slate-800 dark:text-slate-50">{allLessons.length || 0}</span>
          </div>
        </div>
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium italic leading-relaxed">
            {motivationalQuote}
          </p>
        </div>
      </div>
    </div>
  );

  const renderDescriptionCard = () => (
    <div className={`${CARD_STYLE} min-w-0`}>
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-3">
        <svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        <h3 className="text-sm font-extrabold text-slate-950 dark:text-slate-50 uppercase tracking-wider">
          Descripción de la clase
        </h3>
      </div>
      <div className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
        {activeLesson && <SafeMarkdown content={activeLesson.description || ''} />}
      </div>
    </div>
  );

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 flex font-sans transition-colors duration-200">
      <CampusSidebar
        userName={userName}
        userRole={userRole}
        activeSlug={course.slug}
        isOpen={isCampusSidebarOpen}
        onClose={() => setIsCampusSidebarOpen(false)}
        welcomeText={welcomeText}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden relative">
        <header className="sticky top-0 z-30 h-14 bg-white/85 backdrop-blur dark:bg-slate-950/85 border-b border-slate-200/50 dark:border-slate-800/80 transition-colors duration-200">
          <div className="max-w-[1500px] h-full mx-auto px-6 2xl:px-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setIsCampusSidebarOpen(true)}
                className="xl:hidden p-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-400 rounded-xl transition-all"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm sm:text-base font-extrabold text-slate-950 dark:text-slate-100 tracking-tight line-clamp-1 max-w-[200px] sm:max-w-md">
                    {campusTitle}
                  </h1>
                  {course.studentScheduleOptionName && (
                    <span className="hidden sm:inline-flex items-center text-[9px] font-extrabold px-2 py-0.5 rounded bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-100/30 dark:border-orange-500/15 uppercase tracking-wider">
                      Comisión: {course.studentScheduleOptionName}
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-medium line-clamp-1">
                  {campusSubtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="https://wa.me/5491176632244"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-350 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-200 dark:hover:border-orange-500/30 transition-all bg-white dark:bg-slate-900 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Soporte</span>
              </a>

              {isMounted && (
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-xl transition-all cursor-pointer"
                  title={!isDark ? 'Modo Oscuro' : 'Modo Claro'}
                >
                  {!isDark ? (
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  ) : (
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                    </svg>
                  )}
                </button>
              )}
              {!isMounted && <div className="w-8.5 h-8.5" />}

              <button
                type="button"
                className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-xl transition-all relative cursor-pointer"
              >
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 ring-2 ring-white dark:ring-slate-900" />
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>

              <span className="h-5 w-px bg-slate-200 dark:bg-slate-800/80 hidden sm:block" />

              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-extrabold text-xs flex items-center justify-center border border-orange-100/30 dark:border-orange-500/15 shadow-sm uppercase">
                  {initials}
                </div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-400 hidden md:block max-w-[100px] truncate">
                  {userName}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950 transition-colors duration-200 py-6 min-w-0 overflow-x-hidden">
          <div className="max-w-[1500px] mx-auto px-6 2xl:px-8 space-y-5">
            {activeLesson ? (
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,820px)_360px] 2xl:grid-cols-[minmax(0,900px)_400px] xl:items-start">
                
                <div className="space-y-4 min-w-0">
                  <div className={`${CARD_STYLE} !p-4 sm:!p-5 space-y-4`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-2.5">
                      <div>
                        <span className="text-[9px] text-orange-700 dark:text-orange-400 font-extrabold uppercase tracking-widest bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded-full">
                          {activeModule ? `Módulo ${activeModuleIndex} · Clase ${activeLessonIndex}` : 'Lección en curso'}
                        </span>
                        <h2 className="text-sm sm:text-base font-extrabold text-slate-950 dark:text-slate-50 tracking-tight mt-1.5">
                          {activeLesson.title}
                        </h2>
                      </div>
                      
                      <div className="self-start sm:self-auto flex-shrink-0">
                        {activeLesson.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-450 border border-emerald-100/50 dark:border-emerald-500/15 shadow-sm">
                            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>Completada</span>
                          </span>
                        ) : activeLesson.status === 'locked' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800">
                            <svg className="w-4 h-4 text-slate-400 dark:text-slate-550" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m0-6v2m0-8H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-5" />
                            </svg>
                            <span>Bloqueada</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={triggerManualCompletion}
                            disabled={isCompleting || isLiveClassButtonDisabled}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                            title={isLiveClassButtonDisabled ? "Estará disponible 1 hora después del inicio de la clase en vivo." : undefined}
                          >
                            {isCompleting ? 'Procesando...' : 'Marcar como Completada'}
                          </button>
                        )}
                      </div>
                    </div>

                    {activeLesson.type === 'LIVE' && !activeLesson.recordingUrl ? (
                      <LiveClassRoom lesson={activeLesson} />
                    ) : (
                      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-black shadow-md aspect-video w-full mx-auto">
                        <LessonPlayer key={activeLesson.id} lesson={activeLesson} onLessonCompleted={handleLessonCompleted} />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-4 pt-2.5 border-t border-slate-100 dark:border-slate-800/60">
                      <button
                        type="button"
                        onClick={() => prevLesson && handleSelectLesson(prevLesson)}
                        disabled={!prevLesson}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-200 dark:hover:border-orange-500/30 transition-all bg-white dark:bg-slate-900 active:scale-[0.98] cursor-pointer"
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
                          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-950 rounded-xl text-xs font-bold disabled:opacity-35 disabled:hover:bg-slate-900 dark:disabled:hover:bg-slate-100 transition-all active:scale-[0.98] cursor-pointer shadow-sm"
                        >
                          <span>Siguiente Clase</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {activeLesson.description && activeLesson.description.trim() !== '' && (
                    <div className="hidden xl:block">
                      {renderDescriptionCard()}
                    </div>
                  )}

                  <div className="xl:hidden">
                    {renderModulesCard(false)}
                  </div>

                  <div className="xl:hidden">
                    {renderProgressCard(false)}
                  </div>

                  <div className="xl:hidden">
                    {renderResourcesCard(false)}
                  </div>

                  {renderChecklistCard(false)}

                  <div className="xl:hidden">
                    {renderPerformanceCard(false)}
                  </div>

                  {activeLesson.description && activeLesson.description.trim() !== '' && (
                    <div className="xl:hidden">
                      {renderDescriptionCard()}
                    </div>
                  )}

                </div>

                <aside className="hidden xl:flex flex-col min-w-0 self-start">
                  <div className="flex flex-col gap-4 sticky top-[56px]">
                    {renderModulesCard(true)}
                    {renderProgressCard(true)}
                    {renderResourcesCard(true)}
                    {renderPerformanceCard(true)}
                  </div>
                </aside>

              </section>
            ) : (
              <div className={`${CARD_STYLE} max-w-md mx-auto text-center py-12 space-y-4 mt-8`}>
                <svg className="h-10 w-10 text-slate-400 dark:text-slate-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="font-bold text-slate-900 dark:text-slate-50 text-sm">Lección no disponible</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Este curso no cuenta con lecciones publicadas o desbloqueadas.</p>
              </div>
            )}
          </div>
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
    </div>
  );
}

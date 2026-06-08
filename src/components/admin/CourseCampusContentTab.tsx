'use client';

import {
  createCourseModule,
  createModuleLesson,
  deleteCourseModule,
  deleteModuleLesson,
  fetchBunnyLessonDuration,
  reorderCourseModules,
  reorderModuleLessons,
  updateCourseCampusSettings,
  updateCourseModule,
  updateModuleLesson,
  lockCampusStructure,
  unlockCampusStructure,
} from '@/app/actions/admin-course-content';
import type { AdminCourseCampusContent, AdminLessonContent, AdminModuleContent } from '@/types/admin-course-content';
import { UnlockMode } from '@prisma/client';
import React from 'react';
import CourseCampusSummaryCard from './CourseCampusSummaryCard';
import CourseModuleEditor from './CourseModuleEditor';
import type { LessonFormValue } from './LessonFieldsForm';

interface CourseCampusContentTabProps {
  initialContent: AdminCourseCampusContent;
}

function normalizeContent(content: AdminCourseCampusContent): AdminCourseCampusContent {
  const modules = [...content.modules]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((module, index) => {
      const lessons = [...module.lessons].sort((a, b) => a.sortOrder - b.sortOrder);
      return {
        ...module,
        sortOrder: index + 1,
        lessonCount: lessons.length,
        publishedLessonCount: lessons.filter((lesson) => lesson.isPublished).length,
        hasProgress: lessons.some((lesson) => lesson.hasProgress),
        lessons: lessons.map((lesson, lessonIndex) => ({
          ...lesson,
          sortOrder: lessonIndex + 1,
        })),
      };
    });

  return {
    ...content,
    modules,
    moduleCount: modules.length,
    lessonCount: modules.reduce((acc, module) => acc + module.lessons.length, 0),
    publishedLessonCount: modules.reduce((acc, module) => acc + module.lessons.filter((lesson) => lesson.isPublished).length, 0),
  };
}

function replaceModule(modules: AdminModuleContent[], nextModule: AdminModuleContent) {
  return modules.map((module) => (module.id === nextModule.id ? nextModule : module));
}

function replaceLesson(modules: AdminModuleContent[], nextLesson: AdminLessonContent) {
  return modules.map((module) =>
    module.id === nextLesson.moduleId
      ? {
          ...module,
          lessons: module.lessons.map((lesson) => (lesson.id === nextLesson.id ? nextLesson : lesson)),
        }
      : module
  );
}

function reorderItems<T extends { id: string }>(items: T[], targetId: string, direction: 'up' | 'down') {
  const currentIndex = items.findIndex((item) => item.id === targetId);
  if (currentIndex === -1) return items;
  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= items.length) return items;

  const clone = [...items];
  const [item] = clone.splice(currentIndex, 1);
  clone.splice(nextIndex, 0, item);
  return clone;
}

export default function CourseCampusContentTab({ initialContent }: CourseCampusContentTabProps) {
  const [content, setContent] = React.useState<AdminCourseCampusContent>(() => normalizeContent(initialContent));
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = React.useState(false);
  const [isLockingOrUnlocking, setIsLockingOrUnlocking] = React.useState(false);
  const [pendingModuleId, setPendingModuleId] = React.useState<string | null>(null);
  const [pendingLessonId, setPendingLessonId] = React.useState<string | null>(null);
  const [activeModal, setActiveModal] = React.useState<{
    type: 'deleteModule' | 'deleteLesson' | 'lockStructure' | 'unlockStructure';
    target: any;
    inputText?: string;
  } | null>(null);
  const feedbackRef = React.useRef<HTMLDivElement>(null);

  const handleLockCampusStructure = async () => {
    setIsLockingOrUnlocking(true);
    setFeedback(null);
    try {
      const result = await lockCampusStructure(content.courseId);
      if (!result.success) {
        showError(result.error || 'No se pudo bloquear la estructura.');
        return;
      }
      setContent((current) => normalizeContent({ ...current, campusContentLocked: true }));
      showSuccess('Estructura del campus bloqueada.');
    } catch (error: any) {
      console.error('[LOCK CAMPUS STRUCTURE ERROR]', error);
      showError(error.message || 'Ocurrió un error inesperado al bloquear la estructura.');
    } finally {
      setIsLockingOrUnlocking(false);
    }
  };

  const handleUnlockCampusStructure = async () => {
    setIsLockingOrUnlocking(true);
    setFeedback(null);
    try {
      const result = await unlockCampusStructure(content.courseId);
      if (!result.success) {
        showError(result.error || 'No se pudo desbloquear la estructura.');
        return;
      }
      setContent((current) => normalizeContent({ ...current, campusContentLocked: false }));
      showSuccess('Estructura del campus desbloqueada.');
    } catch (error: any) {
      console.error('[UNLOCK CAMPUS STRUCTURE ERROR]', error);
      showError(error.message || 'Ocurrió un error inesperado al desbloquear la estructura.');
    } finally {
      setIsLockingOrUnlocking(false);
    }
  };

  const showError = React.useCallback((message: string) => {
    setFeedback({ type: 'error', message });
    // Scroll al banner de error para que sea visible aunque esté fuera del viewport
    setTimeout(() => {
      feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }, []);

  const showSuccess = React.useCallback((message: string) => {
    setFeedback({ type: 'success', message });
  }, []);

  const handleSaveUnlockMode = async (unlockMode: UnlockMode) => {
    setIsSavingSettings(true);
    setFeedback(null);
    try {
      const result = await updateCourseCampusSettings(content.courseId, { unlockMode });
      if (!result.success) {
        showError(result.error || 'No se pudo guardar el unlock mode.');
        return;
      }

      setContent((current) => normalizeContent({ ...current, unlockMode }));
      showSuccess('Configuración general del campus guardada.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCreateModule = async (
    courseId: string,
    value: { title: string; description: string; requiredPrevious: boolean }
  ) => {
    setPendingModuleId(`create:${courseId}`);
    setFeedback(null);
    try {
      const result = await createCourseModule(courseId, value);
      if (!result.success || !result.module) {
        showError(result.error || 'No se pudo crear el módulo.');
        return;
      }

      setContent((current) =>
        normalizeContent({
          ...current,
          modules: [...current.modules, result.module],
        })
      );
      showSuccess('Módulo creado.');
    } finally {
      setPendingModuleId(null);
    }
  };

  const handleUpdateModule = async (
    moduleId: string,
    value: { title: string; description: string; requiredPrevious: boolean }
  ) => {
    setPendingModuleId(moduleId);
    setFeedback(null);
    try {
      const result = await updateCourseModule(moduleId, value);
      if (!result.success || !result.module) {
        showError(result.error || 'No se pudo actualizar el módulo.');
        return;
      }

      setContent((current) =>
        normalizeContent({
          ...current,
          modules: replaceModule(current.modules, result.module),
        })
      );
      showSuccess('Módulo actualizado.');
    } finally {
      setPendingModuleId(null);
    }
  };

  const handleDeleteModule = async (module: AdminModuleContent) => {
    console.log('[DELETE MODULE] iniciando', { moduleId: module.id, title: module.title, hasProgress: module.hasProgress });
    setPendingModuleId(module.id);
    setFeedback(null);
    try {
      const result = await deleteCourseModule(module.id);
      console.log('[DELETE MODULE] resultado action', result);
      if (!result.success) {
        showError(result.error || 'No se pudo eliminar el módulo.');
        return;
      }

      setContent((current) =>
        normalizeContent({
          ...current,
          modules: current.modules.filter((currentModule) => currentModule.id !== module.id),
        })
      );
      showSuccess('Módulo eliminado.');
    } catch (error: any) {
      console.error('[DELETE MODULE ERROR]', error);
      showError(error.message || 'Ocurrió un error inesperado al eliminar el módulo.');
    } finally {
      setPendingModuleId(null);
    }
  };

  const handleMoveModule = async (moduleId: string, direction: 'up' | 'down') => {
    const orderedModules = reorderItems(content.modules, moduleId, direction);
    if (orderedModules === content.modules) {
      return;
    }

    // CRITICAL: actualizar sortOrder antes de normalizeContent.
    // normalizeContent ordena por sortOrder — si no se actualiza, re-revierte el cambio visual.
    const orderedWithSort = orderedModules.map((mod, idx) => ({ ...mod, sortOrder: idx + 1 }));
    const previousModules = content.modules;

    // Optimistic update inmediato
    setContent((current) => normalizeContent({ ...current, modules: orderedWithSort }));

    setPendingModuleId(moduleId);
    setFeedback(null);
    try {
      const result = await reorderCourseModules(
        content.courseId,
        orderedModules.map((module) => module.id)
      );

      if (!result.success) {
        setContent((current) => normalizeContent({ ...current, modules: previousModules }));
        showError(result.error || 'No se pudo reordenar el módulo.');
        return;
      }

      showSuccess('Orden de módulos actualizado.');
    } finally {
      setPendingModuleId(null);
    }
  };

  const handleCreateLesson = async (moduleId: string, value: LessonFormValue) => {
    setPendingLessonId(`create:${moduleId}`);
    setFeedback(null);
    try {
      const result = await createModuleLesson(moduleId, value);
      if (!result.success || !result.lesson) {
        showError(result.error || 'No se pudo crear la lección.');
        return;
      }

      setContent((current) =>
        normalizeContent({
          ...current,
          modules: current.modules.map((module) =>
            module.id === moduleId
              ? {
                  ...module,
                  lessons: [...module.lessons, result.lesson!],
                }
              : module
          ),
        })
      );
      showSuccess('Lección creada.');
    } finally {
      setPendingLessonId(null);
    }
  };

  const handleUpdateLesson = async (lessonId: string, value: LessonFormValue) => {
    setPendingLessonId(lessonId);
    setFeedback(null);
    try {
      const result = await updateModuleLesson(lessonId, value);
      if (!result.success || !result.lesson) {
        showError(result.error || 'No se pudo actualizar la lección.');
        return;
      }

      setContent((current) =>
        normalizeContent({
          ...current,
          modules: replaceLesson(current.modules, result.lesson),
        })
      );
      showSuccess('Lección actualizada.');
    } finally {
      setPendingLessonId(null);
    }
  };

  const handleDeleteLesson = async (lesson: AdminLessonContent) => {
    console.log('[DELETE LESSON] iniciando', { lessonId: lesson.id, title: lesson.title, hasProgress: lesson.hasProgress, progressCount: lesson.progressCount });
    setPendingLessonId(lesson.id);
    setFeedback(null);
    try {
      const result = await deleteModuleLesson(lesson.id);
      console.log('[DELETE LESSON] resultado action', result);
      if (!result.success) {
        showError(result.error || 'No se pudo eliminar la lección.');
        return;
      }

      setContent((current) =>
        normalizeContent({
          ...current,
          modules: current.modules.map((module) =>
            module.id === lesson.moduleId
              ? {
                  ...module,
                  lessons: module.lessons.filter((currentLesson) => currentLesson.id !== lesson.id),
                }
              : module
          ),
        })
      );
      showSuccess('Lección eliminada.');
    } catch (error: any) {
      console.error('[DELETE LESSON ERROR]', error);
      showError(error.message || 'Ocurrió un error inesperado al eliminar la lección.');
    } finally {
      setPendingLessonId(null);
    }
  };

  const handleMoveLesson = async (moduleId: string, lessonId: string, direction: 'up' | 'down') => {
    const module = content.modules.find((currentModule) => currentModule.id === moduleId);
    if (!module) return;

    const orderedLessons = reorderItems(module.lessons, lessonId, direction);
    if (orderedLessons === module.lessons) {
      return;
    }

    // CRITICAL: actualizar sortOrder antes de normalizeContent.
    const orderedLessonsWithSort = orderedLessons.map((les, idx) => ({ ...les, sortOrder: idx + 1 }));
    const previousModules = content.modules;

    // Optimistic update inmediato
    setContent((current) =>
      normalizeContent({
        ...current,
        modules: current.modules.map((currentModule) =>
          currentModule.id === moduleId
            ? { ...currentModule, lessons: orderedLessonsWithSort }
            : currentModule
        ),
      })
    );

    setPendingLessonId(lessonId);
    setFeedback(null);
    try {
      const result = await reorderModuleLessons(
        moduleId,
        orderedLessons.map((lesson) => lesson.id)
      );

      if (!result.success) {
        setContent((current) => normalizeContent({ ...current, modules: previousModules }));
        showError(result.error || 'No se pudo reordenar la lección.');
        return;
      }

      showSuccess('Orden de lecciones actualizado.');
    } finally {
      setPendingLessonId(null);
    }
  };

  const handleFetchBunnyDuration = async (videoId: string) => {
    const result = await fetchBunnyLessonDuration(videoId);
    if (!result.success || typeof result.durationSecs !== 'number') {
      showError(result.error || 'No se pudo obtener la duración desde Bunny.');
      return null;
    }

    showSuccess('Duración obtenida desde Bunny.');
    return result.durationSecs;
  };

  return (
    <div className="space-y-6">
      {feedback ? (
        <div
          ref={feedbackRef}
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.type === 'success'
              ? 'border-teal-200 bg-teal-50 text-teal-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.type === 'error' ? '❌ ' : '✅ '}{feedback.message}
        </div>
      ) : null}

      <CourseCampusSummaryCard
        content={content}
        isSaving={isSavingSettings}
        onSaveUnlockMode={handleSaveUnlockMode}
        isLockingOrUnlocking={isLockingOrUnlocking}
        onLockCampusStructure={() => {
          console.log('[LOCK STRUCTURE PROP CALLBACK] showing modal');
          setActiveModal({ type: 'lockStructure', target: null, inputText: '' });
        }}
        onUnlockCampusStructure={() => {
          console.log('[UNLOCK STRUCTURE PROP CALLBACK] showing modal');
          setActiveModal({ type: 'unlockStructure', target: null, inputText: '' });
        }}
      />

      <CourseModuleEditor
        courseId={content.courseId}
        modules={content.modules}
        campusContentLocked={content.campusContentLocked}
        pendingModuleId={pendingModuleId}
        pendingLessonId={pendingLessonId}
        onCreateModule={handleCreateModule}
        onUpdateModule={handleUpdateModule}
        onDeleteModule={async (module) => {
          console.log('[DELETE MODULE PROP CALLBACK] showing modal for', module.id);
          setActiveModal({ type: 'deleteModule', target: module });
        }}
        onMoveModule={handleMoveModule}
        onCreateLesson={handleCreateLesson}
        onUpdateLesson={handleUpdateLesson}
        onDeleteLesson={async (lesson) => {
          console.log('[DELETE LESSON PROP CALLBACK] showing modal for', lesson.id);
          setActiveModal({ type: 'deleteLesson', target: lesson });
        }}
        onMoveLesson={handleMoveLesson}
        onFetchBunnyDuration={handleFetchBunnyDuration}
      />

      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-gray-100 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-left">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {activeModal.type === 'deleteModule' && '⚠️ ¿Eliminar Módulo?'}
              {activeModal.type === 'deleteLesson' && '⚠️ ¿Eliminar Lección?'}
              {activeModal.type === 'lockStructure' && '🔒 Bloquear Estructura'}
              {activeModal.type === 'unlockStructure' && '🔓 Desbloquear Estructura'}
            </h3>
            
            <p className="text-sm text-gray-500 leading-relaxed">
              {activeModal.type === 'deleteModule' && (
                activeModal.target.hasProgress
                  ? `¡Atención! El módulo "${activeModal.target.title}" tiene actividad/progreso de alumnos. Si lo eliminás, se borrarán de forma definitiva todas sus lecciones y el progreso asociado.`
                  : `¿Querés eliminar el módulo "${activeModal.target.title}"? Esta acción no se puede deshacer.`
              )}
              {activeModal.type === 'deleteLesson' && (
                activeModal.target.hasProgress
                  ? `¡Atención! La lección "${activeModal.target.title}" tiene actividad/progreso registrado por alumnos (${activeModal.target.progressCount} registro/s). Si la eliminás, se borrará de forma definitiva junto con todo su progreso.`
                  : `¿Querés eliminar la lección "${activeModal.target.title}"? Esta acción no se puede deshacer.`
              )}
              {activeModal.type === 'lockStructure' && (
                'Para bloquear la estructura del campus y proteger el progreso de los alumnos, por favor escribí "BLOQUEAR" a continuación:'
              )}
              {activeModal.type === 'unlockStructure' && (
                'Para desbloquear la estructura del campus y permitir la edición libre, por favor escribí "DESBLOQUEAR" a continuación:'
              )}
            </p>

            {(activeModal.type === 'lockStructure' || activeModal.type === 'unlockStructure') && (
              <input
                type="text"
                value={activeModal.inputText || ''}
                onChange={(e) => setActiveModal({ ...activeModal, inputText: e.target.value })}
                placeholder={activeModal.type === 'lockStructure' ? 'BLOQUEAR' : 'DESBLOQUEAR'}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500 transition-all text-sm font-semibold uppercase tracking-wider text-center"
              />
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  (activeModal.type === 'lockStructure' && activeModal.inputText !== 'BLOQUEAR') ||
                  (activeModal.type === 'unlockStructure' && activeModal.inputText !== 'DESBLOQUEAR')
                }
                onClick={async () => {
                  const modal = activeModal;
                  setActiveModal(null);
                  if (modal.type === 'deleteModule') {
                    await handleDeleteModule(modal.target);
                  } else if (modal.type === 'deleteLesson') {
                    await handleDeleteLesson(modal.target);
                  } else if (modal.type === 'lockStructure') {
                    await handleLockCampusStructure();
                  } else if (modal.type === 'unlockStructure') {
                    await handleUnlockCampusStructure();
                  }
                }}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-sm ${
                  activeModal.type.startsWith('delete')
                    ? 'bg-red-600 hover:bg-red-700 disabled:opacity-50'
                    : 'bg-teal-600 hover:bg-teal-700 disabled:opacity-50'
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

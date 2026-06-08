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
  const [pendingModuleId, setPendingModuleId] = React.useState<string | null>(null);
  const [pendingLessonId, setPendingLessonId] = React.useState<string | null>(null);

  const showError = React.useCallback((message: string) => {
    setFeedback({ type: 'error', message });
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
    setPendingModuleId(module.id);
    setFeedback(null);
    try {
      const result = await deleteCourseModule(module.id);
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
    } finally {
      setPendingModuleId(null);
    }
  };

  const handleMoveModule = async (moduleId: string, direction: 'up' | 'down') => {
    const orderedModules = reorderItems(content.modules, moduleId, direction);
    if (orderedModules === content.modules) {
      return;
    }

    setPendingModuleId(moduleId);
    setFeedback(null);
    try {
      const result = await reorderCourseModules(
        content.courseId,
        orderedModules.map((module) => module.id)
      );

      if (!result.success) {
        showError(result.error || 'No se pudo reordenar el módulo.');
        return;
      }

      setContent((current) =>
        normalizeContent({
          ...current,
          modules: orderedModules,
        })
      );
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
    setPendingLessonId(lesson.id);
    setFeedback(null);
    try {
      const result = await deleteModuleLesson(lesson.id);
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

    setPendingLessonId(lessonId);
    setFeedback(null);
    try {
      const result = await reorderModuleLessons(
        moduleId,
        orderedLessons.map((lesson) => lesson.id)
      );

      if (!result.success) {
        showError(result.error || 'No se pudo reordenar la lección.');
        return;
      }

      setContent((current) =>
        normalizeContent({
          ...current,
          modules: current.modules.map((currentModule) =>
            currentModule.id === moduleId
              ? {
                  ...currentModule,
                  lessons: orderedLessons,
                }
              : currentModule
          ),
        })
      );
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
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-teal-100 bg-teal-50 text-teal-800'
              : 'border-red-100 bg-red-50 text-red-700'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <CourseCampusSummaryCard
        content={content}
        isSaving={isSavingSettings}
        onSaveUnlockMode={handleSaveUnlockMode}
      />

      <CourseModuleEditor
        courseId={content.courseId}
        modules={content.modules}
        pendingModuleId={pendingModuleId}
        pendingLessonId={pendingLessonId}
        onCreateModule={handleCreateModule}
        onUpdateModule={handleUpdateModule}
        onDeleteModule={handleDeleteModule}
        onMoveModule={handleMoveModule}
        onCreateLesson={handleCreateLesson}
        onUpdateLesson={handleUpdateLesson}
        onDeleteLesson={handleDeleteLesson}
        onMoveLesson={handleMoveLesson}
        onFetchBunnyDuration={handleFetchBunnyDuration}
      />
    </div>
  );
}

'use client';

import type { AdminLessonContent, AdminScheduleOption, AdminLiveSession } from '@/types/admin-course-content';
import { LessonType, VideoProvider } from '@prisma/client';
import React from 'react';
import LessonFieldsForm, { type LessonFormValue } from './LessonFieldsForm';
import LessonLiveSessionsEditor from './LessonLiveSessionsEditor';

interface CourseLessonEditorProps {
  moduleId: string;
  lessons: AdminLessonContent[];
  campusContentLocked?: boolean;
  pendingLessonId: string | null;
  scheduleOptions: AdminScheduleOption[];
  initialSessionsMap: Record<string, AdminLiveSession[]>; // lessonId -> sessions
  onCreateLesson: (moduleId: string, value: LessonFormValue) => Promise<void>;
  onUpdateLesson: (lessonId: string, value: LessonFormValue) => Promise<void>;
  onDeleteLesson: (lesson: AdminLessonContent) => Promise<void>;
  onMoveLesson: (moduleId: string, lessonId: string, direction: 'up' | 'down') => Promise<void>;
  onFetchBunnyDuration: (videoId: string) => Promise<number | null>;
}

function formatDateTime(dateString: string | null) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toFormValue(lesson?: AdminLessonContent): LessonFormValue {
  if (!lesson) {
    return {
      title: '',
      description: '',
      type: LessonType.RECORDED,
      videoProvider: VideoProvider.LEGACY,
      videoId: '',
      videoUrl: '',
      videoDurationSecs: '',
      liveUrl: '',
      scheduledAt: '',
      recordingUrl: '',
      unlockMinutesBefore: '10',
      durationMinutes: '',
      isFree: false,
      isPublished: true,
    };
  }

  const scheduledAt = formatDateTime(lesson.scheduledAt);

  return {
    title: lesson.title,
    description: lesson.description ?? '',
    type: lesson.type,
    videoProvider: lesson.videoProvider,
    videoId: lesson.videoId ?? '',
    videoUrl: lesson.videoUrl ?? '',
    videoDurationSecs: lesson.videoDurationSecs !== null ? String(lesson.videoDurationSecs) : '',
    liveUrl: lesson.liveUrl ?? '',
    scheduledAt,
    recordingUrl: lesson.recordingUrl ?? '',
    unlockMinutesBefore: lesson.unlockMinutesBefore !== null ? String(lesson.unlockMinutesBefore) : '',
    durationMinutes: lesson.durationMinutes !== null ? String(lesson.durationMinutes) : '',
    isFree: lesson.isFree,
    isPublished: lesson.isPublished,
  };
}

export default function CourseLessonEditor({
  moduleId,
  lessons,
  campusContentLocked = false,
  pendingLessonId,
  scheduleOptions,
  initialSessionsMap,
  onCreateLesson,
  onUpdateLesson,
  onDeleteLesson,
  onMoveLesson,
  onFetchBunnyDuration,
}: CourseLessonEditorProps) {
  const [isCreating, setIsCreating] = React.useState(false);
  const [editingLessonId, setEditingLessonId] = React.useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-gray-900">Lecciones</h4>
          <p className="text-xs text-gray-500">Cargá, editá y reordená el contenido del módulo.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsCreating((current) => !current);
            setEditingLessonId(null);
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          {isCreating ? 'Cerrar alta' : 'Nueva lección'}
        </button>
      </div>

      {isCreating ? (
        <LessonFieldsForm
          initialValue={toFormValue()}
          submitLabel="Crear lección"
          isSaving={pendingLessonId === `create:${moduleId}`}
          onFetchBunnyDuration={onFetchBunnyDuration}
          onCancel={() => setIsCreating(false)}
          hasActiveComissions={scheduleOptions.length > 0}
          onSubmit={async (value) => {
            await onCreateLesson(moduleId, value);
            setIsCreating(false);
          }}
        />
      ) : null}

      {lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
          Este módulo todavía no tiene lecciones.
        </div>
      ) : null}

      {lessons.map((lesson, index) => {
        const isEditing = editingLessonId === lesson.id;
        const isSaving = pendingLessonId === lesson.id;
        return (
          <div key={lesson.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                    #{index + 1}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {lesson.type}
                  </span>
                  <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                    {lesson.isPublished ? 'Publicada' : 'Oculta'}
                  </span>
                  {lesson.isFree ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      Gratis
                    </span>
                  ) : null}
                  {lesson.hasProgress ? (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200">
                      Con actividad ({lesson.progressCount})
                    </span>
                  ) : null}
                  {lesson.type === LessonType.LIVE && scheduleOptions.length > 0 && (() => {
                    const configuredSessionsCount = initialSessionsMap[lesson.id]?.length || 0;
                    const totalComissionsCount = scheduleOptions.length;
                    return (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                        configuredSessionsCount === totalComissionsCount
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : configuredSessionsCount > 0
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        Sesiones configuradas: {configuredSessionsCount}/{totalComissionsCount}
                      </span>
                    );
                  })()}
                </div>

                <div>
                  <h5 className="text-sm font-bold text-gray-900">{lesson.title}</h5>
                  <p className="mt-1 text-xs text-gray-500">
                    {lesson.type === LessonType.RECORDED ? `Provider: ${lesson.videoProvider}` : 'Lección sin video grabado principal'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onMoveLesson(moduleId, lesson.id, 'up')}
                  disabled={index === 0 || isSaving || campusContentLocked}
                  title={campusContentLocked ? "La estructura está bloqueada para proteger el progreso de los alumnos." : undefined}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Subir
                </button>
                <button
                  type="button"
                  onClick={() => onMoveLesson(moduleId, lesson.id, 'down')}
                  disabled={index === lessons.length - 1 || isSaving || campusContentLocked}
                  title={campusContentLocked ? "La estructura está bloqueada para proteger el progreso de los alumnos." : undefined}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Bajar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingLessonId(isEditing ? null : lesson.id);
                    setIsCreating(false);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {isEditing ? 'Cerrar' : 'Editar'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    console.log('[DELETE LESSON BUTTON CLICK]', { lessonId: lesson.id, isStructureLocked: campusContentLocked, isSaving });
                    onDeleteLesson(lesson);
                  }}
                  disabled={isSaving || campusContentLocked}
                  title={campusContentLocked ? "La estructura está bloqueada para proteger el progreso de los alumnos." : undefined}
                  className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </div>

            {isEditing ? (
              <div className="mt-4">
                <LessonFieldsForm
                  initialValue={toFormValue(lesson)}
                  submitLabel="Guardar lección"
                  isSaving={isSaving}
                  onFetchBunnyDuration={onFetchBunnyDuration}
                  onCancel={() => setEditingLessonId(null)}
                  hasActiveComissions={scheduleOptions.length > 0}
                  onSubmit={async (value) => {
                    await onUpdateLesson(lesson.id, value);
                    setEditingLessonId(null);
                  }}
                />
                {/* Editor de sesiones en vivo por comisión — solo para lecciones LIVE con comisiones activas */}
                {lesson.type === LessonType.LIVE && scheduleOptions.length > 0 && (
                  <LessonLiveSessionsEditor
                    lessonId={lesson.id}
                    scheduleOptions={scheduleOptions}
                    initialSessions={initialSessionsMap[lesson.id] ?? []}
                  />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

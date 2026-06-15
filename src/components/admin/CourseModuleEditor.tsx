'use client';

import type { AdminLessonContent, AdminModuleContent, AdminScheduleOption, AdminLiveSession } from '@/types/admin-course-content';
import React from 'react';
import CourseLessonEditor from './CourseLessonEditor';
import type { LessonFormValue } from './LessonFieldsForm';

interface ModuleFormValue {
  title: string;
  description: string;
  requiredPrevious: boolean;
}

interface CourseModuleEditorProps {
  courseId: string;
  modules: AdminModuleContent[];
  campusContentLocked?: boolean;
  pendingModuleId: string | null;
  pendingLessonId: string | null;
  scheduleOptions: AdminScheduleOption[];
  initialSessionsMap: Record<string, AdminLiveSession[]>;
  onCreateModule: (courseId: string, value: ModuleFormValue) => Promise<void>;
  onUpdateModule: (moduleId: string, value: ModuleFormValue) => Promise<void>;
  onDeleteModule: (module: AdminModuleContent) => Promise<void>;
  onMoveModule: (moduleId: string, direction: 'up' | 'down') => Promise<void>;
  onCreateLesson: (moduleId: string, value: LessonFormValue) => Promise<void>;
  onUpdateLesson: (lessonId: string, value: LessonFormValue) => Promise<void>;
  onDeleteLesson: (lesson: AdminLessonContent) => Promise<void>;
  onMoveLesson: (moduleId: string, lessonId: string, direction: 'up' | 'down') => Promise<void>;
  onFetchBunnyDuration: (videoId: string) => Promise<number | null>;
}

function ModuleForm({
  initialValue,
  submitLabel,
  isSaving,
  onCancel,
  onSubmit,
}: {
  initialValue: ModuleFormValue;
  submitLabel: string;
  isSaving: boolean;
  onCancel?: () => void;
  onSubmit: (value: ModuleFormValue) => Promise<void>;
}) {
  const [value, setValue] = React.useState<ModuleFormValue>(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(value);
      }}
      className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">Título</label>
          <input
            value={value.title}
            onChange={(event) => setValue((current) => ({ ...current, title: event.target.value }))}
            required
            disabled={isSaving}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <input
            id={`required-previous-${submitLabel}`}
            type="checkbox"
            checked={value.requiredPrevious}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                requiredPrevious: event.target.checked,
              }))
            }
            disabled={isSaving}
            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <label className="text-sm font-medium text-gray-700" htmlFor={`required-previous-${submitLabel}`}>
            Requiere módulo anterior
          </label>
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-gray-700">Descripción</label>
          <textarea
            rows={3}
            value={value.description}
            onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))}
            disabled={isSaving}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Guardando...' : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default function CourseModuleEditor({
  courseId,
  modules,
  campusContentLocked = false,
  pendingModuleId,
  pendingLessonId,
  scheduleOptions,
  initialSessionsMap,
  onCreateModule,
  onUpdateModule,
  onDeleteModule,
  onMoveModule,
  onCreateLesson,
  onUpdateLesson,
  onDeleteLesson,
  onMoveLesson,
  onFetchBunnyDuration,
}: CourseModuleEditorProps) {
  const [isCreating, setIsCreating] = React.useState(false);
  const [editingModuleId, setEditingModuleId] = React.useState<string | null>(null);
  const [expandedModuleIds, setExpandedModuleIds] = React.useState<Record<string, boolean>>({});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Módulos y Lecciones</h2>
        <button
          type="button"
          onClick={() => {
            setIsCreating(!isCreating);
            setEditingModuleId(null);
          }}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
        >
          {isCreating ? 'Cancelar' : 'Nuevo Módulo'}
        </button>
      </div>

      {isCreating ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-base font-bold text-gray-900">Crear Nuevo Módulo</h3>
          <ModuleForm
            initialValue={{ title: '', description: '', requiredPrevious: true }}
            submitLabel="Crear módulo"
            isSaving={pendingModuleId === `create:${courseId}`}
            onCancel={() => setIsCreating(false)}
            onSubmit={async (value) => {
              await onCreateModule(courseId, value);
              setIsCreating(false);
            }}
          />
        </div>
      ) : null}

      <section className="space-y-4">
        {modules.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
            No hay módulos creados para este curso. Hacé click en "Nuevo Módulo" para comenzar.
          </div>
        ) : null}

        {modules.map((module, index) => {
          const isExpanded = expandedModuleIds[module.id] ?? true;
          const isEditing = editingModuleId === module.id;
          const isSaving = pendingModuleId === module.id;

          return (
            <div key={module.id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                      Módulo #{index + 1}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {module.lessonCount} lecciones
                    </span>
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                      {module.publishedLessonCount} publicadas
                    </span>
                    {module.requiredPrevious ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        Requiere anterior
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        Desbloqueo libre
                      </span>
                    )}
                    {module.hasProgress ? (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200">
                        Con actividad
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{module.title}</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {module.description || 'Sin descripción cargada.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onMoveModule(module.id, 'up')}
                    disabled={index === 0 || isSaving || campusContentLocked}
                    title={campusContentLocked ? "La estructura está bloqueada para proteger el progreso de los alumnos." : undefined}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveModule(module.id, 'down')}
                    disabled={index === modules.length - 1 || isSaving || campusContentLocked}
                    title={campusContentLocked ? "La estructura está bloqueada para proteger el progreso de los alumnos." : undefined}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Bajar
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedModuleIds((current) => ({
                        ...current,
                        [module.id]: !isExpanded,
                      }))
                    }
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    {isExpanded ? 'Colapsar' : 'Expandir'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingModuleId(isEditing ? null : module.id);
                      setExpandedModuleIds((current) => ({ ...current, [module.id]: true }));
                      setIsCreating(false);
                    }}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    {isEditing ? 'Cerrar' : 'Editar'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      console.log('[DELETE MODULE BUTTON CLICK]', { moduleId: module.id, isStructureLocked: campusContentLocked, isSaving });
                      onDeleteModule(module);
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
                  <ModuleForm
                    initialValue={{
                      title: module.title,
                      description: module.description ?? '',
                      requiredPrevious: module.requiredPrevious,
                    }}
                    submitLabel="Guardar módulo"
                    isSaving={isSaving}
                    onCancel={() => setEditingModuleId(null)}
                    onSubmit={async (value) => {
                      await onUpdateModule(module.id, value);
                      setEditingModuleId(null);
                    }}
                  />
                </div>
              ) : null}

              {isExpanded ? (
                <div className="mt-4 rounded-xl border border-white/70 bg-white p-4">
                                  <CourseLessonEditor
                    moduleId={module.id}
                    lessons={module.lessons}
                    campusContentLocked={campusContentLocked}
                    pendingLessonId={pendingLessonId}
                    scheduleOptions={scheduleOptions}
                    initialSessionsMap={initialSessionsMap}
                    onCreateLesson={onCreateLesson}
                    onUpdateLesson={onUpdateLesson}
                    onDeleteLesson={onDeleteLesson}
                    onMoveLesson={onMoveLesson}
                    onFetchBunnyDuration={onFetchBunnyDuration}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}

'use client';

import type { AdminCourseCampusContent } from '@/types/admin-course-content';
import { UnlockMode } from '@prisma/client';
import React from 'react';

interface CourseCampusSummaryCardProps {
  content: AdminCourseCampusContent;
  isSaving: boolean;
  onSaveUnlockMode: (unlockMode: UnlockMode) => void;
  isLockingOrUnlocking?: boolean;
  onLockCampusStructure?: () => void;
  onUnlockCampusStructure?: () => void;
}

function getCampusStatus(content: AdminCourseCampusContent) {
  if (content.moduleCount === 0) {
    return 'Sin módulos';
  }

  if (content.lessonCount === 0 || content.publishedLessonCount === 0) {
    return 'Con módulos pero sin lecciones publicadas';
  }

  return 'Campus activo';
}

export default function CourseCampusSummaryCard({
  content,
  isSaving,
  onSaveUnlockMode,
  isLockingOrUnlocking = false,
  onLockCampusStructure,
  onUnlockCampusStructure,
}: CourseCampusSummaryCardProps) {
  const [unlockMode, setUnlockMode] = React.useState<UnlockMode>(content.unlockMode);

  React.useEffect(() => {
    setUnlockMode(content.unlockMode);
  }, [content.unlockMode]);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Configuración general del campus</h2>
          <p className="mt-1 text-sm text-gray-500">
            Administrá el desbloqueo del curso y revisá el estado actual del contenido real del campus.
          </p>
        </div>
        <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          <span className="font-semibold">Estado actual:</span> {getCampusStatus(content)}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400">Modo de desbloqueo</span>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <select
              value={unlockMode}
              onChange={(event) => setUnlockMode(event.target.value as UnlockMode)}
              disabled={isSaving}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
            >
              <option value={UnlockMode.free}>free</option>
              <option value={UnlockMode.progressive}>progressive</option>
            </select>
            <button
              type="button"
              onClick={() => onSaveUnlockMode(unlockMode)}
              disabled={isSaving || unlockMode === content.unlockMode}
              className="rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400">Módulos</span>
          <span className="mt-3 block text-3xl font-bold text-gray-900">{content.moduleCount}</span>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400">Lecciones</span>
          <span className="mt-3 block text-3xl font-bold text-gray-900">{content.lessonCount}</span>
          <span className="mt-1 block text-xs text-gray-500">
            {content.publishedLessonCount} publicadas
          </span>
        </div>
      </div>

      <div className={`mt-4 rounded-xl border p-4 flex flex-col md:flex-row items-center justify-between gap-4 transition-all ${
        content.campusContentLocked 
          ? 'border-amber-200 bg-amber-50/50 text-amber-900' 
          : 'border-blue-200 bg-blue-50/50 text-blue-900'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {content.campusContentLocked ? '🔒' : '🔓'}
          </span>
          <div>
            <h3 className="text-sm font-bold">
              Estructura: {content.campusContentLocked ? 'Bloqueada' : 'En edición / Desbloqueada'}
            </h3>
            <p className="text-xs text-gray-600 mt-0.5">
              {content.campusContentLocked 
                ? 'La estructura está bloqueada para proteger el progreso de los alumnos.' 
                : 'Se permite crear, ordenar y eliminar módulos/lecciones. El progreso se puede perder.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={isSaving || isLockingOrUnlocking}
          onClick={() => {
            console.log('[LOCK CARD BUTTON CLICKED]', { campusContentLocked: content.campusContentLocked });
            if (content.campusContentLocked) {
              onUnlockCampusStructure?.();
            } else {
              onLockCampusStructure?.();
            }
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
            content.campusContentLocked
              ? 'bg-amber-600 hover:bg-amber-700 text-white disabled:bg-amber-300'
              : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-300'
          }`}
        >
          {isSaving || isLockingOrUnlocking
            ? 'Procesando...'
            : content.campusContentLocked
              ? 'Desbloquear estructura'
              : 'Bloquear estructura'}
        </button>
      </div>
    </section>
  );
}

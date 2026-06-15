'use client';

import React, { useState, useTransition } from 'react';
import type { AdminScheduleOption, AdminLiveSession } from '@/types/admin-course-content';
import { upsertLiveSession } from '@/app/actions/admin-live-sessions';

interface LessonLiveSessionsEditorProps {
  lessonId: string;
  scheduleOptions: AdminScheduleOption[];
  initialSessions: AdminLiveSession[];
}

interface SessionFormState {
  startDateTime: string;
  endDateTime: string;
  liveUrl: string;
  recordingUrl: string;
}

const emptySession = (): SessionFormState => ({
  startDateTime: '',
  endDateTime: '',
  liveUrl: '',
  recordingUrl: '',
});

export default function LessonLiveSessionsEditor({
  lessonId,
  scheduleOptions,
  initialSessions,
}: LessonLiveSessionsEditorProps) {
  const [sessions, setSessions] = useState<AdminLiveSession[]>(initialSessions);
  const [forms, setForms] = useState<Record<string, SessionFormState>>(() => {
    const initial: Record<string, SessionFormState> = {};
    scheduleOptions.forEach((opt) => {
      const existing = initialSessions.find((s) => s.scheduleOptionId === opt.id);
      initial[opt.id] = {
        startDateTime: existing?.startDateTime
          ? new Date(existing.startDateTime).toISOString().slice(0, 16)
          : '',
        endDateTime: existing?.endDateTime
          ? new Date(existing.endDateTime).toISOString().slice(0, 16)
          : '',
        liveUrl: existing?.liveUrl ?? '',
        recordingUrl: existing?.recordingUrl ?? '',
      };
    });
    return initial;
  });
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const handleChange = (
    optionId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setForms((prev) => ({
      ...prev,
      [optionId]: { ...prev[optionId], [e.target.name]: e.target.value },
    }));
    setSaved((prev) => ({ ...prev, [optionId]: false }));
  };

  const handleSave = (optionId: string) => {
    const form = forms[optionId];
    setSaving((prev) => ({ ...prev, [optionId]: true }));
    setErrors((prev) => ({ ...prev, [optionId]: '' }));
    setSaved((prev) => ({ ...prev, [optionId]: false }));

    startTransition(async () => {
      const result = await upsertLiveSession(lessonId, optionId, {
        startDateTime: form.startDateTime,
        endDateTime: form.endDateTime || null,
        liveUrl: form.liveUrl || null,
        recordingUrl: form.recordingUrl || null,
      });

      setSaving((prev) => ({ ...prev, [optionId]: false }));

      if (!result.success || !result.session) {
        setErrors((prev) => ({
          ...prev,
          [optionId]: result.error || 'Error al guardar.',
        }));
        return;
      }

      // Actualizar lista local de sesiones
      setSessions((prev) => {
        const without = prev.filter((s) => s.scheduleOptionId !== optionId);
        return [...without, result.session!];
      });
      setSaved((prev) => ({ ...prev, [optionId]: true }));
    });
  };

  const activeOptions = scheduleOptions.filter((o) => o.isActive);

  if (activeOptions.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic py-2">
        No hay comisiones activas. Activá al menos una comisión desde la sección "Comisiones / Horarios" del curso.
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-3">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
        Sesiones en vivo por comisión
      </p>

      {activeOptions.map((opt) => {
        const form = forms[opt.id] || emptySession();
        const existingSession = sessions.find((s) => s.scheduleOptionId === opt.id);
        const isSaving = saving[opt.id] ?? false;
        const errorMsg = errors[opt.id];
        const wasSaved = saved[opt.id];

        return (
          <div
            key={opt.id}
            className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-sm font-bold text-gray-800">{opt.name}</span>
              {opt.description && (
                <span className="text-xs text-gray-400">— {opt.description}</span>
              )}
              {existingSession?.liveUrl && (
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">
                  Link cargado
                </span>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Fecha y hora de inicio <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  name="startDateTime"
                  value={form.startDateTime}
                  onChange={(e) => handleChange(opt.id, e)}
                  disabled={isSaving}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Fecha y hora de fin (opcional)
                </label>
                <input
                  type="datetime-local"
                  name="endDateTime"
                  value={form.endDateTime}
                  onChange={(e) => handleChange(opt.id, e)}
                  disabled={isSaving}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Link del vivo (Zoom, Meet, etc.)
                </label>
                <input
                  type="url"
                  name="liveUrl"
                  value={form.liveUrl}
                  onChange={(e) => handleChange(opt.id, e)}
                  disabled={isSaving}
                  placeholder="https://zoom.us/j/..."
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Recording URL (opcional)
                </label>
                <input
                  type="url"
                  name="recordingUrl"
                  value={form.recordingUrl}
                  onChange={(e) => handleChange(opt.id, e)}
                  disabled={isSaving}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-lg">
                {errorMsg}
              </p>
            )}

            {wasSaved && (
              <p className="text-xs text-teal-700 font-semibold bg-teal-50 px-3 py-2 rounded-lg">
                ✓ Sesión guardada correctamente.
              </p>
            )}

            <button
              type="button"
              onClick={() => handleSave(opt.id)}
              disabled={isSaving || !form.startDateTime}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : existingSession ? 'Actualizar sesión' : 'Guardar sesión'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

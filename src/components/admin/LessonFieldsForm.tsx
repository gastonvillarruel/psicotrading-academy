'use client';

import { LessonType, VideoProvider } from '@prisma/client';
import React from 'react';

export interface LessonFormValue {
  title: string;
  description: string;
  type: LessonType;
  videoProvider: VideoProvider;
  videoId: string;
  videoUrl: string;
  videoDurationSecs: string;
  liveUrl: string;
  scheduledAt: string;
  recordingUrl: string;
  unlockMinutesBefore: string;
  durationMinutes: string;
  isFree: boolean;
  isPublished: boolean;
}

interface LessonFieldsFormProps {
  initialValue: LessonFormValue;
  submitLabel: string;
  isSaving: boolean;
  onSubmit: (value: LessonFormValue) => Promise<void> | void;
  onCancel?: () => void;
  onFetchBunnyDuration?: (videoId: string) => Promise<number | null>;
}

function getDefaultValue(value?: Partial<LessonFormValue>): LessonFormValue {
  return {
    title: value?.title ?? '',
    description: value?.description ?? '',
    type: value?.type ?? LessonType.RECORDED,
    videoProvider: value?.videoProvider ?? VideoProvider.LEGACY,
    videoId: value?.videoId ?? '',
    videoUrl: value?.videoUrl ?? '',
    videoDurationSecs: value?.videoDurationSecs ?? '',
    liveUrl: value?.liveUrl ?? '',
    scheduledAt: value?.scheduledAt ?? '',
    recordingUrl: value?.recordingUrl ?? '',
    unlockMinutesBefore: value?.unlockMinutesBefore ?? '10',
    durationMinutes: value?.durationMinutes ?? '',
    isFree: value?.isFree ?? false,
    isPublished: value?.isPublished ?? true,
  };
}

export default function LessonFieldsForm({
  initialValue,
  submitLabel,
  isSaving,
  onSubmit,
  onCancel,
  onFetchBunnyDuration,
}: LessonFieldsFormProps) {
  const [formValue, setFormValue] = React.useState<LessonFormValue>(() => getDefaultValue(initialValue));
  const [isFetchingDuration, setIsFetchingDuration] = React.useState(false);

  React.useEffect(() => {
    setFormValue(getDefaultValue(initialValue));
  }, [initialValue]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = event.target;
    const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
    setFormValue((current) => ({
      ...current,
      [target.name]: value,
    }));
  };

  const handleFetchBunnyDuration = async () => {
    if (!onFetchBunnyDuration || !formValue.videoId.trim()) {
      return;
    }

    setIsFetchingDuration(true);
    try {
      const duration = await onFetchBunnyDuration(formValue.videoId.trim());
      if (duration !== null) {
        setFormValue((current) => ({
          ...current,
          videoDurationSecs: String(duration),
        }));
      }
    } finally {
      setIsFetchingDuration(false);
    }
  };

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(formValue);
      }}
      className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-title">
            Título
          </label>
          <input
            id="lesson-title"
            name="title"
            value={formValue.title}
            onChange={handleChange}
            required
            disabled={isSaving}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-type">
            Tipo
          </label>
          <select
            id="lesson-type"
            name="type"
            value={formValue.type}
            onChange={handleChange}
            disabled={isSaving}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
          >
            {Object.values(LessonType).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-duration">
            Duración estimada (min)
          </label>
          <input
            id="lesson-duration"
            name="durationMinutes"
            type="number"
            min="0"
            value={formValue.durationMinutes}
            onChange={handleChange}
            disabled={isSaving}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-description">
            Descripción
          </label>
          <textarea
            id="lesson-description"
            name="description"
            rows={4}
            value={formValue.description}
            onChange={handleChange}
            disabled={isSaving}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {formValue.type === LessonType.RECORDED && (
          <>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-video-provider">
                Video provider
              </label>
              <select
                id="lesson-video-provider"
                name="videoProvider"
                value={formValue.videoProvider}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              >
                {Object.values(VideoProvider).map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-video-id">
                Video ID
              </label>
              <input
                id="lesson-video-id"
                name="videoId"
                value={formValue.videoId}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-video-url">
                Video URL (fallback / legacy)
              </label>
              <input
                id="lesson-video-url"
                name="videoUrl"
                value={formValue.videoUrl}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-video-duration">
                Duración exacta (seg)
              </label>
              <input
                id="lesson-video-duration"
                name="videoDurationSecs"
                type="number"
                min="0"
                value={formValue.videoDurationSecs}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-end">
              {formValue.videoProvider === VideoProvider.BUNNY ? (
                <button
                  type="button"
                  onClick={handleFetchBunnyDuration}
                  disabled={isSaving || isFetchingDuration || !formValue.videoId.trim()}
                  className="w-full rounded-xl border border-teal-200 bg-white px-4 py-3 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isFetchingDuration ? 'Consultando Bunny...' : 'Obtener duración desde Bunny'}
                </button>
              ) : (
                <div className="w-full rounded-xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">
                  La duración automática se habilita solo con `BUNNY`.
                </div>
              )}
            </div>
          </>
        )}

        {formValue.type === LessonType.LIVE && (
          <>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-live-url">
                Live URL
              </label>
              <input
                id="lesson-live-url"
                name="liveUrl"
                value={formValue.liveUrl}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-scheduled-at">
                Fecha programada
              </label>
              <input
                id="lesson-scheduled-at"
                name="scheduledAt"
                type="datetime-local"
                value={formValue.scheduledAt}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-unlock-before">
                Minutos antes del vivo
              </label>
              <input
                id="lesson-unlock-before"
                name="unlockMinutesBefore"
                type="number"
                min="0"
                value={formValue.unlockMinutesBefore}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="lesson-recording-url">
                Recording URL
              </label>
              <input
                id="lesson-recording-url"
                name="recordingUrl"
                value={formValue.recordingUrl}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </>
        )}

        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <input
            id="lesson-is-free"
            name="isFree"
            type="checkbox"
            checked={formValue.isFree}
            onChange={handleChange}
            disabled={isSaving}
            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <label className="text-sm font-medium text-gray-700" htmlFor="lesson-is-free">
            Lección gratuita
          </label>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <input
            id="lesson-is-published"
            name="isPublished"
            type="checkbox"
            checked={formValue.isPublished}
            onChange={handleChange}
            disabled={isSaving}
            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <label className="text-sm font-medium text-gray-700" htmlFor="lesson-is-published">
            Publicada
          </label>
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

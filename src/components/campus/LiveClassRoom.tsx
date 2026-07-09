'use client';

import React, { useEffect, useState } from 'react';
import Countdown from '../Countdown';
import { LessonWithStatus } from '@/lib/campus/types';
import { useCurrency } from '@/context/CurrencyContext';
import { formatInTimezone } from '@/lib/timezone';

interface LiveClassRoomProps {
  lesson: LessonWithStatus;
}

export default function LiveClassRoom({ lesson }: LiveClassRoomProps) {
  // Usar datos de la sesión por comisión si están disponibles, sino fallback legacy
  const hasResolvedSession = !!lesson.resolvedLiveSession;
  const effectiveScheduledAt = hasResolvedSession
    ? lesson.resolvedLiveSession!.startDateTime
    : (lesson.scheduledAt as string | null);
  const effectiveLiveUrl = hasResolvedSession
    ? (lesson.resolvedLiveSession!.liveUrl ?? null)
    : lesson.liveUrl;
  const effectiveRecordingUrl = hasResolvedSession
    ? (lesson.resolvedLiveSession!.recordingUrl ?? null)
    : lesson.recordingUrl;
  const scheduleOptionName = hasResolvedSession
    ? lesson.resolvedLiveSession!.scheduleOptionName
    : null;

  const [isRoomUnlocked, setIsRoomUnlocked] = useState(false);

  useEffect(() => {
    if (!effectiveScheduledAt) {
      setIsRoomUnlocked(true);
      return;
    }

    const scheduledTime = new Date(effectiveScheduledAt).getTime();
    const minutesBefore = lesson.unlockMinutesBefore ?? 10;
    const unlockTime = scheduledTime - minutesBefore * 60 * 1000;

    const checkUnlockTime = () => {
      const now = Date.now();
      setIsRoomUnlocked(now >= unlockTime);
    };

    checkUnlockTime();
    const interval = setInterval(checkUnlockTime, 10000);

    return () => clearInterval(interval);
  }, [effectiveScheduledAt, lesson.unlockMinutesBefore]);

  const { country } = useCurrency();
  const timezone = country?.timezone || 'America/Argentina/Buenos_Aires';

  const liveUrl = effectiveLiveUrl || null;
  const scheduledDateLabel = effectiveScheduledAt
    ? formatInTimezone(effectiveScheduledAt, timezone, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // Si tiene sesión por comisión pero sin liveUrl cargado aún
  const sessionNotConfigured = hasResolvedSession && !liveUrl;

  return (
    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 shadow-sm flex flex-col items-center justify-center min-h-[280px] text-center space-y-6 text-slate-900 dark:text-slate-100">
      <div className="space-y-3">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-500/15 uppercase tracking-wider animate-pulse">
          Clase en vivo programada
        </span>
        {scheduleOptionName && (
          <p className="text-xs font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/15 rounded-full px-3 py-1 inline-block">
            Tu horario: {scheduleOptionName}
          </p>
        )}
        {scheduledDateLabel && (
          <h2 className="text-sm text-slate-600 dark:text-slate-300 font-bold leading-relaxed">
            Próxima sesión: {scheduledDateLabel}
          </h2>
        )}
      </div>

      {effectiveScheduledAt && !isRoomUnlocked && (
        <div className="w-full max-w-sm space-y-4">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
            La sala abrirá en:
          </p>
          <Countdown targetDate={effectiveScheduledAt} />
        </div>
      )}

      <div className="space-y-4 w-full max-w-sm">
        {sessionNotConfigured ? (
          <div className="text-center space-y-2">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-350">
              El link de tu clase todavía no fue cargado.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Será visible aquí cuando tu tutor lo configure.
            </p>
          </div>
        ) : isRoomUnlocked && liveUrl ? (
          <>
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">La sala ya está habilitada</h3>
              <p className="text-xs text-slate-500 dark:text-slate-450">Ingresá ahora para unirte a la transmisión interactiva.</p>
            </div>
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center block py-3.5 px-6 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-amber-500/10 active:scale-[0.98] cursor-pointer"
            >
              Unirse a la Clase en Vivo
            </a>
            {effectiveRecordingUrl && (
              <a
                href={effectiveRecordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-center block py-3 px-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-all"
              >
                Ver grabación anterior
              </a>
            )}
          </>
        ) : liveUrl ? (
          <>
            <button
              disabled
              className="w-full text-center block py-3.5 px-6 bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-600 font-bold text-xs rounded-xl cursor-not-allowed border border-slate-200/50 dark:border-slate-800/60"
            >
              Ingresar a la sala (Inactivo)
            </button>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
              * El botón de acceso se habilitará automáticamente {lesson.unlockMinutesBefore || 10} minutos antes de iniciar.
            </p>
          </>
        ) : (
          <div className="text-center">
            <button
              disabled
              className="w-full text-center block py-3.5 px-6 bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-600 font-bold text-xs rounded-xl cursor-not-allowed border border-slate-200/50 dark:border-slate-800/60"
            >
              Ingresar a la sala (Inactivo)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

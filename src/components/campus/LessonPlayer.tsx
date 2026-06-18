'use client';

import React, { useEffect, useRef, useState } from 'react';
import { LessonWithStatus } from '@/lib/campus/types';
import { useSessionHeartbeat } from '@/lib/useSessionHeartbeat';

interface LessonPlayerProps {
  lesson: LessonWithStatus;
  onLessonCompleted: (lessonId: string) => void;
}

export default function LessonPlayer({
  lesson,
  onLessonCompleted,
}: LessonPlayerProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useSessionHeartbeat({
    onInvalidSession: () => {
      try {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage('{"command":"pause"}', '*');
          iframeRef.current.contentWindow.postMessage('{"event":"pause"}', '*');
          iframeRef.current.contentWindow.postMessage(JSON.stringify({ method: 'pause' }), '*');
          iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo' }), '*');
        }
      } catch (e) {
        console.error('Error al pausar video en invalidación de sesión:', e);
      }
    }
  });

  const hasTriggeredCompletion = useRef(false);
  const lastSavedSeconds = useRef(0);
  const lastRequestTime = useRef(0);
  const isSavingProgress = useRef(false);
  const activeLessonIdRef = useRef(lesson.id);

  useEffect(() => {
    activeLessonIdRef.current = lesson.id;
    hasTriggeredCompletion.current = false;
    lastSavedSeconds.current = 0;
    lastRequestTime.current = 0;
    isSavingProgress.current = false;

    const url = lesson.videoProvider === 'BUNNY' ? lesson.signedVideoUrl || null : lesson.videoUrl;
    setVideoUrl(url);
  }, [lesson.id, lesson.signedVideoUrl, lesson.videoProvider, lesson.videoUrl]);

  useEffect(() => {
    const handlePlayerMessages = async (event: MessageEvent) => {
      if (!event.origin.includes('mediadelivery.net') && !event.origin.includes('bunnycdn.com')) {
        return;
      }

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data || !data.event) return;

        if (activeLessonIdRef.current !== lesson.id) return;

        if (data.event === 'timeupdate') {
          const currentTime = data.data?.currentTime || data.value?.currentTime || 0;
          const duration = data.data?.duration || data.value?.duration || 0;

          if (duration > 0 && !hasTriggeredCompletion.current) {
            const progressPercent = (currentTime / duration) * 100;
            const nowWallClock = Date.now();
            const timeSinceLastRequest = nowWallClock - lastRequestTime.current;

            if (
              Math.abs(currentTime - lastSavedSeconds.current) >= 10 &&
              timeSinceLastRequest >= 5000 &&
              !isSavingProgress.current
            ) {
              isSavingProgress.current = true;
              lastSavedSeconds.current = currentTime;
              lastRequestTime.current = nowWallClock;

              fetch('/api/campus/progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  lessonId: lesson.id,
                  watchedSeconds: Math.round(currentTime),
                }),
              })
                .catch(() => {})
                .finally(() => {
                  isSavingProgress.current = false;
                });
            }

            if (progressPercent >= 90 && lesson.status !== 'completed') {
              hasTriggeredCompletion.current = true;
              void triggerCompletion();
            }
          }
        }

        if (data.event === 'ended' && !hasTriggeredCompletion.current && lesson.status !== 'completed') {
          hasTriggeredCompletion.current = true;
          void triggerCompletion();
        }
      } catch {
        // Ignorar mensajes ajenos al player.
      }
    };

    window.addEventListener('message', handlePlayerMessages);
    return () => {
      window.removeEventListener('message', handlePlayerMessages);
    };
  }, [lesson.id, lesson.status]);

  const triggerCompletion = async () => {
    if (isCompleting || lesson.status === 'completed') return;

    setIsCompleting(true);
    try {
      const response = await fetch('/api/campus/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        await onLessonCompleted(lesson.id);
      } else {
        hasTriggeredCompletion.current = false;
        console.error('No se pudo autocompletar la leccion:', data.error || 'Respuesta invalida');
      }
    } catch (error) {
      console.error('Error al autocompletar leccion:', error);
      hasTriggeredCompletion.current = false;
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="w-full">
      {videoUrl ? (
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-lg border border-slate-200">
          <iframe
            ref={iframeRef}
            src={videoUrl}
            title={lesson.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-none"
          />
        </div>
      ) : (
        <div className="aspect-video w-full rounded-2xl bg-white border border-slate-200 flex flex-col items-center justify-center text-center p-6 space-y-4 shadow-sm">
          <div className="h-12 w-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center border border-slate-100 shadow-inner">
            <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 text-sm">Clase disponible proximamente</h3>
            <p className="text-xs text-slate-500 max-w-sm">Proximamente estara disponible el video explicativo de esta sesion.</p>
          </div>
        </div>
      )}
    </div>
  );
}

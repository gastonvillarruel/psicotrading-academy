import { Module, Lesson, LessonProgress } from '@prisma/client';
import { LessonStatus, LessonWithStatus, ModuleWithProgress } from './types';

import { generateBunnySignedUrl } from '@/lib/bunny';

interface ModuleWithLessonsAndProgress extends Module {
  lessons: (Lesson & { progress?: LessonProgress | null })[];
  totalLessons: number;
  completedLessons: number;
  percent: number;
}

/**
 * Determina el estado de desbloqueo de cada módulo y lección para un usuario.
 * Aplica las reglas de UnlockMode (free / progressive) y restricciones de lecciones LIVE.
 */
export function computeUnlockStatus(
  unlockMode: 'free' | 'progressive',
  modules: ModuleWithLessonsAndProgress[]
): ModuleWithProgress[] {
  // 1. Ordenar módulos por sortOrder y fecha de creación
  const sortedModules = [...modules].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const now = Date.now();
  const computedModules: ModuleWithProgress[] = [];
  let previousModuleCompleted = true; // El primer módulo siempre se desbloquea

  for (let i = 0; i < sortedModules.length; i++) {
    const mod = sortedModules[i];
    
    // Determinar si este módulo está desbloqueado
    let isUnlocked = false;
    if (unlockMode === 'free') {
      isUnlocked = true;
    } else {
      // progressive mode
      if (i === 0) {
        isUnlocked = true;
      } else {
        // Un módulo se desbloquea si el anterior está completado (100% de progreso)
        // o si este módulo específico no requiere que el anterior esté completo
        isUnlocked = previousModuleCompleted || !mod.requiredPrevious;
      }
    }

    // Procesar las lecciones del módulo
    const computedLessons = mod.lessons.map((lesson): LessonWithStatus => {
      const progress = lesson.progress || null;
      const isCompleted = !!(progress && progress.completedAt);
      
      let status: LessonStatus = 'locked';

      if (!isUnlocked) {
        status = 'locked';
      } else if (isCompleted) {
        status = 'completed';
      } else {
        // Lógica específica para lecciones LIVE
        if (lesson.type === 'LIVE') {
          if (lesson.recordingUrl) {
            // Si ya tiene grabación subida, está disponible
            status = 'available';
          } else if (lesson.scheduledAt) {
            const scheduledTime = new Date(lesson.scheduledAt).getTime();
            const minutesBefore = lesson.unlockMinutesBefore ?? 10;
            const unlockTime = scheduledTime - minutesBefore * 60 * 1000;

            if (now >= unlockTime) {
              status = 'available';
            } else {
              status = 'locked';
            }
          } else {
            // Si es en vivo pero no tiene fecha ni grabación, por defecto disponible
            status = 'available';
          }
        } else {
          // RECORDED, TEXT, RESOURCE están disponibles por defecto si el módulo está desbloqueado
          status = 'available';
        }
      }

      let signedVideoUrl: string | null = null;
      const isAvailableForViewing = status === 'available' || status === 'completed';
      if (isAvailableForViewing && lesson.videoProvider === 'BUNNY' && lesson.videoId) {
        signedVideoUrl = generateBunnySignedUrl(lesson.videoId);
      }

      return {
        ...lesson,
        unlockMinutesBefore: lesson.unlockMinutesBefore ?? 10,
        status,
        progress,
        signedVideoUrl,
      };
    });

    // Calcular progreso real de este módulo (solo cuenta lecciones publicadas)
    const publishedLessons = computedLessons.filter((l) => l.isPublished);
    const totalLessons = publishedLessons.length;
    const completedLessons = publishedLessons.filter((l) => l.status === 'completed').length;
    const percent = totalLessons === 0 ? 100 : Math.round((completedLessons / totalLessons) * 100);

    // Actualizar el estado para el siguiente módulo en la iteración progressive
    // El módulo anterior se considera completado si su progreso es 100%
    // Y además el módulo anterior estaba desbloqueado
    previousModuleCompleted = isUnlocked && percent === 100;

    computedModules.push({
      ...mod,
      lessons: computedLessons,
      totalLessons,
      completedLessons,
      percent,
      isUnlocked,
    });
  }

  return computedModules;
}

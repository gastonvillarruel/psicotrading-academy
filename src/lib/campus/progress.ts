import { db } from '@/lib/db';
import { LessonProgress } from '@prisma/client';

/**
 * Obtiene un mapa con el progreso de las lecciones especificadas para un usuario.
 */
export async function getLessonProgressMap(
  userId: string,
  lessonIds: string[]
): Promise<Map<string, LessonProgress>> {
  if (lessonIds.length === 0) return new Map();

  const progressList = await db.lessonProgress.findMany({
    where: {
      userId,
      lessonId: { in: lessonIds },
    },
  });

  const map = new Map<string, LessonProgress>();
  for (const p of progressList) {
    map.set(p.lessonId, p);
  }
  return map;
}

/**
 * Marca una lección como completada de forma monotónica. No se puede desmarcar.
 */
export async function markLessonComplete(
  userId: string,
  lessonId: string
): Promise<LessonProgress> {
  const existing = await db.lessonProgress.findUnique({
    where: {
      userId_lessonId: {
        userId,
        lessonId,
      },
    },
  });

  if (existing && existing.completedAt) {
    return existing;
  }

  return db.lessonProgress.upsert({
    where: {
      userId_lessonId: {
        userId,
        lessonId,
      },
    },
    update: {
      completedAt: new Date(),
    },
    create: {
      userId,
      lessonId,
      completedAt: new Date(),
    },
  });
}

/**
 * Permite desmarcar el progreso de una lección (reservado para uso administrativo).
 */
export async function adminUnmarkLessonComplete(
  userId: string,
  lessonId: string
): Promise<void> {
  try {
    await db.lessonProgress.delete({
      where: {
        userId_lessonId: {
          userId,
          lessonId,
        },
      },
    });
  } catch (error) {
    // Si no existe, ignorar
  }
}

/**
 * Obtiene estadísticas de progreso para un módulo específico.
 * Solo cuenta lecciones publicadas (isPublished = true).
 */
export async function getModuleProgressStats(
  userId: string,
  moduleId: string
): Promise<{ totalLessons: number; completedLessons: number; percent: number }> {
  const lessons = await db.lesson.findMany({
    where: {
      moduleId,
      isPublished: true,
    },
    select: {
      id: true,
    },
  });

  const totalLessons = lessons.length;
  if (totalLessons === 0) {
    return { totalLessons: 0, completedLessons: 0, percent: 100 };
  }

  const lessonIds = lessons.map((l) => l.id);
  const completedCount = await db.lessonProgress.count({
    where: {
      userId,
      lessonId: { in: lessonIds },
      completedAt: { not: null },
    },
  });

  const percent = Math.round((completedCount / totalLessons) * 100);
  return {
    totalLessons,
    completedLessons: completedCount,
    percent,
  };
}

/**
 * Obtiene estadísticas de progreso para todo un curso.
 * Solo cuenta lecciones publicadas en módulos del curso.
 */
export async function getCourseProgressStats(
  userId: string,
  courseId: string
): Promise<{ totalLessons: number; completedLessons: number; percent: number }> {
  // Obtener todas las lecciones publicadas de los módulos de este curso
  const lessons = await db.lesson.findMany({
    where: {
      module: {
        courseId,
      },
      isPublished: true,
    },
    select: {
      id: true,
    },
  });

  const totalLessons = lessons.length;
  if (totalLessons === 0) {
    return { totalLessons: 0, completedLessons: 0, percent: 100 };
  }

  const lessonIds = lessons.map((l) => l.id);
  const completedCount = await db.lessonProgress.count({
    where: {
      userId,
      lessonId: { in: lessonIds },
      completedAt: { not: null },
    },
  });

  const percent = Math.round((completedCount / totalLessons) * 100);
  return {
    totalLessons,
    completedLessons: completedCount,
    percent,
  };
}

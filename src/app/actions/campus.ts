'use server';

import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { verifyStudentAccess, getStudentCoursesAndSubscription } from '@/lib/campus/access';
import { markLessonComplete, getCourseProgressStats } from '@/lib/campus/progress';
import { computeUnlockStatus } from '@/lib/campus/unlock';
import { ModuleWithProgress } from '@/lib/campus/types';
import { checkAndIssueCertificate, getCertificate } from '@/lib/campus/certificates';

function serializeCampusCourse<T extends { priceUSDT?: unknown; originalPriceUSDT?: unknown }>(course: T): T {
  return JSON.parse(
    JSON.stringify({
      ...course,
      priceUSDT: course.priceUSDT !== null && course.priceUSDT !== undefined ? Number(course.priceUSDT) : null,
      originalPriceUSDT:
        course.originalPriceUSDT !== null && course.originalPriceUSDT !== undefined
          ? Number(course.originalPriceUSDT)
          : null,
    })
  ) as T;
}

/**
 * Marca una lección como completada y evalúa la emisión de un certificado.
 */
export async function toggleLessonComplete(lessonId: string, watchedSeconds?: number) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return { success: false, error: 'No autorizado' };
    }

    const userId = session.user.id;

    // Buscar lección y su módulo para obtener courseId
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          select: {
            courseId: true,
            course: {
              select: {
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!lesson) {
      return { success: false, error: 'Lección no encontrada' };
    }

    const courseId = lesson.module.courseId;
    const courseSlug = lesson.module.course.slug;

    // Verificar si el alumno tiene acceso al curso
    const hasAccess = await verifyStudentAccess(userId, courseId, session.user.role);
    if (!hasAccess) {
      return { success: false, error: 'No tienes acceso a este curso' };
    }

    // Verificar si la lección está desbloqueada para el usuario
    const courseData = await getCampusCourseData(courseSlug);
    if (!courseData.success || !courseData.course) {
      return { success: false, error: 'No se pudo verificar el estado del curso' };
    }

    let targetLessonComputed = null;
    if (!courseData.legacyMode && courseData.course.modules) {
      for (const mod of courseData.course.modules) {
        const found = mod.lessons.find((l) => l.id === lessonId);
        if (found) {
          targetLessonComputed = found;
          break;
        }
      }
      if (!targetLessonComputed || targetLessonComputed.status === 'locked') {
        return { success: false, error: 'Esta lección se encuentra bloqueada actualmente.' };
      }
    }

    // Marcar como completada (monotónico) o actualizar watchedSeconds
    if (watchedSeconds !== undefined) {
      await db.lessonProgress.upsert({
        where: {
          userId_lessonId: { userId, lessonId },
        },
        update: {
          watchedSeconds,
        },
        create: {
          userId,
          lessonId,
          watchedSeconds,
        },
      });
    } else {
      await markLessonComplete(userId, lessonId);
    }

    // Evaluar y emitir certificado si completó el 100%
    const certificate = await checkAndIssueCertificate(userId, courseId);

    // Revalidar el path del curso y del campus
    revalidatePath(`/mi-campus/${courseSlug}`);
    revalidatePath('/mi-campus');

    return {
      success: true,
      certificateIssued: !!certificate,
      certificateCode: certificate?.certificateCode || null,
    };
  } catch (error: any) {
    console.error('Error en toggleLessonComplete:', error);
    return { success: false, error: error.message || 'Error al actualizar progreso.' };
  }
}

/**
 * Obtiene los datos completos de un curso estructurado para el campus.
 */
export async function getCampusCourseData(courseSlug: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return { success: false, error: 'No autorizado', hasAccess: false };
    }

    const userId = session.user.id;

    // Buscar el curso con sus módulos y lecciones
    const course = await db.course.findUnique({
      where: { slug: courseSlug },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' },
              include: {
                progress: {
                  where: { userId },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      return { success: false, error: 'Curso no encontrado', hasAccess: false };
    }

    // Verificar si el alumno tiene acceso
    const hasAccess = await verifyStudentAccess(userId, course.id, session.user.role);
    if (!hasAccess) {
      return { success: false, error: 'No tienes acceso a este curso', hasAccess: false };
    }

    // Comprobar si el curso está en modo legacy (sin módulos o sin lecciones publicadas)
    const activeModules = course.modules.map(mod => ({
      ...mod,
      lessons: mod.lessons.filter(l => l.isPublished),
    }));

    const totalPublishedLessons = activeModules.reduce((acc, mod) => acc + mod.lessons.length, 0);
    const legacyMode = totalPublishedLessons === 0;

    let computedModules: ModuleWithProgress[] = [];
    let progressStats = { totalLessons: 0, completedLessons: 0, percent: 0 };
    let certificate = null;

    if (!legacyMode) {
      // Formatear la relación de progreso singular para que coincida con el tipo esperado en unlock.ts
      const modulesWithFlatProgress = activeModules.map(mod => ({
        ...mod,
        lessons: mod.lessons.map(l => ({
          ...l,
          progress: l.progress[0] || null,
        })),
        totalLessons: 0,
        completedLessons: 0,
        percent: 0,
      }));

      // Calcular el desbloqueo progresivo
      computedModules = computeUnlockStatus(course.unlockMode, modulesWithFlatProgress);

      // Calcular progreso del curso
      progressStats = await getCourseProgressStats(userId, course.id);

      // Obtener certificado si existe
      certificate = await getCertificate(userId, course.id);
    }

    return {
      success: true,
      hasAccess: true,
      legacyMode,
      course: serializeCampusCourse({
        ...course,
        modules: computedModules,
        ...progressStats,
        certificate,
      }),
    };
  } catch (error: any) {
    console.error('Error en getCampusCourseData:', error);
    return { success: false, error: error.message || 'Error al cargar el curso.', hasAccess: false };
  }
}

/**
 * Obtiene los cursos del alumno con su respectivo progreso para el dashboard.
 */
export async function getCampusDashboardData() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return { success: false, error: 'No autorizado' };
    }

    const userId = session.user.id;

    // Obtener los cursos del alumno y su suscripción activa
    const { courses, subscription } = await getStudentCoursesAndSubscription(userId);

    // Enriquecer cada curso con su progreso y estado
    const coursesWithProgress = await Promise.all(
      courses.map(async (course) => {
        // Contar lecciones publicadas
        const lessons = await db.lesson.findMany({
          where: {
            module: { courseId: course.id },
            isPublished: true,
          },
          select: { id: true },
        });

        const totalLessons = lessons.length;
        const legacyMode = totalLessons === 0;

        if (legacyMode) {
          return serializeCampusCourse({
            ...course,
            legacyMode: true,
            totalLessons: 0,
            completedLessons: 0,
            percent: 0,
            certificate: null,
          });
        }

        const stats = await getCourseProgressStats(userId, course.id);
        const cert = await getCertificate(userId, course.id);

        return serializeCampusCourse({
          ...course,
          legacyMode: false,
          ...stats,
          certificate: cert,
        });
      })
    );

    return {
      success: true,
      courses: coursesWithProgress,
      subscription,
    };
  } catch (error: any) {
    console.error('Error en getCampusDashboardData:', error);
    return { success: false, error: error.message || 'Error al cargar el panel.' };
  }
}

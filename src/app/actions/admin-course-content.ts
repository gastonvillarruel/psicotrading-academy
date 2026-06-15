'use server';

import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { getBunnyVideoDuration } from '@/lib/bunny';
import type { AdminLessonContent, AdminModuleContent } from '@/types/admin-course-content';
import { LessonType, UnlockMode, VideoProvider } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  },
  z.string().nullable().optional()
);

const optionalUrlString = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    let trimmed = value.trim();
    if (trimmed === '') return null;
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }
    return trimmed;
  },
  z.string().url('Ingresá una URL válida.').nullable().optional()
);

const optionalInt = z.preprocess(
  (value) => {
    if (value === '' || value === null || value === undefined) return null;
    return value;
  },
  z.coerce.number().int().nonnegative().nullable().optional()
);

const optionalDateTimeString = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  },
  z.string().nullable().optional()
);

const campusSettingsSchema = z.object({
  unlockMode: z.nativeEnum(UnlockMode),
});

const moduleSchema = z.object({
  title: z.string().trim().min(1, 'El título del módulo es requerido.'),
  description: optionalTrimmedString,
  requiredPrevious: z.boolean().default(true),
});

const lessonSchema = z.object({
  title: z.string().trim().min(1, 'El título de la lección es requerido.'),
  description: optionalTrimmedString,
  type: z.nativeEnum(LessonType),
  videoProvider: z.nativeEnum(VideoProvider),
  videoId: optionalTrimmedString,
  videoUrl: optionalUrlString,
  videoDurationSecs: optionalInt,
  liveUrl: optionalUrlString,
  scheduledAt: optionalDateTimeString,
  recordingUrl: optionalUrlString,
  unlockMinutesBefore: optionalInt,
  durationMinutes: optionalInt,
  isFree: z.boolean().default(false),
  isPublished: z.boolean().default(true),
});

function ensureDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('La fecha programada no tiene un formato válido.');
  }
  return date;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('No autorizado.');
  }
  return session;
}

function serializeLesson(lesson: {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  type: LessonType;
  videoProvider: VideoProvider;
  videoId: string | null;
  videoUrl: string | null;
  liveUrl: string | null;
  recordingUrl: string | null;
  scheduledAt: Date | null;
  unlockMinutesBefore: number | null;
  durationMinutes: number | null;
  videoDurationSecs: number | null;
  sortOrder: number;
  isFree: boolean;
  isPublished: boolean;
  _count?: { progress: number };
  liveSessions?: any[];
}): AdminLessonContent {
  const progressCount = lesson._count?.progress ?? 0;
  return {
    id: lesson.id,
    moduleId: lesson.moduleId,
    title: lesson.title,
    description: lesson.description,
    type: lesson.type,
    videoProvider: lesson.videoProvider,
    videoId: lesson.videoId,
    videoUrl: lesson.videoUrl,
    liveUrl: lesson.liveUrl,
    recordingUrl: lesson.recordingUrl,
    scheduledAt: lesson.scheduledAt ? lesson.scheduledAt.toISOString() : null,
    unlockMinutesBefore: lesson.unlockMinutesBefore,
    durationMinutes: lesson.durationMinutes,
    videoDurationSecs: lesson.videoDurationSecs,
    sortOrder: lesson.sortOrder,
    isFree: lesson.isFree,
    isPublished: lesson.isPublished,
    hasProgress: progressCount > 0,
    progressCount,
    liveSessions: lesson.liveSessions?.map((session: any) => ({
      id: session.id,
      lessonId: session.lessonId,
      scheduleOptionId: session.scheduleOptionId,
      scheduleOptionName: session.scheduleOption?.name || '',
      startDateTime: session.startDateTime.toISOString(),
      endDateTime: session.endDateTime ? session.endDateTime.toISOString() : null,
      liveUrl: session.liveUrl,
      recordingUrl: session.recordingUrl,
    })) ?? [],
  };
}

function serializeModule(module: {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  requiredPrevious: boolean;
  lessons: Array<{
    id: string;
    moduleId: string;
    title: string;
    description: string | null;
    type: LessonType;
    videoProvider: VideoProvider;
    videoId: string | null;
    videoUrl: string | null;
    liveUrl: string | null;
    recordingUrl: string | null;
    scheduledAt: Date | null;
    unlockMinutesBefore: number | null;
    durationMinutes: number | null;
    videoDurationSecs: number | null;
    sortOrder: number;
    isFree: boolean;
    isPublished: boolean;
    _count?: { progress: number };
  }>;
}): AdminModuleContent {
  const lessons = module.lessons
    .map(serializeLesson)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: module.id,
    courseId: module.courseId,
    title: module.title,
    description: module.description,
    sortOrder: module.sortOrder,
    requiredPrevious: module.requiredPrevious,
    hasProgress: lessons.some((lesson) => lesson.hasProgress),
    lessonCount: lessons.length,
    publishedLessonCount: lessons.filter((lesson) => lesson.isPublished).length,
    lessons,
  };
}

async function revalidateCoursePaths(courseId: string, courseSlug: string) {
  revalidatePath('/admin/courses');
  revalidatePath(`/admin/courses/${courseId}/edit`);
  revalidatePath('/mi-campus');
  revalidatePath(`/mi-campus/${courseSlug}`);
  revalidatePath(`/campus/${courseSlug}`);
}

async function resolveCourseContextFromModule(moduleId: string) {
  const module = await db.module.findUnique({
    where: { id: moduleId },
    select: {
      id: true,
      courseId: true,
      course: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!module) {
    throw new Error('Módulo no encontrado.');
  }

  return {
    courseId: module.courseId,
    courseSlug: module.course.slug,
  };
}

async function resolveCourseContextFromLesson(lessonId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      moduleId: true,
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
    throw new Error('Lección no encontrada.');
  }

  return {
    moduleId: lesson.moduleId,
    courseId: lesson.module.courseId,
    courseSlug: lesson.module.course.slug,
  };
}

async function maybeResolveBunnyDuration(input: z.infer<typeof lessonSchema>) {
  if (input.videoProvider !== VideoProvider.BUNNY || !input.videoId || input.videoDurationSecs) {
    return input.videoDurationSecs ?? null;
  }

  return await getBunnyVideoDuration(input.videoId);
}

export async function updateCourseCampusSettings(courseId: string, input: z.input<typeof campusSettingsSchema>) {
  try {
    await requireAdmin();
    const validated = campusSettingsSchema.parse(input);

    const course = await db.course.update({
      where: { id: courseId },
      data: {
        unlockMode: validated.unlockMode,
      },
      select: {
        id: true,
        slug: true,
        unlockMode: true,
      },
    });

    await revalidateCoursePaths(course.id, course.slug);
    return { success: true, unlockMode: course.unlockMode };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al actualizar la configuración del campus.' };
  }
}

export async function createCourseModule(courseId: string, input: z.input<typeof moduleSchema>) {
  try {
    await requireAdmin();
    const validated = moduleSchema.parse(input);

    const course = await db.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        slug: true,
        _count: {
          select: { modules: true },
        },
      },
    });

    if (!course) {
      throw new Error('Curso no encontrado.');
    }

    const module = await db.module.create({
      data: {
        courseId,
        title: validated.title,
        description: validated.description ?? null,
        requiredPrevious: validated.requiredPrevious,
        sortOrder: course._count.modules + 1,
      },
      include: {
        lessons: {
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: {
              select: { progress: true },
            },
          },
        },
      },
    });

    await revalidateCoursePaths(course.id, course.slug);
    return { success: true, module: serializeModule(module) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al crear el módulo.' };
  }
}

export async function updateCourseModule(moduleId: string, input: z.input<typeof moduleSchema>) {
  try {
    await requireAdmin();
    const validated = moduleSchema.parse(input);
    const context = await resolveCourseContextFromModule(moduleId);

    const module = await db.module.update({
      where: { id: moduleId },
      data: {
        title: validated.title,
        description: validated.description ?? null,
        requiredPrevious: validated.requiredPrevious,
      },
      include: {
        lessons: {
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: {
              select: { progress: true },
            },
          },
        },
      },
    });

    await revalidateCoursePaths(context.courseId, context.courseSlug);
    return { success: true, module: serializeModule(module) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al actualizar el módulo.' };
  }
}

export async function deleteCourseModule(moduleId: string) {
  try {
    await requireAdmin();
    const context = await resolveCourseContextFromModule(moduleId);

    const course = await db.course.findUnique({
      where: { id: context.courseId },
      select: { campusContentLocked: true },
    });

    if (course?.campusContentLocked) {
      return {
        success: false,
        error: 'La estructura está bloqueada para proteger el progreso de los alumnos.',
      };
    }

    await db.module.delete({
      where: { id: moduleId },
    });

    await revalidateCoursePaths(context.courseId, context.courseSlug);
    return { success: true, moduleId };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al eliminar el módulo.' };
  }
}

export async function reorderCourseModules(courseId: string, orderedModuleIds: string[]) {
  try {
    await requireAdmin();

    const course = await db.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        slug: true,
        campusContentLocked: true,
        modules: {
          select: { id: true },
        },
      },
    });

    if (!course) {
      throw new Error('Curso no encontrado.');
    }

    if (course.campusContentLocked) {
      return {
        success: false,
        error: 'La estructura está bloqueada para proteger el progreso de los alumnos.',
      };
    }

    const existingIds = course.modules.map((module) => module.id).sort();
    const requestedIds = [...orderedModuleIds].sort();

    if (existingIds.length !== requestedIds.length || existingIds.some((id, index) => id !== requestedIds[index])) {
      throw new Error('El orden de módulos es inválido para este curso.');
    }

    await db.$transaction(
      orderedModuleIds.map((moduleId, index) =>
        db.module.update({
          where: { id: moduleId },
          data: { sortOrder: index + 1 },
        })
      )
    );

    await revalidateCoursePaths(course.id, course.slug);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al reordenar los módulos.' };
  }
}

export async function createModuleLesson(moduleId: string, input: z.input<typeof lessonSchema>) {
  try {
    await requireAdmin();
    const validated = lessonSchema.parse(input);
    const context = await resolveCourseContextFromModule(moduleId);

    const activeOptionsCount = await db.courseScheduleOption.count({
      where: { courseId: context.courseId, isActive: true },
    });
    const hasActiveComissions = activeOptionsCount > 0;

    const lessonCount = await db.lesson.count({
      where: { moduleId },
    });

    const videoDurationSecs = await maybeResolveBunnyDuration(validated);

    const lesson = await db.lesson.create({
      data: {
        moduleId,
        title: validated.title,
        description: validated.description ?? null,
        type: validated.type,
        videoProvider: validated.videoProvider,
        videoId: validated.videoId ?? null,
        videoUrl: validated.videoUrl ?? null,
        liveUrl: hasActiveComissions ? null : (validated.liveUrl ?? null),
        scheduledAt: hasActiveComissions ? null : ensureDate(validated.scheduledAt),
        recordingUrl: hasActiveComissions ? null : (validated.recordingUrl ?? null),
        unlockMinutesBefore: validated.unlockMinutesBefore ?? null,
        durationMinutes: validated.durationMinutes ?? null,
        videoDurationSecs,
        sortOrder: lessonCount + 1,
        isFree: validated.isFree,
        isPublished: validated.isPublished,
      },
      include: {
        _count: {
          select: { progress: true },
        },
        liveSessions: {
          include: {
            scheduleOption: true,
          },
        },
      },
    });

    await revalidateCoursePaths(context.courseId, context.courseSlug);
    return { success: true, lesson: serializeLesson(lesson) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al crear la lección.' };
  }
}

export async function updateModuleLesson(lessonId: string, input: z.input<typeof lessonSchema>) {
  try {
    await requireAdmin();
    const validated = lessonSchema.parse(input);
    const context = await resolveCourseContextFromLesson(lessonId);

    const activeOptionsCount = await db.courseScheduleOption.count({
      where: { courseId: context.courseId, isActive: true },
    });
    const hasActiveComissions = activeOptionsCount > 0;

    const videoDurationSecs = await maybeResolveBunnyDuration(validated);

    const lesson = await db.lesson.update({
      where: { id: lessonId },
      data: {
        title: validated.title,
        description: validated.description ?? null,
        type: validated.type,
        videoProvider: validated.videoProvider,
        videoId: validated.videoId ?? null,
        videoUrl: validated.videoUrl ?? null,
        liveUrl: hasActiveComissions ? null : (validated.liveUrl ?? null),
        scheduledAt: hasActiveComissions ? null : ensureDate(validated.scheduledAt),
        recordingUrl: hasActiveComissions ? null : (validated.recordingUrl ?? null),
        unlockMinutesBefore: validated.unlockMinutesBefore ?? null,
        durationMinutes: validated.durationMinutes ?? null,
        videoDurationSecs,
        isFree: validated.isFree,
        isPublished: validated.isPublished,
      },
      include: {
        _count: {
          select: { progress: true },
        },
        liveSessions: {
          include: {
            scheduleOption: true,
          },
        },
      },
    });

    await revalidateCoursePaths(context.courseId, context.courseSlug);
    return { success: true, lesson: serializeLesson(lesson) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al actualizar la lección.' };
  }
}

export async function deleteModuleLesson(lessonId: string) {
  try {
    await requireAdmin();
    const context = await resolveCourseContextFromLesson(lessonId);

    const course = await db.course.findUnique({
      where: { id: context.courseId },
      select: { campusContentLocked: true },
    });

    if (course?.campusContentLocked) {
      return {
        success: false,
        error: 'La estructura está bloqueada para proteger el progreso de los alumnos.',
      };
    }

    await db.lesson.delete({
      where: { id: lessonId },
    });

    await revalidateCoursePaths(context.courseId, context.courseSlug);
    return { success: true, lessonId, moduleId: context.moduleId };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al eliminar la lección.' };
  }
}

export async function reorderModuleLessons(moduleId: string, orderedLessonIds: string[]) {
  try {
    await requireAdmin();
    const context = await resolveCourseContextFromModule(moduleId);

    const course = await db.course.findUnique({
      where: { id: context.courseId },
      select: { campusContentLocked: true },
    });

    if (course?.campusContentLocked) {
      return {
        success: false,
        error: 'La estructura está bloqueada para proteger el progreso de los alumnos.',
      };
    }

    const lessons = await db.lesson.findMany({
      where: { moduleId },
      select: { id: true },
    });

    const existingIds = lessons.map((lesson) => lesson.id).sort();
    const requestedIds = [...orderedLessonIds].sort();

    if (existingIds.length !== requestedIds.length || existingIds.some((id, index) => id !== requestedIds[index])) {
      throw new Error('El orden de lecciones es inválido para este módulo.');
    }

    await db.$transaction(
      orderedLessonIds.map((lessonId, index) =>
        db.lesson.update({
          where: { id: lessonId },
          data: { sortOrder: index + 1 },
        })
      )
    );

    await revalidateCoursePaths(context.courseId, context.courseSlug);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al reordenar las lecciones.' };
  }
}

export async function fetchBunnyLessonDuration(videoId: string) {
  try {
    await requireAdmin();

    const normalizedVideoId = videoId.trim();
    if (!normalizedVideoId) {
      throw new Error('El videoId de Bunny es requerido.');
    }

    const durationSecs = await getBunnyVideoDuration(normalizedVideoId);
    if (durationSecs === null) {
      return {
        success: false,
        error: 'No se pudo obtener la duración desde Bunny.',
      };
    }

    return { success: true, durationSecs };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al consultar Bunny.' };
  }
}

export async function lockCampusStructure(courseId: string) {
  try {
    await requireAdmin();
    const course = await db.course.update({
      where: { id: courseId },
      data: {
        campusContentLocked: true,
        campusContentLockedAt: new Date(),
      },
      select: {
        id: true,
        slug: true,
        campusContentLocked: true,
      },
    });

    await revalidateCoursePaths(course.id, course.slug);
    return { success: true, campusContentLocked: course.campusContentLocked };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al bloquear la estructura.' };
  }
}

export async function unlockCampusStructure(courseId: string) {
  try {
    await requireAdmin();
    const course = await db.course.update({
      where: { id: courseId },
      data: {
        campusContentLocked: false,
        campusContentLockedAt: null,
      },
      select: {
        id: true,
        slug: true,
        campusContentLocked: true,
      },
    });

    await revalidateCoursePaths(course.id, course.slug);
    return { success: true, campusContentLocked: course.campusContentLocked };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al desbloquear la estructura.' };
  }
}

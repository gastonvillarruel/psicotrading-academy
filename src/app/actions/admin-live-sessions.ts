'use server';

import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('No autorizado.');
  }
  return session;
}

const liveSessionSchema = z.object({
  startDateTime: z.string().min(1, 'La fecha/hora de inicio es requerida.'),
  endDateTime: z.string().nullable().optional(),
  liveUrl: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      const t = v.trim();
      if (t === '') return null;
      if (!/^https?:\/\//i.test(t)) return `https://${t}`;
      return t;
    },
    z.string().url('Ingresá una URL válida.').nullable().optional()
  ),
  recordingUrl: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      const t = v.trim();
      if (t === '') return null;
      if (!/^https?:\/\//i.test(t)) return `https://${t}`;
      return t;
    },
    z.string().url('Ingresá una URL válida.').nullable().optional()
  ),
});

export type LiveSessionInput = z.input<typeof liveSessionSchema>;

export interface AdminLiveSession {
  id: string;
  lessonId: string;
  scheduleOptionId: string;
  scheduleOptionName: string;
  startDateTime: string;
  endDateTime: string | null;
  liveUrl: string | null;
  recordingUrl: string | null;
}

function serializeSession(session: {
  id: string;
  lessonId: string;
  scheduleOptionId: string;
  scheduleOption: { name: string };
  startDateTime: Date;
  endDateTime: Date | null;
  liveUrl: string | null;
  recordingUrl: string | null;
}): AdminLiveSession {
  return {
    id: session.id,
    lessonId: session.lessonId,
    scheduleOptionId: session.scheduleOptionId,
    scheduleOptionName: session.scheduleOption.name,
    startDateTime: session.startDateTime.toISOString(),
    endDateTime: session.endDateTime ? session.endDateTime.toISOString() : null,
    liveUrl: session.liveUrl,
    recordingUrl: session.recordingUrl,
  };
}

/**
 * Obtiene todas las sesiones en vivo de una lección.
 */
export async function getLiveSessions(lessonId: string) {
  try {
    await requireAdmin();

    const sessions = await db.lessonLiveSession.findMany({
      where: { lessonId },
      include: { scheduleOption: { select: { name: true } } },
      orderBy: { scheduleOption: { sortOrder: 'asc' } },
    });

    return { success: true, sessions: sessions.map(serializeSession) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al obtener sesiones.' };
  }
}

/**
 * Crea o actualiza la sesión en vivo de una lección para una comisión específica.
 * Valida que scheduleOptionId pertenece al mismo curso que la lección.
 */
export async function upsertLiveSession(
  lessonId: string,
  scheduleOptionId: string,
  input: LiveSessionInput
) {
  try {
    await requireAdmin();
    const validated = liveSessionSchema.parse(input);

    // Verificar que la lección existe y obtener courseId
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        module: {
          select: {
            courseId: true,
            course: { select: { slug: true } },
          },
        },
      },
    });

    if (!lesson) throw new Error('Lección no encontrada.');

    const courseId = lesson.module.courseId;
    const courseSlug = lesson.module.course.slug;

    // Verificar que la comisión pertenece al mismo curso
    const scheduleOption = await db.courseScheduleOption.findUnique({
      where: { id: scheduleOptionId },
      select: { id: true, courseId: true, name: true },
    });

    if (!scheduleOption) throw new Error('Comisión no encontrada.');
    if (scheduleOption.courseId !== courseId) {
      throw new Error('La comisión no pertenece al curso de esta lección.');
    }

    const startDateTime = new Date(validated.startDateTime);
    if (isNaN(startDateTime.getTime())) {
      throw new Error('La fecha/hora de inicio no tiene un formato válido.');
    }

    const endDateTime = validated.endDateTime ? new Date(validated.endDateTime) : null;

    const session = await db.lessonLiveSession.upsert({
      where: {
        lessonId_scheduleOptionId: { lessonId, scheduleOptionId },
      },
      create: {
        lessonId,
        scheduleOptionId,
        startDateTime,
        endDateTime,
        liveUrl: validated.liveUrl ?? null,
        recordingUrl: validated.recordingUrl ?? null,
      },
      update: {
        startDateTime,
        endDateTime,
        liveUrl: validated.liveUrl ?? null,
        recordingUrl: validated.recordingUrl ?? null,
      },
      include: { scheduleOption: { select: { name: true } } },
    });

    revalidatePath(`/admin/courses`);
    revalidatePath(`/mi-campus/${courseSlug}`);

    return { success: true, session: serializeSession(session) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al guardar la sesión.' };
  }
}

/**
 * Elimina una sesión en vivo por ID.
 */
export async function deleteLiveSession(sessionId: string) {
  try {
    await requireAdmin();

    const session = await db.lessonLiveSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        lessonId: true,
        lesson: {
          select: {
            module: {
              select: {
                courseId: true,
                course: { select: { slug: true } },
              },
            },
          },
        },
      },
    });

    if (!session) throw new Error('Sesión no encontrada.');

    await db.lessonLiveSession.delete({ where: { id: sessionId } });

    revalidatePath(`/mi-campus/${session.lesson.module.course.slug}`);

    return { success: true, sessionId };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al eliminar la sesión.' };
  }
}

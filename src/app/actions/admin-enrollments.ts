'use server';

import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getEnrollmentOrigin } from '@/lib/admin/enrollment-helper';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('No autorizado.');
  }
  return session;
}

const revokeEnrollmentSchema = z.object({
  userId: z.string(),
  courseId: z.string(),
  purchaseId: z.string().nullable().optional(),
});

export async function revokeEnrollmentAccess(input: z.infer<typeof revokeEnrollmentSchema>) {
  try {
    await requireAdmin();
    const { userId, courseId, purchaseId } = revokeEnrollmentSchema.parse(input);

    // Buscar si existe el enrollment
    const existing = await db.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    let enrollment;

    if (existing) {
      // Si ya existe, actualizamos a estado REVOKED
      enrollment = await db.enrollment.update({
        where: {
          id: existing.id,
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: 'Revocado desde el panel de administración',
        },
      });
    } else {
      // --- LÓGICA DE COMPATIBILIDAD CON COMPRAS HISTÓRICAS (LEGACY) ---
      // Caso legacy: el usuario tiene una compra aprobada antigua pero todavía no se había
      // creado su registro de matrícula (Enrollment) en la base de datos.
      // Registramos un warning de auditoría y creamos el registro directamente en estado REVOKED.
      console.warn(
        `[AUDITORÍA - COMPRA LEGACY] Creando matrícula revocada preventivamente para userId: ${userId}, courseId: ${courseId}, purchaseId: ${purchaseId || 'N/A'}`
      );

      enrollment = await db.enrollment.create({
        data: {
          userId,
          courseId,
          purchaseId: purchaseId || undefined,
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: 'Revocado desde el panel de administración (caso legacy sin matrícula previa)',
        },
      });
    }

    revalidatePath('/admin/users');

    return { success: true, enrollmentId: enrollment.id };
  } catch (error: any) {
    console.error('Error al revocar el acceso de la matrícula:', error);
    return { success: false, error: error.message || 'Error al revocar el acceso de la matrícula.' };
  }
}

const restoreEnrollmentSchema = z.object({
  userId: z.string(),
  courseId: z.string(),
});

export async function restoreEnrollmentAccess(input: z.infer<typeof restoreEnrollmentSchema>) {
  try {
    await requireAdmin();
    const { userId, courseId } = restoreEnrollmentSchema.parse(input);

    const existing = await db.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    if (!existing) {
      return { success: false, error: 'No existe una matrícula previa para restaurar.' };
    }

    const enrollment = await db.enrollment.update({
      where: {
        id: existing.id,
      },
      data: {
        status: 'ACTIVE',
        revokedAt: null,
        revokedReason: null,
      },
    });

    revalidatePath('/admin/users');

    return { success: true, enrollmentId: enrollment.id };
  } catch (error: any) {
    console.error('Error al restaurar el acceso de la matrícula:', error);
    return { success: false, error: error.message || 'Error al restaurar el acceso de la matrícula.' };
  }
}

export async function getCourseEnrollmentsData(courseId: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      throw new Error('No autorizado.');
    }

    // 1. Contar lecciones publicadas en el curso
    const totalLessonsCount = await db.lesson.count({
      where: {
        module: {
          courseId,
        },
        isPublished: true,
      },
    });

    // 2. Agrupar lecciones completadas por usuario para este curso específico
    const progressGroup = await db.lessonProgress.groupBy({
      by: ['userId'],
      where: {
        lesson: {
          module: {
            courseId,
          },
        },
        completedAt: { not: null },
      },
      _count: {
        lessonId: true,
      },
    });

    const progressMap = new Map<string, number>(
      progressGroup.map((p) => [p.userId, p._count.lessonId])
    );

    // 3. Obtener inscripciones
    const enrollments = await db.enrollment.findMany({
      where: { courseId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            emailVerified: true,
            lastLoginAt: true,
          },
        },
        purchase: {
          select: {
            paymentMethod: true,
            amount: true,
            currency: true,
          },
        },
        scheduleOption: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 4. Mapear y procesar resultados en el formato final
    const serialized = enrollments.map((e) => {
      const completedCount = progressMap.get(e.user.id) || 0;
      const progressPercent =
        totalLessonsCount > 0
          ? Math.round((completedCount / totalLessonsCount) * 100)
          : 0;

      const origin = getEnrollmentOrigin(e.purchase);

      return {
        id: e.id,
        status: e.status,
        createdAt: e.createdAt.toISOString(),
        user: {
          id: e.user.id,
          name: e.user.name,
          email: e.user.email,
          emailVerified: e.user.emailVerified ? e.user.emailVerified.toISOString() : null,
          lastLoginAt: e.user.lastLoginAt ? e.user.lastLoginAt.toISOString() : null,
        },
        scheduleOption: e.scheduleOption
          ? {
              id: e.scheduleOption.id,
              name: e.scheduleOption.name,
              description: e.scheduleOption.description,
            }
          : null,
        origin,
        progressPercent,
      };
    });

    return {
      success: true,
      enrollments: serialized,
      totalLessonsCount,
    };
  } catch (error: any) {
    console.error('Error al obtener inscripciones de curso:', error);
    return {
      success: false,
      error: error.message || 'Error al obtener las inscripciones del curso.',
      enrollments: [],
      totalLessonsCount: 0,
    };
  }
}

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

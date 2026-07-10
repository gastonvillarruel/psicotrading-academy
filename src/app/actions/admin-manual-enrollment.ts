'use server';

import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createOrRestoreEnrollment } from '@/lib/campus/access';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('No autorizado.');
  }
  return session;
}

const manualEnrollmentSchema = z.object({
  courseId: z.string().min(1, 'Selecciona un curso.'),
  email: z.string().email('Email invalido.'),
  scheduleOptionId: z.string().nullable().optional(),
});

export type ManualEnrollmentResult =
  | { success: true; message: string }
  | { success: false; error: string };

export async function grantManualEnrollment(
  input: z.infer<typeof manualEnrollmentSchema>
): Promise<ManualEnrollmentResult> {
  try {
    const session = await requireAdmin();

    const { courseId, email: rawEmail, scheduleOptionId } = manualEnrollmentSchema.parse(input);
    const email = rawEmail.trim().toLowerCase();

    // Verificar que el curso exista
    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return { success: false, error: 'El curso seleccionado no existe.' };
    }

    // Validar scheduleOptionId igual que el checkout
    let validatedScheduleOptionId: string | null = null;
    const activeOptions = await db.courseScheduleOption.findMany({
      where: { courseId, isActive: true },
      select: { id: true },
    });

    if (activeOptions.length > 0) {
      if (activeOptions.length === 1) {
        // Auto-seleccionar si hay una sola opcion
        validatedScheduleOptionId = activeOptions[0].id;
      } else if (!scheduleOptionId) {
        return { success: false, error: 'Este curso tiene comisiones disponibles. Debes elegir una comision.' };
      } else {
        const matched = activeOptions.find((o) => o.id === scheduleOptionId);
        if (!matched) {
          return { success: false, error: 'La comision seleccionada no es valida para este curso.' };
        }
        validatedScheduleOptionId = scheduleOptionId;
      }
    }

    // Buscar el usuario por email
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return {
        success: false,
        error: 'No existe ningun usuario registrado con ese email.',
      };
    }

    // Delegar toda la logica de matricula a la funcion centralizada
    const { result } = await createOrRestoreEnrollment({
      userId: user.id,
      courseId,
      purchaseId: null,
      scheduleOptionId: validatedScheduleOptionId,
    });

    // Auditoria
    console.info(
      `[INSCRIPCION MANUAL] Admin: ${session.user.email} | Usuario: ${user.email} (${user.id}) | Curso: "${course.title}" (${courseId}) | Resultado: ${result} | Fecha: ${new Date().toISOString()}`
    );

    revalidatePath('/admin');
    revalidatePath('/admin/users');

    if (result === 'alreadyActive') {
      return {
        success: false,
        error: 'El usuario ya tiene acceso activo a este curso.',
      };
    }

    const message =
      result === 'restored'
        ? 'Acceso restaurado correctamente.'
        : 'Acceso otorgado correctamente.';

    return { success: true, message };
  } catch (error: any) {
    console.error('[INSCRIPCION MANUAL] Error inesperado:', error);
    return {
      success: false,
      error: error.message || 'Error interno al otorgar el acceso.',
    };
  }
}

// Accion auxiliar: buscar info del usuario por email (para mostrar antes de confirmar)
const lookupSchema = z.object({
  email: z.string().email(),
});

export type UserLookupResult =
  | { found: true; id: string; name: string | null; email: string }
  | { found: false; error: string };

export async function lookupUserByEmail(
  input: z.infer<typeof lookupSchema>
): Promise<UserLookupResult> {
  try {
    await requireAdmin();

    const email = input.email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return {
        found: false,
        error: 'No existe ningun usuario registrado con ese email.',
      };
    }

    return { found: true, id: user.id, name: user.name, email: user.email };
  } catch (error: any) {
    return { found: false, error: error.message || 'Error al buscar el usuario.' };
  }
}

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

const deleteStudentsSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, 'Debes seleccionar al menos un usuario.'),
});

export async function deleteStudents(input: z.infer<typeof deleteStudentsSchema>) {
  try {
    const session = await requireAdmin();
    const { userIds } = deleteStudentsSchema.parse(input);

    const currentAdminId = session.user.id;
    // Protección estricta: nunca eliminar la cuenta del administrador actual
    const targetIds = userIds.filter((id) => id !== currentAdminId);

    if (targetIds.length === 0) {
      return { success: false, error: 'No se encontraron alumnos válidos para eliminar.' };
    }

    const deletedCount = await db.$transaction(async (tx) => {
      // 1. Eliminar matrículas asociadas primero para evitar conflictos de claves foráneas con Purchase
      await tx.enrollment.deleteMany({
        where: { userId: { in: targetIds } },
      });

      // 2. Eliminar compras registradas
      await tx.purchase.deleteMany({
        where: { userId: { in: targetIds } },
      });

      // 3. Eliminar suscripciones
      await tx.subscription.deleteMany({
        where: { userId: { in: targetIds } },
      });

      // 4. Eliminar certificados
      await tx.certificate.deleteMany({
        where: { userId: { in: targetIds } },
      });

      // 5. Eliminar progresos de lecciones
      await tx.lessonProgress.deleteMany({
        where: { userId: { in: targetIds } },
      });

      // 6. Eliminar sesiones y cuentas OAuth
      await tx.session.deleteMany({
        where: { userId: { in: targetIds } },
      });
      await tx.account.deleteMany({
        where: { userId: { in: targetIds } },
      });

      // 7. Eliminar usuarios asegurando que tengan rol STUDENT
      const res = await tx.user.deleteMany({
        where: {
          id: { in: targetIds },
          role: 'STUDENT',
        },
      });

      return res.count;
    });

    revalidatePath('/admin/users');
    revalidatePath('/admin');

    return { success: true, count: deletedCount };
  } catch (error: any) {
    console.error('Error al eliminar alumnos:', error);
    return {
      success: false,
      error: error?.message || 'Ocurrió un error inesperado al eliminar los alumnos.',
    };
  }
}

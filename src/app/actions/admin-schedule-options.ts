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

async function revalidateCoursePaths(courseId: string, courseSlug: string) {
  revalidatePath('/admin/courses');
  revalidatePath(`/admin/courses/${courseId}/edit`);
}

const scheduleOptionSchema = z.object({
  name: z.string().trim().min(1, 'El nombre de la comisión es requerido.'),
  description: z.string().trim().nullable().optional(),
  timezone: z.string().trim().nullable().optional(),
  capacity: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
});

export type ScheduleOptionInput = z.input<typeof scheduleOptionSchema>;

export interface AdminScheduleOption {
  id: string;
  courseId: string;
  name: string;
  description: string | null;
  timezone: string | null;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  _count: {
    enrollments: number;
  };
}

function serializeOption(option: {
  id: string;
  courseId: string;
  name: string;
  description: string | null;
  timezone: string | null;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  _count: { enrollments: number };
}): AdminScheduleOption {
  return {
    id: option.id,
    courseId: option.courseId,
    name: option.name,
    description: option.description,
    timezone: option.timezone,
    capacity: option.capacity,
    sortOrder: option.sortOrder,
    isActive: option.isActive,
    _count: option._count,
  };
}

/**
 * Obtener todas las comisiones de un curso (activas e inactivas).
 */
export async function getScheduleOptions(courseId: string) {
  try {
    await requireAdmin();

    const options = await db.courseScheduleOption.findMany({
      where: { courseId },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { enrollments: true },
        },
      },
    });

    return { success: true, options: options.map(serializeOption) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al obtener comisiones.' };
  }
}

/**
 * Crear una nueva comisión para un curso.
 */
export async function createScheduleOption(courseId: string, input: ScheduleOptionInput) {
  try {
    await requireAdmin();
    const validated = scheduleOptionSchema.parse(input);

    const course = await db.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        slug: true,
        _count: { select: { scheduleOptions: true } },
      },
    });

    if (!course) throw new Error('Curso no encontrado.');

    const option = await db.courseScheduleOption.create({
      data: {
        courseId,
        name: validated.name,
        description: validated.description ?? null,
        timezone: validated.timezone ?? null,
        capacity: validated.capacity ?? null,
        isActive: validated.isActive,
        sortOrder: course._count.scheduleOptions + 1,
      },
      include: {
        _count: { select: { enrollments: true } },
      },
    });

    await revalidateCoursePaths(course.id, course.slug);
    return { success: true, option: serializeOption(option) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al crear la comisión.' };
  }
}

/**
 * Editar una comisión existente.
 */
export async function updateScheduleOption(optionId: string, input: ScheduleOptionInput) {
  try {
    await requireAdmin();
    const validated = scheduleOptionSchema.parse(input);

    const existing = await db.courseScheduleOption.findUnique({
      where: { id: optionId },
      select: { courseId: true, course: { select: { slug: true } } },
    });

    if (!existing) throw new Error('Comisión no encontrada.');

    const option = await db.courseScheduleOption.update({
      where: { id: optionId },
      data: {
        name: validated.name,
        description: validated.description ?? null,
        timezone: validated.timezone ?? null,
        capacity: validated.capacity ?? null,
        isActive: validated.isActive,
      },
      include: {
        _count: { select: { enrollments: true } },
      },
    });

    await revalidateCoursePaths(existing.courseId, existing.course.slug);
    return { success: true, option: serializeOption(option) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al actualizar la comisión.' };
  }
}

/**
 * Activar o desactivar una comisión.
 */
export async function toggleScheduleOptionActive(optionId: string) {
  try {
    await requireAdmin();

    const existing = await db.courseScheduleOption.findUnique({
      where: { id: optionId },
      select: { isActive: true, courseId: true, course: { select: { slug: true } } },
    });

    if (!existing) throw new Error('Comisión no encontrada.');

    const option = await db.courseScheduleOption.update({
      where: { id: optionId },
      data: { isActive: !existing.isActive },
      include: {
        _count: { select: { enrollments: true } },
      },
    });

    await revalidateCoursePaths(existing.courseId, existing.course.slug);
    return { success: true, option: serializeOption(option) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al cambiar el estado de la comisión.' };
  }
}

/**
 * Eliminar una comisión. Solo se permite si no tiene enrollments asociados.
 */
export async function deleteScheduleOption(optionId: string) {
  try {
    await requireAdmin();

    const existing = await db.courseScheduleOption.findUnique({
      where: { id: optionId },
      select: {
        courseId: true,
        course: { select: { slug: true } },
        _count: { select: { enrollments: true } },
      },
    });

    if (!existing) throw new Error('Comisión no encontrada.');

    if (existing._count.enrollments > 0) {
      return {
        success: false,
        error: `No se puede eliminar: ${existing._count.enrollments} alumno(s) inscriptos en esta comisión.`,
      };
    }

    await db.courseScheduleOption.delete({ where: { id: optionId } });
    await revalidateCoursePaths(existing.courseId, existing.course.slug);
    return { success: true, optionId };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al eliminar la comisión.' };
  }
}

/**
 * Reordenar comisiones de un curso.
 */
export async function reorderScheduleOptions(courseId: string, orderedIds: string[]) {
  try {
    await requireAdmin();

    const course = await db.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        slug: true,
        scheduleOptions: { select: { id: true } },
      },
    });

    if (!course) throw new Error('Curso no encontrado.');

    const existingIds = course.scheduleOptions.map((o) => o.id).sort();
    const requestedIds = [...orderedIds].sort();

    if (
      existingIds.length !== requestedIds.length ||
      existingIds.some((id, i) => id !== requestedIds[i])
    ) {
      throw new Error('El orden de comisiones es inválido para este curso.');
    }

    await db.$transaction(
      orderedIds.map((id, index) =>
        db.courseScheduleOption.update({
          where: { id },
          data: { sortOrder: index + 1 },
        })
      )
    );

    await revalidateCoursePaths(course.id, course.slug);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al reordenar las comisiones.' };
  }
}

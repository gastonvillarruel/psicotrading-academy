'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { CourseType, Prisma } from '@prisma/client';
import { courseSectionsSchema } from '@/types/course';

const courseSchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres.'),
  slug: z.string().min(3, 'El slug debe tener al menos 3 caracteres.').regex(/^[a-z0-9-]+$/, 'El slug solo debe contener letras minúsculas, números y guiones.'),
  shortDescription: z.string().min(10, 'La descripción corta debe tener al menos 10 caracteres.'),
  longDescription: z.string().min(20, 'La descripción larga debe tener al menos 20 caracteres.'),
  price: z.number().min(0, 'El precio no puede ser negativo.'),
  type: z.nativeEnum(CourseType),
  videoUrl: z.string().url('Por favor, ingresá una URL válida.').nullable().optional().or(z.literal('')),
  scheduledAt: z.string().nullable().optional().or(z.literal('')),
  thumbnail: z.string().url('Por favor, ingresá una URL de imagen válida.').nullable().optional().or(z.literal('')),
  descriptionSections: z.union([z.string(), z.array(z.any())]).nullable().optional(),
});

export async function createCourse(formData: z.infer<typeof courseSchema>) {
  try {
    const validatedData = courseSchema.parse(formData);

    // Validar si el slug ya existe
    const slugExists = await db.course.findUnique({
      where: { slug: validatedData.slug },
    });

    if (slugExists) {
      return { success: false, error: 'Este slug ya está en uso por otro curso.' };
    }

    // Validar y parsear las secciones si existen
    let parsedSections = null;
    if (validatedData.descriptionSections) {
      const rawSections = typeof validatedData.descriptionSections === 'string'
        ? JSON.parse(validatedData.descriptionSections)
        : validatedData.descriptionSections;
      
      parsedSections = courseSectionsSchema.parse(rawSections);
    }

    await db.course.create({
      data: {
        title: validatedData.title,
        slug: validatedData.slug,
        shortDescription: validatedData.shortDescription,
        longDescription: validatedData.longDescription,
        price: validatedData.price,
        type: validatedData.type,
        videoUrl: validatedData.videoUrl || null,
        scheduledAt: validatedData.scheduledAt ? new Date(validatedData.scheduledAt) : null,
        thumbnail: validatedData.thumbnail || null,
        descriptionSections: parsedSections ? (parsedSections as any) : Prisma.DbNull,
      },
    });

    revalidatePath('/campus');
    revalidatePath('/admin/courses');
    return { success: true };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: error.message || 'Error al crear el curso.' };
  }
}

export async function updateCourse(id: string, formData: z.infer<typeof courseSchema>) {
  try {
    const validatedData = courseSchema.parse(formData);

    // Validar si el slug ya existe en otro curso
    const slugExists = await db.course.findFirst({
      where: {
        slug: validatedData.slug,
        NOT: { id },
      },
    });

    if (slugExists) {
      return { success: false, error: 'Este slug ya está en uso por otro curso.' };
    }

    // Validar y parsear las secciones si existen
    let parsedSections = null;
    if (validatedData.descriptionSections) {
      const rawSections = typeof validatedData.descriptionSections === 'string'
        ? JSON.parse(validatedData.descriptionSections)
        : validatedData.descriptionSections;
      
      parsedSections = courseSectionsSchema.parse(rawSections);
    }

    await db.course.update({
      where: { id },
      data: {
        title: validatedData.title,
        slug: validatedData.slug,
        shortDescription: validatedData.shortDescription,
        longDescription: validatedData.longDescription,
        price: validatedData.price,
        type: validatedData.type,
        videoUrl: validatedData.videoUrl || null,
        scheduledAt: validatedData.scheduledAt ? new Date(validatedData.scheduledAt) : null,
        thumbnail: validatedData.thumbnail || null,
        descriptionSections: parsedSections ? (parsedSections as any) : Prisma.DbNull,
      },
    });

    revalidatePath('/campus');
    revalidatePath(`/campus/${validatedData.slug}`);
    revalidatePath('/admin/courses');
    return { success: true };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: error.message || 'Error al actualizar el curso.' };
  }
}

export async function deleteCourse(id: string) {
  try {
    const course = await db.course.findUnique({
      where: { id },
    });

    if (!course) {
      return { success: false, error: 'Curso no encontrado.' };
    }

    await db.course.delete({
      where: { id },
    });

    revalidatePath('/campus');
    revalidatePath('/admin/courses');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al eliminar el curso.' };
  }
}

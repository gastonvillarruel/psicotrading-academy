'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { CourseType, Prisma, PaymentMode } from '@prisma/client';
import { courseSectionsSchema } from '@/types/course';

const startDateInputSchema = z.object({
  id: z.string().optional(),
  startDate: z.string().min(1, 'La fecha de inicio es requerida.'),
  startTime: z.string().nullable().optional().or(z.literal('')),
  teacherName: z.string().nullable().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

const courseSchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres.'),
  slug: z.string().min(3, 'El slug debe tener al menos 3 caracteres.').regex(/^[a-z0-9-]+$/, 'El slug solo debe contener letras minúsculas, números y guiones.'),
  shortDescription: z.string().min(10, 'La descripción corta debe tener al menos 10 caracteres.'),
  longDescription: z.string().min(20, 'La descripción larga debe tener al menos 20 caracteres.'),
  price: z.number().min(0, 'El precio no puede ser negativo.'),
  priceARS: z.number().int().min(0, 'El precio ARS no puede ser negativo.').nullable().optional(),
  priceUSD: z.number().int().min(0, 'El precio USD no puede ser negativo.').nullable().optional(),
  originalPriceARS: z.number().int().min(0, 'El precio original ARS no puede ser negativo.').nullable().optional(),
  originalPriceUSD: z.number().int().min(0, 'El precio original USD no puede ser negativo.').nullable().optional(),
  paymentMode: z.enum(['cash', 'installments']).optional().default('cash'),
  durationInMonths: z.number().int().min(1, 'La duración en meses debe ser al menos 1.').nullable().optional(),
  type: z.nativeEnum(CourseType),
  videoUrl: z.string().url('Por favor, ingresá una URL válida.').nullable().optional().or(z.literal('')),
  scheduledAt: z.string().nullable().optional().or(z.literal('')),
  thumbnail: z.string().url('Por favor, ingresá una URL de imagen válida.').nullable().optional().or(z.literal('')),
  descriptionSections: z.union([z.string(), z.array(z.any())]).nullable().optional(),
  available: z.boolean().optional().default(true),
  startDates: z.array(startDateInputSchema).optional().default([]),
});

export async function createCourse(formData: z.infer<typeof courseSchema>) {
  try {
    const validatedData = courseSchema.parse(formData);

    // Validar modalidad en cuotas
    if (validatedData.paymentMode === 'installments') {
      if (!validatedData.durationInMonths || validatedData.durationInMonths < 1) {
        return { success: false, error: 'Para usar precio en cuotas, primero definí la duración del curso en meses.' };
      }
    }

    // Validar precio anterior ARS contra precio actual efectivo (priceARS o price fallback)
    if (validatedData.originalPriceARS !== null && validatedData.originalPriceARS !== undefined) {
      const effectiveARS = validatedData.priceARS ?? validatedData.price;
      if (validatedData.originalPriceARS <= effectiveARS) {
        return { success: false, error: 'El precio real/anterior en ARS debe ser mayor que el precio actual en ARS.' };
      }
    }

    // Validar precio anterior USD contra precio actual USD
    if (validatedData.originalPriceUSD !== null && validatedData.originalPriceUSD !== undefined) {
      if (validatedData.priceUSD === null || validatedData.priceUSD === undefined) {
        return { success: false, error: 'Para cargar un precio real/anterior en USD, primero definí el precio actual en USD.' };
      }
      if (validatedData.originalPriceUSD <= validatedData.priceUSD) {
        return { success: false, error: 'El precio real/anterior en USD debe ser mayor que el precio actual en USD.' };
      }
    }

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
        priceARS: validatedData.priceARS ?? null,
        priceUSD: validatedData.priceUSD ?? null,
        originalPriceARS: validatedData.originalPriceARS ?? null,
        originalPriceUSD: validatedData.originalPriceUSD ?? null,
        paymentMode: validatedData.paymentMode as PaymentMode,
        durationInMonths: validatedData.durationInMonths ?? null,
        type: validatedData.type,
        videoUrl: validatedData.videoUrl || null,
        scheduledAt: validatedData.scheduledAt ? new Date(validatedData.scheduledAt) : null,
        thumbnail: validatedData.thumbnail || null,
        descriptionSections: parsedSections ? (parsedSections as any) : Prisma.DbNull,
        available: validatedData.available,
        startDates: {
          create: validatedData.startDates.map(sd => ({
            startDate: new Date(sd.startDate),
            startTime: sd.startTime || null,
            teacherName: sd.teacherName || null,
            isActive: sd.isActive,
          }))
        }
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

    // Validar modalidad en cuotas
    if (validatedData.paymentMode === 'installments') {
      if (!validatedData.durationInMonths || validatedData.durationInMonths < 1) {
        return { success: false, error: 'Para usar precio en cuotas, primero definí la duración del curso en meses.' };
      }
    }

    // Validar precio anterior ARS contra precio actual efectivo (priceARS o price fallback)
    if (validatedData.originalPriceARS !== null && validatedData.originalPriceARS !== undefined) {
      const effectiveARS = validatedData.priceARS ?? validatedData.price;
      if (validatedData.originalPriceARS <= effectiveARS) {
        return { success: false, error: 'El precio real/anterior en ARS debe ser mayor que el precio actual en ARS.' };
      }
    }

    // Validar precio anterior USD contra precio actual USD
    if (validatedData.originalPriceUSD !== null && validatedData.originalPriceUSD !== undefined) {
      if (validatedData.priceUSD === null || validatedData.priceUSD === undefined) {
        return { success: false, error: 'Para cargar un precio real/anterior en USD, primero definí el precio actual en USD.' };
      }
      if (validatedData.originalPriceUSD <= validatedData.priceUSD) {
        return { success: false, error: 'El precio real/anterior en USD debe ser mayor que el precio actual en USD.' };
      }
    }

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

    // NOTA: Para esta fase, dado que no hay compras asociadas a CourseStartDate, se realiza delete + recreate por simplicidad.
    // Si en el futuro una Purchase/Inscripción queda asociada a CourseStartDate, se deberá migrar a una estrategia de upsert/diffing
    // utilizando los IDs para evitar alterar el historial y romper claves foráneas.
    await db.courseStartDate.deleteMany({
      where: { courseId: id }
    });

    await db.course.update({
      where: { id },
      data: {
        title: validatedData.title,
        slug: validatedData.slug,
        shortDescription: validatedData.shortDescription,
        longDescription: validatedData.longDescription,
        price: validatedData.price,
        priceARS: validatedData.priceARS ?? null,
        priceUSD: validatedData.priceUSD ?? null,
        originalPriceARS: validatedData.originalPriceARS ?? null,
        originalPriceUSD: validatedData.originalPriceUSD ?? null,
        paymentMode: validatedData.paymentMode as PaymentMode,
        durationInMonths: validatedData.durationInMonths ?? null,
        type: validatedData.type,
        videoUrl: validatedData.videoUrl || null,
        scheduledAt: validatedData.scheduledAt ? new Date(validatedData.scheduledAt) : null,
        thumbnail: validatedData.thumbnail || null,
        descriptionSections: parsedSections ? (parsedSections as any) : Prisma.DbNull,
        available: validatedData.available,
        startDates: {
          create: validatedData.startDates.map(sd => ({
            startDate: new Date(sd.startDate),
            startTime: sd.startTime || null,
            teacherName: sd.teacherName || null,
            isActive: sd.isActive,
          }))
        }
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

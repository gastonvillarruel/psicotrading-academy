'use server';

import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

const profileSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.').max(100),
  phone: z.string().max(30).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  timezone: z.string().max(100).optional().or(z.literal('')),
  bio: z.string().max(500, 'La bio no puede superar los 500 caracteres.').optional().or(z.literal('')),
});

export async function updateProfile(formData: {
  name: string;
  phone?: string;
  country?: string;
  timezone?: string;
  bio?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return { success: false, error: 'No autorizado.' };
    }

    const validated = profileSchema.parse(formData);

    await db.user.update({
      where: { id: session.user.id },
      data: {
        name: validated.name.trim(),
        phone: validated.phone?.trim() || null,
        country: validated.country?.trim() || null,
        timezone: validated.timezone?.trim() || null,
        bio: validated.bio?.trim() || null,
      },
    });

    return { success: true };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: 'Error al guardar los cambios.' };
  }
}

export async function getProfileData() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
      country: true,
      timezone: true,
      bio: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
  });

  return user;
}

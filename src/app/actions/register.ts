'use server';

import { db } from '@/lib/db';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
  email: z.string().email('Por favor, ingresá un email válido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
});

export async function registerUser(formData: z.infer<typeof registerSchema>) {
  try {
    const validatedData = registerSchema.parse(formData);

    const userExists = await db.user.findUnique({
      where: { email: validatedData.email },
    });

    if (userExists) {
      return { success: false, error: 'Este email ya está registrado.' };
    }

    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    await db.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        password: hashedPassword,
        role: 'STUDENT',
      },
    });

    return { success: true };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: 'Hubo un error al procesar tu solicitud.' };
  }
}

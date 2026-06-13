'use server';

import { db } from '@/lib/db';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sendVerificationEmail } from '@/lib/email';
import crypto from 'crypto';

const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
  email: z.string().email('Por favor, ingresá un email válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmPassword'],
});

export async function registerUser(formData: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}) {
  try {
    const validatedData = registerSchema.parse(formData);

    const userExists = await db.user.findUnique({
      where: { email: validatedData.email },
    });

    if (userExists) {
      return { success: false, error: 'Este email ya está registrado.' };
    }

    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    await db.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        password: hashedPassword,
        role: 'STUDENT',
        emailVerified: null,
      },
    });

    // Generar token de verificación (24h)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.verificationToken.create({
      data: {
        identifier: validatedData.email,
        token,
        expires,
      },
    });

    // Enviar email de confirmación
    try {
      await sendVerificationEmail(validatedData.email, validatedData.name, token);
    } catch (emailError: any) {
      console.error('Error enviando email de verificación:', emailError);
      // El usuario fue creado, aunque el email no llegó
      // Devolver éxito pero indicar problema de email
      if (emailError?.message?.includes('SMTP no configurado')) {
        return {
          success: true,
          emailSent: false,
          smtpNotConfigured: true,
        };
      }
      return {
        success: true,
        emailSent: false,
        smtpNotConfigured: false,
      };
    }

    return { success: true, emailSent: true };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    return { success: false, error: 'Hubo un error al procesar tu solicitud.' };
  }
}

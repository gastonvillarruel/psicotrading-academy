'use server';

import { db } from '@/lib/db';
import { sendVerificationEmail } from '@/lib/email';
import crypto from 'crypto';

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verifica un token de email y marca el usuario como verificado.
 */
export async function verifyEmail(token: string): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    if (!token) {
      return { success: false, error: 'Token inválido.' };
    }

    const verificationToken = await db.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return { success: false, error: 'El link de verificación no es válido o ya fue usado.' };
    }

    if (verificationToken.expires < new Date()) {
      // Eliminar token expirado
      await db.verificationToken.delete({ where: { token } });
      return { success: false, error: 'El link de verificación expiró. Pedí uno nuevo.' };
    }

    // Marcar usuario como verificado
    await db.user.update({
      where: { email: verificationToken.identifier },
      data: { emailVerified: new Date() },
    });

    // Eliminar token usado
    await db.verificationToken.delete({ where: { token } });

    return { success: true };
  } catch {
    return { success: false, error: 'Ocurrió un error al verificar tu email.' };
  }
}

/**
 * Reenvía el email de confirmación si el usuario no verificó aún.
 */
export async function resendVerificationEmail(email: string): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    if (!email) {
      return { success: false, error: 'Email requerido.' };
    }

    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      // No revelar si el email existe o no
      return { success: true };
    }

    if (user.emailVerified) {
      return { success: false, error: 'Este email ya fue verificado.' };
    }

    // Eliminar tokens anteriores del mismo usuario
    await db.verificationToken.deleteMany({
      where: { identifier: email },
    });

    // Crear nuevo token con 24h de expiración
    const token = generateToken();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.verificationToken.create({
      data: { identifier: email, token, expires },
    });

    await sendVerificationEmail(email, user.name, token);

    return { success: true };
  } catch (error: any) {
    console.error('Error resendVerificationEmail:', error);
    // Si el error es de SMTP no configurado, devolver mensaje claro
    if (error?.message?.includes('SMTP no configurado')) {
      return { success: false, error: 'El sistema de emails no está configurado. Contactá al administrador.' };
    }
    return { success: false, error: 'No se pudo enviar el email. Intentá de nuevo en unos minutos.' };
  }
}

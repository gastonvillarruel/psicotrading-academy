'use server';

import { db } from '@/lib/db';
import * as bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { sendPasswordResetEmail, sendGoogleAccountNotice } from '@/lib/email';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// TODO: Implementar rate limiting por IP/email cuando se agregue infraestructura
// (ej: upstash/ratelimit). Por ahora el flujo es seguro por diseño:
// mensajes genéricos, tokens SHA-256 con expiración 1h, uso único.

// ─────────────────────────────────────────────────────────────────────────────
// requestPasswordReset
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Solicita un reset de contraseña para el email dado.
 * Siempre retorna { success: true } para no revelar si el email existe.
 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (!email || !z.string().email().safeParse(email).success) {
      // Retornar éxito genérico — no revelar si el email es inválido
      return { success: true };
    }

    const user = await db.user.findUnique({ where: { email } });

    // Caso 1: usuario no existe — respuesta genérica
    if (!user) {
      return { success: true };
    }

    // Caso 2: cuenta Google sin contraseña — email informativo, sin crear token
    if (!user.password) {
      try {
        await sendGoogleAccountNotice(email, user.name);
      } catch (googleErr) {
        console.error('[password-reset] sendGoogleAccountNotice error:', googleErr);
      }
      return { success: true };
    }

    // Caso 3: usuario con contraseña — generar token y enviar email de reset

    // Invalidar tokens previos del mismo email
    await db.passwordResetToken.deleteMany({ where: { email } });

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await db.passwordResetToken.create({
      data: {
        email,
        token: tokenHash, // Guardamos solo el hash SHA-256
        expires,
      },
    });

    const appUrl =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';
    // El rawToken viaja en la URL, nunca se guarda en DB
    const resetUrl = `${appUrl}/restablecer-password?token=${rawToken}`;

    try {
      await sendPasswordResetEmail(email, user.name, resetUrl);
    } catch (emailErr) {
      console.error('[password-reset] sendPasswordResetEmail error:', emailErr);
    }

    return { success: true };
  } catch (err) {
    console.error('[password-reset] requestPasswordReset overall error:', err);
    // Cualquier error interno → respuesta genérica
    return { success: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// resetPassword
// ─────────────────────────────────────────────────────────────────────────────

const resetSchema = z
  .object({
    token: z.string().min(1, 'Token requerido.'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

/**
 * Restablece la contraseña usando el token plano recibido por URL.
 */
export async function resetPassword(
  rawToken: string,
  password: string,
  confirmPassword: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = resetSchema.safeParse({ token: rawToken, password, confirmPassword });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const tokenHash = hashToken(rawToken);

    const record = await db.passwordResetToken.findUnique({
      where: { token: tokenHash },
    });

    if (!record) {
      return { success: false, error: 'El link de recuperación no es válido o ya fue usado.' };
    }

    if (record.expires < new Date()) {
      // Borrar token expirado
      await db.passwordResetToken.delete({ where: { token: tokenHash } });
      return { success: false, error: 'El link de recuperación expiró. Solicitá uno nuevo.' };
    }

    // Verificar que el usuario aún existe
    const user = await db.user.findUnique({ where: { email: record.email } });
    if (!user) {
      await db.passwordResetToken.deleteMany({ where: { email: record.email } });
      return { success: false, error: 'No se encontró la cuenta asociada a este link.' };
    }

    // Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(password, 12);

    // Actualizar contraseña del usuario
    await db.user.update({
      where: { email: record.email },
      data: { password: hashedPassword },
    });

    // Eliminar todos los tokens del email (uso único + limpieza)
    await db.passwordResetToken.deleteMany({ where: { email: record.email } });

    return { success: true };
  } catch {
    return { success: false, error: 'Ocurrió un error al restablecer tu contraseña. Intentá de nuevo.' };
  }
}

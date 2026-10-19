'use server';

import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureActiveEnrollment } from '@/lib/campus/access';
import { createWorkshopEnrollmentTicket, verifyWorkshopEnrollmentTicket } from '@/lib/workshop-ticket';

const TICKET_COOKIE_NAME = 'workshop_enrollment_ticket';

/**
 * Inscribe al usuario autenticado actual en un taller/curso de captación.
 * Idempotente: Si ya está inscripto, no duplica registros y permite volver a acceder.
 */
export async function enrollCurrentUserInWorkshopAction(courseSlug: string) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return {
        success: false,
        requireAuth: true,
        redirectUrl: `/login?callbackUrl=${encodeURIComponent(`/campus/${courseSlug}/inscribirse`)}`,
      };
    }

    const course = await db.course.findUnique({
      where: { slug: courseSlug },
      select: {
        id: true,
        slug: true,
        title: true,
        price: true,
        available: true,
        isLeadCapture: true,
        whatsappGroupUrl: true,
      },
    });

    if (!course || course.available === false) {
      return {
        success: false,
        error: 'El taller solicitado no está disponible o no existe.',
      };
    }

    // Inscribir o restaurar matrícula sin duplicar
    const { enrollment } = await ensureActiveEnrollment({
      userId: session.user.id,
      courseId: course.id,
    });

    // Crear ticket firmado para la sesión
    const ticket = createWorkshopEnrollmentTicket(enrollment.id, course.id);
    const cookieStore = await cookies();
    cookieStore.set(TICKET_COOKIE_NAME, ticket, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 horas
      path: '/',
    });

    return {
      success: true,
      redirectUrl: `/campus/${course.slug}/gracias?justEnrolled=1`,
    };
  } catch (error: any) {
    console.error('Error en enrollCurrentUserInWorkshopAction:', error);
    return {
      success: false,
      error: 'Ocurrió un error al procesar tu inscripción.',
    };
  }
}

/**
 * Valida de forma estricta en el servidor si el visitante actual cuenta con una inscripción activa
 * (ya sea por sesión de usuario autenticado o por ticket seguro firmado tras registrarse).
 */
export async function verifyWorkshopAccessOnServer(courseId: string): Promise<{
  isEnrolled: boolean;
  userId?: string;
  enrollmentId?: string;
}> {
  try {
    // 1. Verificar sesión activa
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      const enrollment = await db.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: session.user.id,
            courseId,
          },
        },
      });

      if (enrollment && enrollment.status === 'ACTIVE') {
        return {
          isEnrolled: true,
          userId: session.user.id,
          enrollmentId: enrollment.id,
        };
      }
    }

    // 2. Si no hay sesión, comprobar ticket seguro firmado en cookies
    const cookieStore = await cookies();
    const ticketCookie = cookieStore.get(TICKET_COOKIE_NAME)?.value;
    const ticket = verifyWorkshopEnrollmentTicket(ticketCookie);

    if (ticket && ticket.courseId === courseId) {
      const enrollment = await db.enrollment.findUnique({
        where: {
          id: ticket.enrollmentId,
        },
      });

      if (enrollment && enrollment.courseId === courseId && enrollment.status === 'ACTIVE') {
        return {
          isEnrolled: true,
          userId: enrollment.userId,
          enrollmentId: enrollment.id,
        };
      }
    }

    return { isEnrolled: false };
  } catch (e) {
    console.error('Error verificando acceso a taller en servidor:', e);
    return { isEnrolled: false };
  }
}

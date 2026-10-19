import crypto from 'crypto';

interface TicketPayload {
  enrollmentId: string;
  courseId: string;
  exp: number;
}

const SECRET = process.env.NEXTAUTH_SECRET || 'psicotrading-secure-secret-key';

/**
 * Genera un token seguro y firmado HMAC-SHA256 para confirmar la inscripción en la sesión actual.
 */
export function createWorkshopEnrollmentTicket(enrollmentId: string, courseId: string): string {
  const payload: TicketPayload = {
    enrollmentId,
    courseId,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 horas de vigencia
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Valida un ticket firmado y verifica que no esté expirado.
 */
export function verifyWorkshopEnrollmentTicket(ticketString: string | undefined | null): TicketPayload | null {
  if (!ticketString || typeof ticketString !== 'string') return null;

  const parts = ticketString.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');

  // Comparación en tiempo constante para evitar ataques de timing
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const data = JSON.parse(json) as TicketPayload;

    if (!data.enrollmentId || !data.courseId || typeof data.exp !== 'number') {
      return null;
    }

    if (Date.now() > data.exp) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

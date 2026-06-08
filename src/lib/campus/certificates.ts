import { db } from '@/lib/db';
import { Certificate, CertificateStatus } from '@prisma/client';
import { getCourseProgressStats } from './progress';

/**
 * Verifica si el usuario completó el 100% del curso y, en ese caso, emite el certificado.
 * Si ya existe, retorna el existente.
 */
export async function checkAndIssueCertificate(
  userId: string,
  courseId: string
): Promise<Certificate | null> {
  // 1. Obtener estadísticas del curso
  const stats = await getCourseProgressStats(userId, courseId);
  
  // Si no hay lecciones o no se completó el 100%, no califica para certificado
  if (stats.totalLessons === 0 || stats.completedLessons < stats.totalLessons) {
    return null;
  }

  // 2. Verificar si ya existe un certificado emitido
  const existing = await db.certificate.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
  });

  if (existing) {
    return existing;
  }

  // 3. Obtener datos para el snapshot inmutable
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { title: true },
  });

  if (!user || !course) {
    throw new Error('Usuario o Curso no encontrado al emitir certificado');
  }

  // Sumar duración en minutos de todas las lecciones del curso
  const lessons = await db.lesson.findMany({
    where: {
      module: { courseId },
      isPublished: true,
    },
    select: {
      durationMinutes: true,
    },
  });

  const totalMinutes = lessons.reduce((acc, curr) => acc + (curr.durationMinutes ?? 0), 0);
  const totalHours = totalMinutes > 0 ? Math.ceil(totalMinutes / 60) : null;

  const snapshotName = user.name || user.email.split('@')[0];
  const snapshotCourse = course.title;

  // 4. Crear el certificado en la base de datos
  return db.certificate.create({
    data: {
      userId,
      courseId,
      snapshotName,
      snapshotCourse,
      snapshotHours: totalHours,
      status: CertificateStatus.ISSUED,
    },
  });
}

/**
 * Obtiene el certificado del usuario para un curso si existe.
 */
export async function getCertificate(
  userId: string,
  courseId: string
): Promise<Certificate | null> {
  return db.certificate.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
  });
}

/**
 * Verifica públicamente un certificado por su código (UUID público).
 * Retorna null si no existe o si fue revocado.
 */
export async function verifyCertificate(code: string) {
  const cert = await db.certificate.findUnique({
    where: {
      certificateCode: code,
    },
    include: {
      user: {
        select: {
          name: true,
        },
      },
      course: {
        select: {
          title: true,
        },
      },
    },
  });

  if (!cert || cert.status !== CertificateStatus.ISSUED) {
    return null;
  }

  return cert;
}

/**
 * Revoca un certificado (reservado para administradores).
 */
export async function adminRevokeCertificate(
  certificateId: string
): Promise<Certificate> {
  return db.certificate.update({
    where: { id: certificateId },
    data: {
      status: CertificateStatus.REVOKED,
      revokedAt: new Date(),
    },
  });
}

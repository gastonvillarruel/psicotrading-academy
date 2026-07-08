import { db } from '@/lib/db';
import { Course, Subscription } from '@prisma/client';

export async function verifyStudentAccess(
  userId: string,
  courseId: string,
  userRole: string
): Promise<boolean> {
  try {
    // 1. Los administradores siempre tienen acceso
    if (userRole === 'ADMIN') return true;

    // 2. Comprobar si tiene una suscripción activa
    const activeSubscription = await db.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
    });

    if (activeSubscription) return true;

    // 3. Comprobar si tiene una inscripción registrada
    const enrollment = await db.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    if (enrollment) {
      if (enrollment.status === 'ACTIVE') return true;
      if (enrollment.status === 'REVOKED') return false;
    }

    // 4. Fallback retrocompatible: Comprobar si compró este curso individualmente
    const approvedPurchase = await db.purchase.findFirst({
      where: {
        userId,
        courseId,
        status: 'approved',
      },
    });

    if (approvedPurchase) {
      // Crear inscripción sobre la marcha para curar la consistencia de los datos
      try {
        await db.enrollment.create({
          data: {
            userId,
            courseId,
            purchaseId: approvedPurchase.id,
          },
        });
      } catch (e) {
        // Evitar fallas si otra concurrencia la creó antes
      }
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error al verificar acceso al curso:', error);
    return false;
  }
}

export async function getStudentCoursesAndSubscription(userId: string): Promise<{
  courses: Course[];
  subscription: Subscription | null;
}> {
  try {
    // 1. Verificar si tiene suscripción activa
    const activeSubscription = await db.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    let courses: Course[] = [];
    const hasActiveSubscription = !!activeSubscription;

    if (hasActiveSubscription) {
      // Si tiene suscripción activa, tiene acceso a TODOS los cursos
      // Excluyendo los cursos de suscripción dummy y los no disponibles
      courses = await db.course.findMany({
        where: {
          available: { not: false },
          NOT: [
            { slug: 'suscripcion-mensual' },
            { slug: 'suscripcion-anual' },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // Cargar inscripciones individuales del estudiante
      const enrollments = await db.enrollment.findMany({
        where: {
          userId,
          NOT: [
            { course: { slug: 'suscripcion-mensual' } },
            { course: { slug: 'suscripcion-anual' } },
          ],
        },
        include: {
          course: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const activeEnrollments = enrollments.filter((e) => e.status === 'ACTIVE');
      const revokedCourseIds = new Set(
        enrollments.filter((e) => e.status === 'REVOKED').map((e) => e.courseId)
      );

      const enrolledCourses = activeEnrollments.map((e) => e.course);
      const enrolledIds = new Set(enrolledCourses.map((c) => c.id));

      // Fallback retrocompatible: buscar compras aprobadas (approved) directamente
      const approvedPurchases = await db.purchase.findMany({
        where: {
          userId,
          status: 'approved',
          NOT: [
            { course: { slug: 'suscripcion-mensual' } },
            { course: { slug: 'suscripcion-anual' } },
          ],
        },
        include: {
          course: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const fallbackCourses = approvedPurchases
         .map((p) => p.course)
         .filter((c) => !enrolledIds.has(c.id) && !revokedCourseIds.has(c.id));

      courses = [...enrolledCourses, ...fallbackCourses].filter((c) => c.available !== false);
    }

    // Ordenar los cursos con la lógica personalizada:
    // Primero sortOrder > 0 (ascendente), luego sortOrder = 0/null por createdAt desc
    courses.sort((a, b) => {
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;

      if (orderA > 0 && orderB > 0) {
        return orderA - orderB;
      }
      if (orderA > 0 && orderB <= 0) {
        return -1;
      }
      if (orderA <= 0 && orderB > 0) {
        return 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return {
      courses,
      subscription: activeSubscription,
    };
  } catch (error) {
    console.error('Error al obtener accesos de estudiante:', error);
    return { courses: [], subscription: null };
  }
}

/**
 * Crea una nueva matrícula o restaura una previamente revocada tras un pago aprobado.
 * [SOLUCIÓN TRANSITORIA]
 * Cuando en el futuro se elimine la restricción `@unique([userId, courseId])`,
 * esta lógica deberá reemplazarse por la creación de una nueva matrícula histórica (Enrollment).
 */
export async function createOrRestoreEnrollment({
  userId,
  courseId,
  purchaseId,
  scheduleOptionId,
  prismaClient = db,
}: {
  userId: string;
  courseId: string;
  purchaseId?: string | null;
  scheduleOptionId?: string | null;
  prismaClient?: any;
}) {
  // Buscar si existe matrícula previa para este usuario y curso
  const existing = await prismaClient.enrollment.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
  });

  if (!existing) {
    // Caso 1: No existe ninguna matrícula -> crear una nueva matrícula ACTIVE
    return await prismaClient.enrollment.create({
      data: {
        userId,
        courseId,
        purchaseId: purchaseId || undefined,
        scheduleOptionId: scheduleOptionId || undefined,
        status: 'ACTIVE',
      },
    });
  }

  // Caso 3: Existe una matrícula REVOKED -> restaurar
  if (existing.status === 'REVOKED') {
    return await prismaClient.enrollment.update({
      where: {
        id: existing.id,
      },
      data: {
        status: 'ACTIVE',
        revokedAt: null,
        revokedReason: null,
        purchaseId: purchaseId || existing.purchaseId, // actualizar id de compra si aplica
        scheduleOptionId: scheduleOptionId || existing.scheduleOptionId,
      },
    });
  }

  // Caso 2: Existe una matrícula ACTIVE -> mantener comportamiento actual (no hacer nada)
  return existing;
}

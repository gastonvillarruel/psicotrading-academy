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

    if (enrollment) return true;

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

      const enrolledCourses = enrollments.map((e) => e.course);
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
         .filter((c) => !enrolledIds.has(c.id));

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

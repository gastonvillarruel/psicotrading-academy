import React from 'react';
import { db } from '@/lib/db';
import UsersTable from './UsersTable';

export const dynamic = 'force-dynamic';

async function getUsersWithAccess() {
  try {
    const students = await db.user.findMany({
      where: { role: 'STUDENT' },
      include: {
        purchases: {
          where: { status: 'approved' },
          include: { course: true },
        },
        subscriptions: {
          orderBy: { expiresAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Serializar objetos para que Next.js no dé error al pasarlos al componente de cliente (ej. Prisma Decimal, Date)
    const serializedStudents = students.map((student) => ({
      id: student.id,
      name: student.name,
      email: student.email,
      emailVerified: student.emailVerified ? student.emailVerified.toISOString() : null,
      createdAt: student.createdAt.toISOString(),
      purchases: student.purchases.map((p) => ({
        id: p.id,
        amount: p.amount ? Number(p.amount) : 0,
        currency: p.currency,
        createdAt: p.createdAt.toISOString(),
        course: p.course
          ? {
              title: p.course.title,
              slug: p.course.slug,
            }
          : null,
      })),
      subscriptions: student.subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        plan: s.plan,
        startedAt: s.startedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    }));

    return { students: serializedStudents, now: Date.now() };
  } catch (error) {
    console.error('Error al obtener lista de usuarios en admin:', error);
    return { students: [], now: Date.now() };
  }
}

export default async function AdminUsersPage() {
  const { students: users, now } = await getUsersWithAccess();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Lista de Alumnos</h1>
        <p className="text-gray-500 mt-1">Monitoreá las inscripciones y el estado de membresías de tus estudiantes.</p>
      </div>

      <UsersTable users={users} now={now} />
    </div>
  );
}

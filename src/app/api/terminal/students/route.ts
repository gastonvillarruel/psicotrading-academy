import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isTerminalConfigured, isTerminalRequest } from '@/lib/terminal-sso';

export const dynamic = 'force-dynamic';

// Usuarios de la academia, para que el mentor, desde la terminal de trading,
// elija a quién le activa el acceso. Solo la consulta el servidor de la
// terminal. Van también los ADMIN, con su rol, para vincular al mentor; la
// terminal solo deja activar a los STUDENT.
export async function GET(request: Request) {
  if (!isTerminalConfigured() || !isTerminalRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      timezone: true,
      emailVerified: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      timezone: u.timezone,
      emailVerified: u.emailVerified !== null,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}

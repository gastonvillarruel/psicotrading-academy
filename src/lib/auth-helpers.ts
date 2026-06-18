import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { db } from './db';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { isSingleSessionEnabled } from './auth-config';

export async function getValidatedSession() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user || !session.user.id) {
    return null;
  }

  if (!isSingleSessionEnabled()) {
    return session;
  }

  if (session.error === 'SessionExpired') {
    return session;
  }

  try {
    const dbUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { activeSessionId: true },
    });

    if (!dbUser || dbUser.activeSessionId !== session.user.activeSessionId) {
      session.error = 'SessionExpired';
      session.user.id = '';
      session.user.role = 'STUDENT';
      session.user.emailVerified = null;
      session.user.activeSessionId = null;
    }
  } catch (e) {
    console.error('Error al validar sesión en getValidatedSession:', e);
  }

  return session;
}

export async function requireValidSession() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user || !session.user.id) {
    redirect('/login');
  }

  if (!isSingleSessionEnabled()) {
    return session;
  }

  if (session.error === 'SessionExpired') {
    redirect('/login?error=SessionExpired');
  }

  try {
    const dbUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { activeSessionId: true },
    });

    if (!dbUser || dbUser.activeSessionId !== session.user.activeSessionId) {
      redirect('/login?error=SessionExpired');
    }
  } catch (e) {
    console.error('Error al validar sesión en requireValidSession:', e);
  }

  return session;
}

export async function requireAdminSession() {
  const session = await requireValidSession();

  if (session.user.role !== 'ADMIN') {
    redirect('/mi-campus');
  }

  return session;
}

export async function validateApiSession() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user || !session.user.id) {
    return { isValid: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }), session: null };
  }

  if (!isSingleSessionEnabled()) {
    return { isValid: true, response: null, session };
  }

  if (session.error === 'SessionExpired') {
    return { isValid: false, response: NextResponse.json({ error: 'SessionExpired' }, { status: 401 }), session: null };
  }

  try {
    const dbUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { activeSessionId: true },
    });

    if (!dbUser || dbUser.activeSessionId !== session.user.activeSessionId) {
      return { isValid: false, response: NextResponse.json({ error: 'SessionExpired' }, { status: 401 }), session: null };
    }
  } catch (e) {
    console.error('Error al validar sesión en validateApiSession:', e);
  }

  return { isValid: true, response: null, session };
}

export async function validateApiAdminSession() {
  const { isValid, response, session } = await validateApiSession();

  if (!isValid || !session) {
    return { isValid: false, response };
  }

  if (session.user.role !== 'ADMIN') {
    return { isValid: false, response: NextResponse.json({ error: 'Acceso no autorizado.' }, { status: 401 }) };
  }

  return { isValid: true, response: null, session };
}

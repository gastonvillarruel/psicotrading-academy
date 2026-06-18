import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { isSingleSessionEnabled } from '@/lib/auth-config';

export async function GET() {
  try {
    if (!isSingleSessionEnabled()) {
      return NextResponse.json({ valid: true, enabled: false });
    }

    const session = await getServerSession(authOptions);

    console.log('[ValidateSession API] --- Inicio Validación ---');
    if (!session || !session.user || !session.user.id) {
      console.log('[ValidateSession API] No autenticado (sin sesión o id usuario). Status: 401');
      return NextResponse.json({ valid: false, error: 'NotAuthenticated' }, { status: 401 });
    }

    const userId = session.user.id;
    const tokenSessionId = session.user.activeSessionId;

    console.log(`[ValidateSession API] Usuario detectado: ${userId}`);
    console.log(`[ValidateSession API] activeSessionId del Token: ${tokenSessionId}`);

    if (session.error === 'SessionExpired') {
      console.log('[ValidateSession API] Bandera session.error ya venía como SessionExpired. Status: 401');
      return NextResponse.json({ valid: false, error: 'SessionExpired' }, { status: 401 });
    }

    // Consultar el activeSessionId en base de datos
    const dbUser = await db.user.findUnique({
      where: { id: userId },
      select: { activeSessionId: true },
    });

    const dbSessionId = dbUser?.activeSessionId;
    console.log(`[ValidateSession API] activeSessionId actual en DB: ${dbSessionId}`);

    if (!dbUser || dbSessionId !== tokenSessionId) {
      console.log('[ValidateSession API] No coincide o usuario no existe. Resultado: valid=false. Status: 401');
      return NextResponse.json({ valid: false, error: 'SessionExpired' }, { status: 401 });
    }

    console.log('[ValidateSession API] Sesión válida. Resultado: valid=true. Status: 200');
    return NextResponse.json({ valid: true, enabled: true });
  } catch (error: any) {
    console.error('[ValidateSession API] Error en API validate-session:', error);
    return NextResponse.json({ valid: false, error: 'ErrorInterno' }, { status: 500 });
  }
}

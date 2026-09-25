import { NextResponse, type NextRequest } from 'next/server';
import { getTerminalUrl, isTerminalConfigured } from '@/lib/terminal-sso';

export const dynamic = 'force-dynamic';

// Al pulsar «Salir» en la terminal de trading se cierra también la sesión de la
// academia: si no, en un ordenador compartido el siguiente entraría sin
// contraseña en una cuenta que opera dinero. Vuelve siempre a la terminal.
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(isTerminalConfigured() ? `${getTerminalUrl()}/` : new URL('/', request.url));

  // NextAuth la llama distinto con https (__Secure-) y la parte en trozos
  // (.0, .1…) si no cabe en una sola cookie.
  for (const cookie of request.cookies.getAll()) {
    if (!/^(__Secure-)?next-auth\.session-token(\.\d+)?$/.test(cookie.name)) continue;
    response.cookies.set(cookie.name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      // Una cookie __Secure- solo se puede borrar desde una respuesta Secure.
      secure: cookie.name.startsWith('__Secure-'),
    });
  }

  return response;
}

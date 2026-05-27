import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// NextAuth withAuth espera envolver un middleware estándar. Exportamos como "proxy" para Next.js 16.
export const proxy = withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Verificar si es ruta de administración y restringir si no es ADMIN
    if (path.startsWith('/admin') && token?.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/mi-campus', req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

// Matcher para interceptar accesos
export const config = {
  matcher: ['/mi-campus/:path*', '/admin/:path*', '/checkout/:path*'],
};
export default proxy;

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export const proxy = withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Admin: solo rol ADMIN puede acceder a /admin
    if (path.startsWith('/admin') && token?.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/mi-campus', req.url));
    }

    // Rutas que requieren email verificado (excluyendo admin que ya verificó previamente)
    const requiresVerification = ['/mi-campus', '/perfil', '/checkout'];
    const needsVerification = requiresVerification.some((r) => path.startsWith(r));

    if (needsVerification && token && !token.emailVerified) {
      return NextResponse.redirect(new URL('/confirmar-email-pendiente', req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ['/mi-campus/:path*', '/admin/:path*', '/checkout/:path*', '/perfil/:path*', '/perfil'],
};

export default proxy;

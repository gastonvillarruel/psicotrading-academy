'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function Navbar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push('/');
    router.refresh();
  };

  return (
    <nav className="bg-brand-card/90 backdrop-blur-md border-b border-brand-border/30 sticky top-0 z-50 transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-3 group">
              <img
                src="/brand/logos/logo-solo-oscuro.png"
                alt="PSICOEMOTRADING Logo"
                className="h-8 w-auto object-contain transition-transform duration-200 group-hover:scale-105"
              />
              <span className="text-lg font-black tracking-wider bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary bg-clip-text text-transparent uppercase">
                PSICOEMOTRADING
              </span>
            </Link>
            <div className="hidden sm:ml-10 sm:flex sm:space-x-8">
              <Link
                href="/"
                className="inline-flex items-center px-1 pt-1 text-sm font-medium text-brand-text-muted hover:text-brand-text border-b-2 border-transparent hover:border-brand-primary transition-all duration-200"
              >
                Inicio
              </Link>
              <Link
                href="/campus"
                className="inline-flex items-center px-1 pt-1 text-sm font-medium text-brand-text-muted hover:text-brand-text border-b-2 border-transparent hover:border-brand-primary transition-all duration-200"
              >
                Campus
              </Link>
            </div>
          </div>

          {/* User actions */}
          <div className="hidden sm:flex sm:items-center sm:space-x-4">
            {status === 'loading' ? (
              <div className="h-8 w-20 bg-brand-bg-sec animate-pulse rounded-lg" />
            ) : session ? (
              <>
                {session.user.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    className="text-sm font-semibold text-brand-accent hover:text-brand-accent/90 px-3 py-2 rounded-lg bg-brand-accent/10 hover:bg-brand-accent/20 transition-all"
                  >
                    Admin Panel
                  </Link>
                )}
                <Link
                  href="/mi-campus"
                  className="text-sm font-semibold text-brand-secondary hover:text-brand-secondary/90 px-3 py-2 rounded-lg bg-brand-secondary/10 hover:bg-brand-secondary/20 transition-all"
                >
                  Mi Campus
                </Link>
                <span className="text-sm text-brand-text-muted border-l border-brand-border pl-4 py-1">
                  Hola, <strong className="text-brand-text">{session.user.name || 'Trader'}</strong>
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-brand-text-muted hover:text-brand-text hover:bg-brand-bg-sec px-3 py-2 rounded-lg transition-all"
                >
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-brand-text-muted hover:text-brand-primary px-3 py-2 transition-all"
                >
                  Ingresar
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-medium text-white bg-brand-primary hover:bg-brand-primary/95 px-4 py-2 rounded-lg transition-all shadow-sm active:scale-[0.98]"
                >
                  Registrarse
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-brand-text-muted hover:text-brand-text hover:bg-brand-bg-sec focus:outline-none transition-all"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="sm:hidden bg-brand-card border-b border-brand-border/30 px-2 pt-2 pb-3 space-y-1">
          <Link
            href="/"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-brand-text-muted hover:text-brand-text hover:bg-brand-bg-sec transition-all"
          >
            Inicio
          </Link>
          <Link
            href="/campus"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-brand-text-muted hover:text-brand-text hover:bg-brand-bg-sec transition-all"
          >
            Campus
          </Link>
          {session ? (
            <div className="pt-4 pb-2 border-t border-brand-border/30 mt-2 pl-3">
              <div className="text-sm font-medium text-brand-text">
                Hola, {session.user.name || 'Trader'}
              </div>
              <div className="text-xs font-medium text-brand-text-muted mt-0.5">{session.user.email}</div>
              <div className="mt-3 space-y-1 -ml-3">
                {session.user.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    onClick={() => setIsOpen(false)}
                    className="block px-3 py-2 rounded-md text-base font-medium text-brand-accent hover:bg-brand-accent/10 transition-all"
                  >
                    Admin Panel
                  </Link>
                )}
                <Link
                  href="/mi-campus"
                  onClick={() => setIsOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-brand-secondary hover:bg-brand-secondary/10 transition-all"
                >
                  Mi Campus
                </Link>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left block px-3 py-2 rounded-md text-base font-medium text-brand-text-muted hover:text-brand-text hover:bg-brand-bg-sec transition-all"
                >
                  Cerrar Sesión
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-4 border-t border-brand-border/30 mt-2 flex flex-col space-y-2 px-3">
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className="w-full text-center py-2 text-base font-medium text-brand-text-muted hover:text-brand-primary transition-all"
              >
                Ingresar
              </Link>
              <Link
                href="/register"
                onClick={() => setIsOpen(false)}
                className="w-full text-center py-2 text-base font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary/95 transition-all"
              >
                Registrarse
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

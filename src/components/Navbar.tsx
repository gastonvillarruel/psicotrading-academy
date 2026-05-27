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
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold bg-gradient-to-r from-teal-600 to-teal-700 bg-clip-text text-transparent">
                Psicotrading Academy
              </span>
            </Link>
            <div className="hidden sm:ml-8 sm:flex sm:space-x-6">
              <Link
                href="/"
                className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent hover:border-teal-500 transition-all"
              >
                Inicio
              </Link>
              <Link
                href="/campus"
                className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent hover:border-teal-500 transition-all"
              >
                Campus
              </Link>
            </div>
          </div>

          {/* User actions */}
          <div className="hidden sm:flex sm:items-center sm:space-x-4">
            {status === 'loading' ? (
              <div className="h-8 w-20 bg-gray-100 animate-pulse rounded-lg" />
            ) : session ? (
              <>
                {session.user.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    className="text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 transition-all"
                  >
                    Admin Panel
                  </Link>
                )}
                <Link
                  href="/mi-campus"
                  className="text-sm font-medium text-teal-700 hover:text-teal-800 px-3 py-2 rounded-lg bg-teal-50 hover:bg-teal-100 transition-all"
                >
                  Mi Campus
                </Link>
                <span className="text-sm text-gray-600 border-l border-gray-200 pl-4 py-1">
                  Hola, <strong className="text-gray-900">{session.user.name || 'Trader'}</strong>
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 px-3 py-2 rounded-lg transition-all"
                >
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-700 hover:text-teal-600 px-3 py-2 transition-all"
                >
                  Ingresar
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 px-4 py-2 rounded-xl transition-all shadow-md shadow-teal-600/10 hover:shadow-teal-600/20 active:scale-[0.98]"
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
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none transition-all"
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
        <div className="sm:hidden bg-white border-b border-gray-100 px-2 pt-2 pb-3 space-y-1">
          <Link
            href="/"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-all"
          >
            Inicio
          </Link>
          <Link
            href="/campus"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-all"
          >
            Campus
          </Link>
          {session ? (
            <div className="pt-4 pb-2 border-t border-gray-100 mt-2 pl-3">
              <div className="text-sm font-medium text-gray-900">
                Hola, {session.user.name || 'Trader'}
              </div>
              <div className="text-xs font-medium text-gray-500 mt-0.5">{session.user.email}</div>
              <div className="mt-3 space-y-1 -ml-3">
                {session.user.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    onClick={() => setIsOpen(false)}
                    className="block px-3 py-2 rounded-md text-base font-medium text-amber-600 hover:bg-amber-50 transition-all"
                  >
                    Admin Panel
                  </Link>
                )}
                <Link
                  href="/mi-campus"
                  onClick={() => setIsOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-teal-600 hover:bg-teal-50 transition-all"
                >
                  Mi Campus
                </Link>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left block px-3 py-2 rounded-md text-base font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all"
                >
                  Cerrar Sesión
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-4 border-t border-gray-100 mt-2 flex flex-col space-y-2 px-3">
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className="w-full text-center py-2 text-base font-medium text-gray-700 hover:text-teal-600 transition-all"
              >
                Ingresar
              </Link>
              <Link
                href="/register"
                onClick={() => setIsOpen(false)}
                className="w-full text-center py-2 text-base font-medium text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition-all"
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

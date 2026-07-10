import React from 'react';
import Link from 'next/link';
import { requireAdminSession } from '@/lib/auth-helpers';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSession();
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row gap-8">
      {/* Sidebar de navegación */}
      <aside className="w-full md:w-64 flex-shrink-0">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm sticky top-24">
          <span className="text-xs text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded-md uppercase tracking-wider block w-max mb-6">
            Administrador
          </span>
          <nav className="space-y-1.5">
            <Link
              href="/admin"
              className="block px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-teal-600 transition-colors"
            >
              Dashboard General
            </Link>
            <Link
              href="/admin/courses"
              className="block px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-teal-600 transition-colors"
            >
              Gestión de Cursos
            </Link>
            <Link
              href="/admin/users"
              className="block px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-teal-600 transition-colors"
            >
              Lista de Alumnos
            </Link>
            <Link
              href="/admin/payments"
              className="block px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-teal-600 transition-colors"
            >
              Auditoría de Pagos
            </Link>
            <Link
              href="/admin#inscripcion-manual"
              className="block px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-teal-600 transition-colors"
            >
              Inscripción Manual
            </Link>
          </nav>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-grow flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}

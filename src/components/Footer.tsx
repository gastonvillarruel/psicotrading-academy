import React from 'react';
import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-100 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <div>
            <span className="text-base font-bold text-gray-900">Psicotrading Academy</span>
            <p className="text-sm text-gray-500 mt-1">
              Desarrollando la disciplina de los traders del futuro.
            </p>
          </div>
          <div className="flex space-x-6">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Inicio
            </Link>
            <Link href="/campus" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Cursos
            </Link>
            <span className="text-sm text-gray-400">
              © {currentYear} Todos los derechos reservados.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

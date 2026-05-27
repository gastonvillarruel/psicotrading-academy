import React from 'react';
import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-brand-card border-t border-brand-border/30 py-10 mt-auto transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <img
                src="/brand/logos/logo-solo-oscuro.png"
                alt="PSICOEMOTRADING Logo"
                className="h-6 w-auto object-contain"
              />
              <span className="text-sm font-extrabold tracking-wider text-brand-text uppercase">PSICOEMOTRADING</span>
            </div>
            <p className="text-sm text-brand-text-muted max-w-md">
              Entrenamiento psicológico y acompañamiento para la consistencia y el desarrollo de disciplina operativa en trading.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/" className="text-sm text-brand-text-muted hover:text-brand-primary transition-colors">
              Inicio
            </Link>
            <Link href="/campus" className="text-sm text-brand-text-muted hover:text-brand-primary transition-colors">
              Campus/Cursos
            </Link>
            <span className="text-sm text-brand-text-muted/60">
              © {currentYear} Todos los derechos reservados.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

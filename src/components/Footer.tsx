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
          <div className="flex flex-col items-center md:items-end space-y-4">
            <div className="flex flex-wrap items-center gap-6 justify-center md:justify-end">
              <Link href="/" className="text-sm text-brand-text-muted hover:text-brand-primary transition-colors">
                Inicio
              </Link>
              <Link href="/quienes-somos" className="text-sm text-brand-text-muted hover:text-brand-primary transition-colors">
                ¿Quiénes somos?
              </Link>
              <span className="text-sm text-brand-text-muted/60">
                © {currentYear} Todos los derechos reservados.
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <a href="https://t.me/fullpsicoytrading" target="_blank" rel="noopener noreferrer" className="text-brand-text-muted hover:text-brand-primary transition-colors" aria-label="Telegram">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-1-.65-.35-1 .22-1.62.15-.15 2.72-2.5 2.77-2.7.01-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.11.02-1.88 1.19-5.31 3.51-.5.35-.95.52-1.35.51-.44-.01-1.29-.25-1.92-.45-.77-.25-1.39-.39-1.34-.83.03-.23.35-.47.97-.71 3.79-1.65 6.32-2.74 7.59-3.27 3.61-1.5 4.36-1.76 4.85-1.77.11 0 .35.03.5.16.13.12.17.29.18.41.01.07.01.21-.01.29z" />
                </svg>
              </a>
              <a href="https://www.tiktok.com/@elgonzotrader" target="_blank" rel="noopener noreferrer" className="text-brand-text-muted hover:text-brand-primary transition-colors" aria-label="TikTok">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.86-.74-3.99-1.72-.08-.07-.17-.17-.25-.26V14c0 2.22-.88 4.36-2.47 5.92-1.6 1.57-3.83 2.44-6.07 2.4-2.23-.03-4.39-.93-5.94-2.52-1.54-1.58-2.39-3.77-2.34-6 0-2.23.89-4.37 2.49-5.93C5.79 6.3 8.04 5.43 10.3 5.47c1.08.02 2.15.26 3.12.75V10.3c-.92-.6-2.03-.9-3.12-.85-1.5.07-2.93.81-3.76 2.07-.82 1.25-.97 2.87-.39 4.25.58 1.38 1.92 2.36 3.42 2.52 1.5.17 3.06-.39 3.91-1.64.44-.65.65-1.43.62-2.21l.01-14.42z" />
                </svg>
              </a>
              <a href="https://www.youtube.com/@elgonzotrader" target="_blank" rel="noopener noreferrer" className="text-brand-text-muted hover:text-brand-primary transition-colors" aria-label="YouTube">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.163a3.003 3.003 0 00-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 00-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 002.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.002 3.002 0 002.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
              <a href="https://www.instagram.com/elgonzotrader" target="_blank" rel="noopener noreferrer" className="text-brand-text-muted hover:text-brand-primary transition-colors" aria-label="Instagram">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
              <a href="https://x.com/elgonzotrader" target="_blank" rel="noopener noreferrer" className="text-brand-text-muted hover:text-brand-primary transition-colors" aria-label="X">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

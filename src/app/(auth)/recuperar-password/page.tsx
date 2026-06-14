'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { requestPasswordReset } from '@/app/actions/password-reset';

const emailSchema = z.string().email('Por favor, ingresá un email válido.');

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0].message);
      return;
    }

    setIsLoading(true);
    try {
      await requestPasswordReset(email);
    } finally {
      setIsLoading(false);
      // Siempre mostrar el mensaje genérico, independientemente del resultado
      setSubmitted(true);
    }
  };

  return (
    <main className="min-h-[calc(100vh-140px)] bg-brand-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="bg-brand-card rounded-xl shadow-sm border border-brand-border/30 p-8">
          <div className="text-center mb-7">
            <h1 className="text-3xl font-extrabold text-brand-text tracking-tight">
              Recuperar contraseña
            </h1>
            <p className="text-brand-text-muted mt-2 text-sm">
              Ingresá tu email y te enviaremos instrucciones
            </p>
          </div>

          {submitted ? (
            <div className="text-center space-y-5">
              {/* Ícono de sobre */}
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-brand-secondary/10 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-brand-secondary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-brand-text font-semibold text-base leading-relaxed">
                Si el email existe en nuestra plataforma, te enviaremos instrucciones para restablecer tu contraseña.
              </p>
              <p className="text-brand-text-muted text-sm">
                Revisá tu bandeja de entrada y también la carpeta de spam.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} method="POST" className="space-y-4">
              <div>
                <label
                  className="block text-sm font-bold text-brand-text mb-1.5"
                  htmlFor="reset-email"
                >
                  Email
                </label>
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldError) setFieldError(null);
                  }}
                  placeholder="ejemplo@correo.com"
                  disabled={isLoading}
                  className="w-full px-4 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
                />
                {fieldError && (
                  <p className="mt-1.5 text-xs text-brand-error">{fieldError}</p>
                )}
              </div>

              <button
                type="submit"
                id="btn-enviar-instrucciones"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg shadow-sm hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center mt-2"
              >
                {isLoading ? (
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  'Enviar instrucciones'
                )}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm text-brand-text-muted">
            <Link
              href="/login"
              className="font-bold text-brand-secondary hover:text-brand-primary transition-colors"
            >
              ← Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

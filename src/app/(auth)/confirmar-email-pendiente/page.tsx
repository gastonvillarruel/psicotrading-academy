'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { resendVerificationEmail } from '@/app/actions/email-verification';

export default function ConfirmarEmailPendientePage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await resendVerificationEmail(email);
      if (res.success) {
        setSuccess(true);
      } else {
        setError(res.error || 'No se pudo enviar el email.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-140px)] bg-brand-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="bg-brand-card rounded-xl shadow-sm border border-brand-border/30 p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <h1 className="text-2xl font-extrabold text-brand-text mb-3">Confirmá tu email</h1>
          <p className="text-brand-text-muted text-sm leading-relaxed mb-6">
            Para acceder al campus necesitás confirmar tu dirección de email.
            Ingresá tu email y te enviamos un nuevo link de verificación.
          </p>

          {success ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-700 text-sm font-semibold">
                ✓ Email enviado. Revisá tu bandeja de entrada (y la carpeta de spam).
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-brand-error/10 text-brand-error rounded-lg text-sm border border-brand-error/20">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4 mb-6">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Tu dirección de email"
                  disabled={isLoading}
                  className="w-full px-4 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
                />
                <button
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full py-3 px-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg shadow-sm hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center"
                >
                  {isLoading ? (
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    'Reenviar email de confirmación'
                  )}
                </button>
              </form>
            </>
          )}

          <div className="space-y-2 text-sm text-brand-text-muted">
            <p>
              <Link href="/login" className="font-bold text-brand-secondary hover:text-brand-primary transition-colors">
                Volver al login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

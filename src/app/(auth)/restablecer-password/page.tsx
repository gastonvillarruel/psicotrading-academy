'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { resetPassword } from '@/app/actions/password-reset';

const passwordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sin token en la URL → mostrar error inmediato
  if (!token) {
    return (
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="bg-brand-card rounded-xl shadow-sm border border-brand-border/30 p-8 text-center space-y-5">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-brand-error/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-brand-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-brand-text">Link inválido</h1>
          <p className="text-brand-text-muted text-sm">
            El link de recuperación no es válido. Solicitá uno nuevo.
          </p>
          <Link
            href="/recuperar-password"
            className="inline-block w-full py-3 px-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg transition-all text-center"
          >
            Solicitar nuevo link
          </Link>
        </div>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = passwordSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setIsLoading(true);
    try {
      const result = await resetPassword(token, formData.password, formData.confirmPassword);
      if (result.success) {
        router.push('/login?reset=success');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Ocurrió un error inesperado. Por favor, intentá de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md animate-fade-in-up">
      <div className="bg-brand-card rounded-xl shadow-sm border border-brand-border/30 p-8">
        <div className="text-center mb-7">
          <h1 className="text-3xl font-extrabold text-brand-text tracking-tight">
            Nueva contraseña
          </h1>
          <p className="text-brand-text-muted mt-2 text-sm">
            Elegí una contraseña segura para tu cuenta
          </p>
        </div>

        {error && (
          <div className="mb-5 p-4 bg-brand-error/10 text-brand-error rounded-lg text-sm border border-brand-error/20">
            <p>{error}</p>
            {(error.includes('expiró') || error.includes('válido')) && (
              <div className="mt-3">
                <Link
                  href="/recuperar-password"
                  className="text-xs font-bold underline underline-offset-2 text-brand-error hover:opacity-75 transition-opacity"
                >
                  Solicitar un nuevo link
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} method="POST" className="space-y-4">
          {/* Nueva contraseña */}
          <div>
            <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="new-password">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                id="new-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="Mínimo 8 caracteres"
                disabled={isLoading}
                className="w-full pl-4 pr-11 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-500 transition-colors focus:outline-none"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Confirmar contraseña */}
          <div>
            <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="confirm-password">
              Confirmar contraseña
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Repetí la contraseña"
                disabled={isLoading}
                className="w-full pl-4 pr-11 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                disabled={isLoading}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-500 transition-colors focus:outline-none"
                aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showConfirm ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            id="btn-guardar-password"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg shadow-sm hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center mt-2"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              'Guardar nueva contraseña'
            )}
          </button>
        </form>

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
  );
}

export default function RestablecerPasswordPage() {
  return (
    <main className="min-h-[calc(100vh-140px)] bg-brand-bg flex items-center justify-center p-4">
      <Suspense fallback={
        <div className="w-full max-w-md bg-brand-card rounded-xl shadow-sm border border-brand-border/30 flex justify-center py-16">
          <svg className="animate-spin h-8 w-8 text-brand-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      }>
        <ResetForm />
      </Suspense>
    </main>
  );
}

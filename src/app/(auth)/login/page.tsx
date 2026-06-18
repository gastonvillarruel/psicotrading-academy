'use client';

import React, { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { resendVerificationEmail } from '@/app/actions/email-verification';

const loginSchema = z.object({
  email: z.string().email('Por favor, ingresá un email válido.'),
  password: z.string().min(1, 'La contraseña es requerida.'),
});

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Limpiar callbackUrl si apunta al login o contiene SessionExpired para evitar bucles
  let cleanCallbackUrl = '/mi-campus';
  const rawCallback = searchParams.get('callbackUrl');
  if (rawCallback && !rawCallback.includes('/login') && !rawCallback.includes('error=SessionExpired')) {
    cleanCallbackUrl = rawCallback;
  }
  const callbackUrl = cleanCallbackUrl;
  const resetSuccess = searchParams.get('reset') === 'success';

  const isSessionExpired = searchParams.get('error') === 'SessionExpired';

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmailUnverified, setIsEmailUnverified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) { setError(null); setIsEmailUnverified(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setIsEmailUnverified(false);
    setResendSuccess(false);

    // Limpiar síncronamente el parámetro de error de la URL del navegador al enviar
    if (isSessionExpired) {
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch (err) {}
    }

    try {
      loginSchema.parse(formData);

      const result = await signIn('credentials', {
        redirect: false,
        email: formData.email,
        password: formData.password,
      });

      if (result?.error) {
        if (result.error === 'EMAIL_NOT_VERIFIED') {
          setIsEmailUnverified(true);
          setError('Confirmá tu email antes de ingresar. Revisá tu bandeja de entrada.');
        } else {
          setError(result.error);
        }
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
      } else {
        setError('Ocurrió un error inesperado. Por favor, intentá de nuevo.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      const res = await resendVerificationEmail(formData.email);
      if (res.success) {
        setResendSuccess(true);
        setError(null);
      } else {
        setError(res.error || 'No se pudo reenviar el email.');
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    await signIn('google', { callbackUrl });
  };

  return (
    <div className="w-full max-w-md animate-fade-in-up">
      <div className="bg-brand-card rounded-xl shadow-sm border border-brand-border/30 p-8">
        <div className="text-center mb-7">
          <h1 className="text-3xl font-extrabold text-brand-text tracking-tight">Iniciar Sesión</h1>
          <p className="text-brand-text-muted mt-2 text-sm">Accedé a tu campus de PSICOEMOTRADING</p>
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading || isLoading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-brand-border/60 rounded-lg text-sm font-semibold text-brand-text hover:bg-brand-bg-sec transition-all disabled:opacity-50 mb-5"
        >
          {isGoogleLoading ? (
            <svg className="animate-spin h-4 w-4 text-brand-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          Continuar con Google
        </button>

        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-brand-border/40" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-3 bg-brand-card text-brand-text-muted">o ingresá con email</span>
          </div>
        </div>

        {/* Banner sesión expirada (otro dispositivo) */}
        {isSessionExpired && (
          <div className="mb-5 p-4 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-lg text-sm border border-amber-500/20">
            <p className="font-semibold">⚠️ Tu cuenta inició sesión en otro dispositivo. Volvé a ingresar para continuar.</p>
          </div>
        )}

        {/* Banner reset exitoso */}
        {resetSuccess && (
          <div className="mb-5 p-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-lg text-sm border border-emerald-500/20">
            <p className="font-semibold">✓ Tu contraseña fue actualizada. Ya podés iniciar sesión.</p>
          </div>
        )}

        {/* Error / Unverified email banner */}
        {error && (
          <div className="mb-5 p-4 bg-brand-error/10 text-brand-error rounded-lg text-sm border border-brand-error/20">
            <p>{error}</p>
            {isEmailUnverified && formData.email && (
              <div className="mt-3">
                {resendSuccess ? (
                  <p className="text-brand-secondary font-semibold text-xs">
                    ✓ Email reenviado. Revisá tu bandeja de entrada.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isResending}
                    className="text-xs font-bold underline underline-offset-2 text-brand-error hover:opacity-75 transition-opacity disabled:opacity-50"
                  >
                    {isResending ? 'Enviando...' : 'Reenviar email de confirmación'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} method="POST" className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="ejemplo@correo.com"
              disabled={isLoading}
              className="w-full px-4 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-bold text-brand-text" htmlFor="password">
                Contraseña
              </label>
              <Link
                href="/recuperar-password"
                className="text-xs text-brand-text-muted hover:text-brand-primary transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                disabled={isLoading}
                className="w-full pl-4 pr-11 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-500 transition-colors focus:outline-none"
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

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg shadow-sm hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center mt-2"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-brand-text-muted">
          ¿No tenés cuenta?{' '}
          <Link href="/register" className="font-bold text-brand-secondary hover:text-brand-primary transition-colors">
            Registrate acá
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
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
        <LoginForm />
      </Suspense>
    </main>
  );
}

'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { registerUser } from '@/app/actions/register';

const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
  email: z.string().email('Por favor, ingresá un email válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  confirmPassword: z.string().min(1, 'Confirmá tu contraseña.'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmPassword'],
});

type Step = 'form' | 'success';

function RegisterForm() {
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get('callbackUrl');
  let cleanCallbackUrl = '/mi-campus';
  if (rawCallback && !rawCallback.includes('/register') && !rawCallback.includes('/login') && !rawCallback.includes('error=SessionExpired')) {
    cleanCallbackUrl = rawCallback;
  }
  const callbackUrl = cleanCallbackUrl;
  const loginUrl = `/login${rawCallback ? `?callbackUrl=${encodeURIComponent(rawCallback)}` : ''}`;

  const [step, setStep] = useState<Step>('form');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [emailSent, setEmailSent] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (globalError) setGlobalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});
    setGlobalError(null);

    // Validación cliente
    const result = registerSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      setIsLoading(false);
      return;
    }

    try {
      const res = await registerUser(formData);

      if (!res.success) {
        setGlobalError(res.error || 'Error al registrarse.');
        setIsLoading(false);
        return;
      }

      setRegisteredEmail(formData.email);
      setEmailSent((res as any).emailSent !== false);
      setStep('success');
    } catch {
      setGlobalError('Ocurrió un error inesperado. Por favor, intentá de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    await signIn('google', { callbackUrl });
  };

  if (step === 'success') {
    return (
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="bg-brand-card rounded-xl shadow-sm border border-brand-border/30 p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-brand-primary/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-brand-text mb-3">¡Revisá tu email!</h1>
          {emailSent ? (
            <>
              <p className="text-brand-text-muted text-sm leading-relaxed mb-2">
                Te enviamos un link de confirmación a:
              </p>
              <p className="font-bold text-brand-primary mb-5 break-all">{registeredEmail}</p>
              <p className="text-brand-text-muted text-sm leading-relaxed mb-6">
                Hacé clic en el link del email para activar tu cuenta. El link expira en 24 horas.
              </p>
            </>
          ) : (
            <>
              <p className="text-brand-text-muted text-sm leading-relaxed mb-4">
                Tu cuenta fue creada. Sin embargo, el sistema de emails no está configurado en este momento.
                Contactá al administrador para activar tu cuenta.
              </p>
              <p className="font-bold text-brand-primary mb-6 break-all">{registeredEmail}</p>
            </>
          )}
          <div className="space-y-3">
            <Link
              href={loginUrl}
              className="block w-full py-3 px-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg text-sm text-center transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            >
              Ir al login
            </Link>
            <p className="text-xs text-brand-text-muted">
              ¿No llegó el email?{' '}
              <Link href="/confirmar-email-pendiente" className="font-bold text-brand-secondary hover:text-brand-primary transition-colors">
                Reenviarlo
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md animate-fade-in-up">
      <div className="bg-brand-card rounded-xl shadow-sm border border-brand-border/30 p-8">
        <div className="text-center mb-7">
          <h1 className="text-3xl font-extrabold text-brand-text tracking-tight">Creá tu Cuenta</h1>
          <p className="text-brand-text-muted mt-2 text-sm">Comenzá tu camino en PSICOEMOTRADING</p>
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
            <span className="px-3 bg-brand-card text-brand-text-muted">o registrate con email</span>
          </div>
        </div>

        {globalError && (
          <div className="mb-5 p-4 bg-brand-error/10 text-brand-error rounded-lg text-sm border border-brand-error/20">
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="name">
              Nombre completo
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="Juan Pérez"
              disabled={isLoading}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm bg-transparent ${errors.name ? 'border-brand-error' : 'border-brand-border/60'}`}
            />
            {errors.name && <p className="mt-1 text-xs text-brand-error">{errors.name}</p>}
          </div>

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
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm bg-transparent ${errors.email ? 'border-brand-error' : 'border-brand-border/60'}`}
            />
            {errors.email && <p className="mt-1 text-xs text-brand-error">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="password">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="Mínimo 8 caracteres"
                disabled={isLoading}
                className={`w-full pl-4 pr-11 py-3 border rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm bg-transparent ${errors.password ? 'border-brand-error' : 'border-brand-border/60'}`}
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
            {errors.password && <p className="mt-1 text-xs text-brand-error">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="confirmPassword">
              Confirmá tu contraseña
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Repetí tu contraseña"
                disabled={isLoading}
                className={`w-full pl-4 pr-11 py-3 border rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm bg-transparent ${errors.confirmPassword ? 'border-brand-error' : 'border-brand-border/60'}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isLoading}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-500 transition-colors focus:outline-none"
              >
                {showConfirmPassword ? (
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
            {errors.confirmPassword && <p className="mt-1 text-xs text-brand-error">{errors.confirmPassword}</p>}
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
              'Crear cuenta'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-brand-text-muted">
          ¿Ya tenés cuenta?{' '}
          <Link href={loginUrl} className="font-bold text-brand-secondary hover:text-brand-primary transition-colors">
            Iniciá sesión acá
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
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
        <RegisterForm />
      </Suspense>
    </main>
  );
}

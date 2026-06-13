'use client';

import React, { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Por favor, ingresá un email válido.'),
  password: z.string().min(1, 'La contraseña es requerida.'),
});

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/mi-campus';

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Validar con Zod
      loginSchema.parse(formData);

      const result = await signIn('credentials', {
        redirect: false,
        email: formData.email,
        password: formData.password,
      });

      if (result?.error) {
        setError(result.error);
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

  return (
    <div className="w-full max-w-md p-8 bg-brand-card rounded-xl shadow-sm border border-brand-border/30 transition-all duration-200 animate-fade-in-up">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-brand-text tracking-tight">Iniciar Sesión</h1>
        <p className="text-brand-text-muted mt-2">Accedé a tu campus de PSICOEMOTRADING</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-brand-error/10 text-brand-error rounded-lg text-sm border border-brand-error/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} method="POST" className="space-y-5">
        <div>
          <label className="block text-sm font-bold text-brand-text mb-2" htmlFor="email">
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
          <label className="block text-sm font-bold text-brand-text mb-2" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            value={formData.password}
            onChange={handleChange}
            placeholder="••••••••"
            disabled={isLoading}
            className="w-full px-4 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg shadow-sm hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center cursor-pointer"
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

      <div className="mt-8 text-center text-sm text-brand-text-muted">
        ¿No tenés cuenta?{' '}
        <Link href="/register" className="font-bold text-brand-secondary hover:text-brand-primary transition-colors">
          Registrate acá
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-[calc(100vh-140px)] bg-brand-bg flex items-center justify-center p-4">
      <Suspense fallback={
        <div className="w-full max-w-md p-8 bg-brand-card rounded-xl shadow-sm border border-brand-border/30 flex justify-center py-16">
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

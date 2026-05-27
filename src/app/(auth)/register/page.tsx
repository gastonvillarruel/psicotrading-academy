'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { z } from 'zod';
import { registerUser } from '@/app/actions/register';

const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
  email: z.string().email('Por favor, ingresá un email válido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
});

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
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
      // Validar con Zod en cliente
      registerSchema.parse(formData);

      // Llamar a Server Action
      const result = await registerUser(formData);

      if (!result.success) {
        setError(result.error || 'Ocurrió un error al registrarse.');
        setIsLoading(false);
      } else {
        // Autologueo tras registro exitoso
        const loginResult = await signIn('credentials', {
          redirect: false,
          email: formData.email,
          password: formData.password,
        });

        if (loginResult?.error) {
          setError('Cuenta creada, pero hubo un problema al iniciar sesión automáticamente. Por favor, ingresá manualmente.');
          router.push('/login');
        } else {
          router.push('/mi-campus');
          router.refresh();
        }
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
      } else {
        setError('Ocurrió un error inesperado. Por favor, intentá de nuevo.');
      }
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-brand-bg flex items-center justify-center p-4 transition-all duration-200">
      <div className="w-full max-w-md p-8 bg-brand-card rounded-xl shadow-sm border border-brand-border/30 animate-fade-in-up">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-brand-text tracking-tight">Creá tu Cuenta</h1>
          <p className="text-brand-text-muted mt-2">Comenzá tu camino en PSICOEMOTRADING hoy mismo</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-brand-error/10 text-brand-error rounded-lg text-sm border border-brand-error/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2" htmlFor="name">
              Nombre Completo
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
              className="w-full px-4 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
            />
          </div>

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
              placeholder="Mínimo 6 caracteres"
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
              'Registrarse'
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-brand-text-muted">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="font-bold text-brand-secondary hover:text-brand-primary transition-colors">
            Iniciá sesión acá
          </Link>
        </div>
      </div>
    </main>
  );
}

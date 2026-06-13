'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmail } from '@/app/actions/email-verification';

type Status = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('El link de verificación no es válido.');
      return;
    }

    verifyEmail(token).then((result) => {
      if (result.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(result.error);
      }
    });
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="text-center">
        <svg className="animate-spin h-10 w-10 text-brand-primary mx-auto mb-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-brand-text-muted text-sm">Verificando tu email...</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-brand-text mb-3">¡Email confirmado!</h1>
        <p className="text-brand-text-muted text-sm leading-relaxed mb-6">
          Tu cuenta fue activada correctamente. Ya podés acceder a tu campus.
        </p>
        <Link
          href="/login"
          className="inline-block py-3 px-8 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg text-sm transition-all hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-brand-error/10 flex items-center justify-center">
        <svg className="w-8 h-8 text-brand-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 className="text-2xl font-extrabold text-brand-text mb-3">Link inválido o expirado</h1>
      <p className="text-brand-text-muted text-sm leading-relaxed mb-6">{errorMsg}</p>
      <div className="space-y-3">
        <Link
          href="/confirmar-email-pendiente"
          className="block py-3 px-8 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg text-sm text-center transition-all hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Pedir un nuevo link
        </Link>
        <Link href="/login" className="block text-sm text-brand-text-muted hover:text-brand-primary transition-colors">
          Volver al login
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="min-h-[calc(100vh-140px)] bg-brand-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="bg-brand-card rounded-xl shadow-sm border border-brand-border/30 p-8">
          <Suspense fallback={
            <div className="text-center">
              <svg className="animate-spin h-10 w-10 text-brand-primary mx-auto" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          }>
            <VerifyEmailContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

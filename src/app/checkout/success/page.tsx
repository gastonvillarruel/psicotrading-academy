'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function SuccessPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const provider = searchParams.get('provider');
  const token = searchParams.get('token'); // PayPal Order ID

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    provider === 'paypal' && token ? 'loading' : 'success'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (provider === 'paypal' && token) {
      // Capturar orden de PayPal desde backend
      const capturePayPalPayment = async () => {
        try {
          const response = await fetch('/api/checkout/paypal/capture', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ orderId: token }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Error al procesar la captura de PayPal.');
          }

          setStatus('success');
        } catch (err: any) {
          console.error(err);
          setErrorMsg(err.message || 'La captura del pago falló. Contactá a soporte.');
          setStatus('error');
        }
      };

      capturePayPalPayment();
    }
  }, [provider, token]);

  if (status === 'loading') {
    return (
      <div className="text-center py-20 space-y-6">
        <svg className="animate-spin h-10 w-10 text-brand-primary mx-auto" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <h2 className="text-xl font-bold text-brand-text">Confirmando tu pago con PayPal...</h2>
        <p className="text-sm text-brand-text-muted">Por favor no cierres ni recargues esta ventana.</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-brand-card rounded-2xl border border-brand-border/30 p-8 shadow-md text-center max-w-xl mx-auto space-y-6">
        <div className="h-14 w-14 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-brand-text">Hubo un problema con la confirmación</h1>
        <p className="text-sm text-brand-text-muted leading-relaxed">
          {errorMsg || 'El pago fue procesado pero no logramos validarlo automáticamente. Por favor coordiná con soporte para habilitar tu acceso.'}
        </p>
        <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/mi-campus"
            className="px-6 py-3 bg-brand-bg-sec hover:bg-brand-bg-sec/85 text-brand-text text-sm font-semibold rounded-xl transition-all"
          >
            Ir a Mi Campus
          </Link>
          <a
            href="https://wa.me/5491136458514?text=Hola,%20tuve%20un%20problema%20validando%20mi%20pago%20con%20PayPal."
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-all"
          >
            Soporte por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-brand-card rounded-2xl border border-brand-border/30 p-8 md:p-12 shadow-md text-center max-w-xl mx-auto space-y-6">
      <div className="h-16 w-16 bg-teal-500/10 text-teal-500 rounded-full flex items-center justify-center mx-auto animate-bounce">
        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-bold tracking-widest text-brand-primary uppercase block">Inscripción Exitosa</span>
        <h1 className="text-3xl font-black text-brand-text">¡Felicitaciones!</h1>
      </div>

      <p className="text-sm text-brand-text-muted leading-relaxed max-w-sm mx-auto">
        Tu pago ha sido confirmado. Ya tenés acceso completo al material del programa desde tu campus virtual.
      </p>

      <div className="pt-6 border-t border-brand-border/10">
        <Link
          href="/mi-campus"
          className="px-8 py-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-bold rounded-xl text-center block transition-all shadow-md shadow-brand-primary/10 active:scale-[0.98]"
        >
          Ingresar al Campus
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <main className="min-h-screen bg-brand-bg py-24 flex items-center justify-center px-4">
      <Suspense fallback={
        <div className="text-center py-20">
          <svg className="animate-spin h-8 w-8 text-brand-primary mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      }>
        <SuccessPageContent />
      </Suspense>
    </main>
  );
}

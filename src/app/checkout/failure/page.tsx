'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function FailurePageContent() {
  const searchParams = useSearchParams();
  const provider = searchParams.get('provider');
  const purchaseId = searchParams.get('purchaseId');

  return (
    <div className="bg-brand-card rounded-2xl border border-brand-border/30 p-8 md:p-12 shadow-md text-center max-w-xl mx-auto space-y-6">
      <div className="h-16 w-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-bold tracking-widest text-red-500 uppercase block">Pago Fallido o Cancelado</span>
        <h1 className="text-3xl font-black text-brand-text">No pudimos procesar tu pago</h1>
      </div>

      <p className="text-sm text-brand-text-muted leading-relaxed max-w-sm mx-auto font-light">
        El proceso de pago fue cancelado o rechazado por la pasarela de pagos. No se ha realizado ningún cargo a tu cuenta.
      </p>

      <div className="pt-6 border-t border-brand-border/10 flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href={`/checkout?purchaseId=${purchaseId || ''}`}
          className="px-6 py-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-bold rounded-xl text-center block transition-all shadow-md shadow-brand-primary/10 active:scale-[0.98] flex-1"
        >
          Intentar Nuevamente
        </Link>
        <a
          href="https://wa.me/5491136458514?text=Hola,%20tuve%20un%20problema%20al%20realizar%20el%20pago%20de%20mi%20inscripción."
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-center block transition-all shadow-md active:scale-[0.98] flex-1"
        >
          Soporte WhatsApp
        </a>
      </div>
    </div>
  );
}

export default function CheckoutFailurePage() {
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
        <FailurePageContent />
      </Suspense>
    </main>
  );
}

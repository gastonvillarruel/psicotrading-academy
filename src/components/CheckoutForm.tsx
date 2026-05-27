'use client';

import React, { useState } from 'react';

interface CheckoutFormProps {
  courseId?: string;
  plan?: 'MONTHLY' | 'ANNUAL';
  title: string;
  price: number;
}

export default function CheckoutForm({ courseId, plan, price }: CheckoutFormProps) {
  const [provider, setProvider] = useState<'mercadopago' | 'stripe'>('mercadopago');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePayment = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId,
          plan,
          provider,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al procesar el checkout');
      }

      // Redirigir al checkout del proveedor externo
      window.location.href = data.url;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudo iniciar el proceso de pago. Intentá de nuevo.');
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-brand-card rounded-xl border border-brand-border/30 p-8 shadow-sm max-w-xl mx-auto transition-all duration-200">
      <h2 className="text-xl font-bold text-brand-text mb-6">Paso 1: Seleccioná tu método de pago</h2>

      {error && (
        <div className="mb-6 p-4 bg-brand-error/10 text-brand-error rounded-lg text-sm border border-brand-error/20">
          {error}
        </div>
      )}

      {/* Selectores de Pasarela */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* MercadoPago */}
        <button
          type="button"
          onClick={() => setProvider('mercadopago')}
          disabled={isLoading}
          className={`p-6 rounded-lg border-2 text-left flex flex-col justify-between transition-all cursor-pointer ${
            provider === 'mercadopago'
              ? 'border-brand-primary bg-brand-primary/5'
              : 'border-brand-border/40 hover:border-brand-border bg-transparent'
          }`}
        >
          <span className="text-sm font-bold text-brand-text">MercadoPago</span>
          <span className="text-xs text-brand-text-muted mt-1 leading-relaxed">Tarjetas locales, Dinero en cuenta y cuotas (Argentina).</span>
          <span className={`h-5 w-5 rounded-full border flex items-center justify-center mt-4 ${
            provider === 'mercadopago' ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-border/80'
          }`}>
            {provider === 'mercadopago' && (
              <span className="h-2 w-2 rounded-full bg-white" />
            )}
          </span>
        </button>

        {/* Stripe */}
        <button
          type="button"
          onClick={() => setProvider('stripe')}
          disabled={isLoading}
          className={`p-6 rounded-lg border-2 text-left flex flex-col justify-between transition-all cursor-pointer ${
            provider === 'stripe'
              ? 'border-brand-primary bg-brand-primary/5'
              : 'border-brand-border/40 hover:border-brand-border bg-transparent'
          }`}
        >
          <span className="text-sm font-bold text-brand-text">Stripe</span>
          <span className="text-xs text-brand-text-muted mt-1 leading-relaxed">Tarjetas de crédito internacionales y billeteras virtuales.</span>
          <span className={`h-5 w-5 rounded-full border flex items-center justify-center mt-4 ${
            provider === 'stripe' ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-border/80'
          }`}>
            {provider === 'stripe' && (
              <span className="h-2 w-2 rounded-full bg-white" />
            )}
          </span>
        </button>
      </div>

      <div className="pt-6 border-t border-brand-border/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs text-brand-text-muted block font-semibold uppercase tracking-wider">Total a pagar</span>
          <span className="text-3xl font-extrabold text-brand-primary block mt-0.5">
            ${price.toLocaleString('es-AR')} ARS
          </span>
        </div>
        
        <button
          onClick={handlePayment}
          disabled={isLoading}
          className="px-8 py-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center space-x-2 cursor-pointer"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Redirigiendo...</span>
            </>
          ) : (
            <span>Pagar ahora</span>
          )}
        </button>
      </div>
    </div>
  );
}

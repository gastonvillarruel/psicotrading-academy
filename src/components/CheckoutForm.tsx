'use client';

import React, { useState } from 'react';

interface CheckoutFormProps {
  courseId?: string;
  plan?: 'MONTHLY' | 'ANNUAL';
  title: string;
  priceARS?: number | null;
  priceUSD?: number | null;
  priceUSDT?: number | null;
  paymentMode?: string;
  durationInMonths?: number;
  startDate?: string | Date;
  startTime?: string | null;
  teacherName?: string | null;
  paypalEnabled?: boolean;
}

type PaymentProviderType = 'mercadopago' | 'paypal' | 'nowpayments';

export default function CheckoutForm({
  courseId,
  plan,
  title,
  priceARS,
  priceUSD,
  priceUSDT,
  paymentMode = 'cash',
  durationInMonths = 0,
  startDate,
  startTime,
  teacherName,
  paypalEnabled = true,
}: CheckoutFormProps) {
  // Determinar proveedores disponibles
  const hasARS = plan || (priceARS !== null && priceARS !== undefined && priceARS > 0);
  const hasUSD = priceUSD !== null && priceUSD !== undefined && priceUSD > 0 && paypalEnabled;
  const hasUSDT = priceUSDT !== null && priceUSDT !== undefined && priceUSDT > 0;

  // Auto-seleccionar primer proveedor válido
  const getDefaultProvider = (): PaymentProviderType => {
    if (plan || hasARS) return 'mercadopago';
    if (hasUSD) return 'paypal';
    if (hasUSDT) return 'nowpayments';
    return 'mercadopago';
  };

  const [provider, setProvider] = useState<PaymentProviderType>(getDefaultProvider());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPriceTextForProvider = (p: PaymentProviderType) => {
    const isInstallments = paymentMode === 'installments' && durationInMonths > 0;

    if (p === 'mercadopago') {
      const price = plan ? (plan === 'MONTHLY' ? 8500 : 81600) : (priceARS || 0);
      return isInstallments
        ? `${durationInMonths} cuotas de $${Math.round(price).toLocaleString('es-AR')} ARS`
        : `$${Math.round(price).toLocaleString('es-AR')} ARS`;
    }

    if (p === 'paypal') {
      const price = priceUSD || 0;
      return isInstallments
        ? `${durationInMonths} cuotas de $${price.toFixed(2)} USD`
        : `$${price.toFixed(2)} USD`;
    }

    if (p === 'nowpayments') {
      const price = priceUSDT || 0;
      // Convertir a string para evitar redondeos de float y conservar precisión
      const priceStr = typeof price === 'object' ? String(price) : price.toString();
      return `${priceStr} USDT`;
    }

    return '';
  };

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

      // Redirigir al checkout externo del proveedor seleccionado
      window.location.href = data.url;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudo iniciar el proceso de pago. Intentá de nuevo.');
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-brand-card rounded-xl border border-brand-border/30 p-8 shadow-sm max-w-xl mx-auto transition-all duration-200">
      <h2 className="text-xl font-bold text-brand-text mb-6">Seleccioná tu método de pago</h2>

      {error && (
        <div className="mb-6 p-4 bg-brand-error/10 text-brand-error rounded-lg text-sm border border-brand-error/20">
          {error}
        </div>
      )}

      {priceUSD !== null && priceUSD !== undefined && priceUSD > 0 && !paypalEnabled && (
        <div className="mb-6 p-4 bg-amber-500/10 text-amber-600 rounded-lg text-sm border border-amber-500/20 font-medium">
          Pago en USD por PayPal temporalmente no disponible.
        </div>
      )}

      {/* Selectores de Pasarela */}
      <div className="grid grid-cols-1 gap-4 mb-8">
        {/* MercadoPago */}
        {hasARS && (
          <button
            type="button"
            onClick={() => setProvider('mercadopago')}
            disabled={isLoading}
            className={`p-5 rounded-xl border-2 text-left flex items-center justify-between transition-all duration-300 cursor-pointer hover:translate-y-[-1px] ${
              provider === 'mercadopago'
                ? 'border-brand-primary bg-brand-primary/5 shadow-md shadow-brand-primary/5'
                : 'border-brand-border/40 hover:border-brand-border/80 bg-transparent'
            }`}
          >
            <div className="flex items-center space-x-4">
              <div className="h-10 w-10 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400 font-bold text-lg">
                MP
              </div>
              <div>
                <span className="text-sm font-bold text-brand-text block">Mercado Pago</span>
                <span className="text-xs text-brand-text-muted">Tarjetas, transferencia, Rapipago/Pago Fácil y cuotas (Argentina).</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold text-brand-text-muted">{getPriceTextForProvider('mercadopago')}</span>
              <span className={`h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                provider === 'mercadopago' ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-border/80'
              }`}>
                {provider === 'mercadopago' && (
                  <span className="h-2 w-2 rounded-full bg-white" />
                )}
              </span>
            </div>
          </button>
        )}

        {/* PayPal */}
        {hasUSD && (
          <button
            type="button"
            onClick={() => setProvider('paypal')}
            disabled={isLoading}
            className={`p-5 rounded-xl border-2 text-left flex items-center justify-between transition-all duration-300 cursor-pointer hover:translate-y-[-1px] ${
              provider === 'paypal'
                ? 'border-brand-primary bg-brand-primary/5 shadow-md shadow-brand-primary/5'
                : 'border-brand-border/40 hover:border-brand-border/80 bg-transparent'
            }`}
          >
            <div className="flex items-center space-x-4">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold text-lg">
                PP
              </div>
              <div>
                <span className="text-sm font-bold text-brand-text block">PayPal</span>
                <span className="text-xs text-brand-text-muted">Tarjetas de crédito internacionales y cuenta PayPal (USD).</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold text-brand-text-muted">{getPriceTextForProvider('paypal')}</span>
              <span className={`h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                provider === 'paypal' ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-border/80'
              }`}>
                {provider === 'paypal' && (
                  <span className="h-2 w-2 rounded-full bg-white" />
                )}
              </span>
            </div>
          </button>
        )}

        {/* NOWPayments */}
        {hasUSDT && (
          <button
            type="button"
            onClick={() => setProvider('nowpayments')}
            disabled={isLoading}
            className={`p-5 rounded-xl border-2 text-left flex items-center justify-between transition-all duration-300 cursor-pointer hover:translate-y-[-1px] ${
              provider === 'nowpayments'
                ? 'border-brand-primary bg-brand-primary/5 shadow-md shadow-brand-primary/5'
                : 'border-brand-border/40 hover:border-brand-border/80 bg-transparent'
            }`}
          >
            <div className="flex items-center space-x-4">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-lg">
                ₮
              </div>
              <div>
                <span className="text-sm font-bold text-brand-text block">Criptomonedas (USDT)</span>
                <span className="text-xs text-brand-text-muted">Pago seguro con criptomonedas vía NOWPayments (USDT-TRC20).</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold text-brand-text-muted">{getPriceTextForProvider('nowpayments')}</span>
              <span className={`h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                provider === 'nowpayments' ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-border/80'
              }`}>
                {provider === 'nowpayments' && (
                  <span className="h-2 w-2 rounded-full bg-white" />
                )}
              </span>
            </div>
          </button>
        )}
      </div>

      <div className="pt-6 border-t border-brand-border/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs text-brand-text-muted block font-semibold uppercase tracking-wider">Monto a pagar</span>
          <span className="text-2xl font-black text-brand-primary block mt-0.5">
            {getPriceTextForProvider(provider)}
          </span>
        </div>
        
        <button
          onClick={handlePayment}
          disabled={isLoading}
          className="px-8 py-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center space-x-2 cursor-pointer font-bold"
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

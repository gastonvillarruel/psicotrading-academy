'use client';

import React, { useState } from 'react';
import { CryptoLogo } from '@/components/CurrencyToggle';
import { FiCreditCard, FiLock, FiCheck, FiChevronRight } from 'react-icons/fi';
import { FaPaypal } from 'react-icons/fa';

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
  selectedCurrency?: 'ARS' | 'USD' | 'CRYPTO';
  scheduleOptions?: { id: string; name: string; description: string | null; capacity: number | null }[];
  initialScheduleOptionId?: string;
  startDateId?: string;
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
  selectedCurrency = 'ARS',
  scheduleOptions = [],
  initialScheduleOptionId = '',
  startDateId = '',
}: CheckoutFormProps) {
  // Determinar proveedores disponibles
  const hasARS = plan || (priceARS !== null && priceARS !== undefined && priceARS > 0);
  const hasUSD = priceUSD !== null && priceUSD !== undefined && priceUSD > 0 && paypalEnabled;
  const hasUSDT = priceUSDT !== null && priceUSDT !== undefined && priceUSDT > 0;

  // Filtrar según la lógica de moneda seleccionada
  const showMercadoPago = selectedCurrency === 'ARS' && hasARS;
  const showPayPal = (selectedCurrency === 'ARS' || selectedCurrency === 'USD') && hasUSD;
  const showCrypto = (selectedCurrency === 'ARS' || selectedCurrency === 'USD' || selectedCurrency === 'CRYPTO') && hasUSDT;

  // Auto-seleccionar primer proveedor válido
  const getDefaultProvider = (): PaymentProviderType => {
    if (showMercadoPago) return 'mercadopago';
    if (showPayPal) return 'paypal';
    if (showCrypto) return 'nowpayments';
    return 'mercadopago';
  };

  const [provider, setProvider] = useState<PaymentProviderType>(getDefaultProvider());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedScheduleOptionId, setSelectedScheduleOptionId] = useState<string>(initialScheduleOptionId);

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
          scheduleOptionId: selectedScheduleOptionId || undefined,
          startDateId: startDateId || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al procesar el checkout');
      }

      window.location.href = data.url;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudo iniciar el proceso de pago. Intentá de nuevo.');
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xl shadow-slate-200/30 w-full transition-all duration-200">
      <div className="flex items-center space-x-3 mb-6">
        <div className="h-8 w-8 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary">
          <FiLock className="text-lg" />
        </div>
        <div>
          <h2 className="text-lg font-black text-brand-text">Seleccioná tu método de pago</h2>
          <p className="text-xs text-brand-text-muted">Todas las transacciones son seguras y encriptadas.</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200 flex items-center space-x-2 font-medium">
          <span className="h-2 w-2 rounded-full bg-red-600 flex-shrink-0 animate-pulse" />
          <span>{error}</span>
        </div>
      )}

      {priceUSD !== null && priceUSD !== undefined && priceUSD > 0 && !paypalEnabled && (
        <div className="mb-6 p-4 bg-amber-50 text-amber-700 rounded-xl text-xs border border-amber-200 font-medium">
          Pago en USD por PayPal temporalmente no disponible.
        </div>
      )}

      {/* Selector de comisión/horario (oculto si ya viene preseleccionado desde la landing) */}
      {!initialScheduleOptionId && scheduleOptions.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-extrabold text-brand-text mb-3">Elegí tu horario</h3>
          <div className="grid gap-2">
            {scheduleOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedScheduleOptionId(opt.id)}
                className={`p-4 rounded-2xl border-2 text-left flex items-center justify-between transition-all duration-200 ${
                  selectedScheduleOptionId === opt.id
                    ? 'border-brand-primary bg-brand-primary/[0.02] shadow-md shadow-brand-primary/5'
                    : 'border-slate-200 hover:border-slate-300 bg-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      selectedScheduleOptionId === opt.id
                        ? 'border-brand-primary bg-brand-primary'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {selectedScheduleOptionId === opt.id && (
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-extrabold text-brand-text block">{opt.name}</span>
                    {opt.description && (
                      <span className="text-[11px] text-brand-text-muted block mt-0.5">{opt.description}</span>
                    )}
                    {opt.capacity && (
                      <span className="text-[10px] text-slate-400 block">Cupo: {opt.capacity} personas</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {scheduleOptions.length > 0 && !selectedScheduleOptionId && (
            <p className="text-xs text-amber-600 font-semibold mt-2">
              * Elegí un horario para continuar con el pago.
            </p>
          )}
        </div>
      )}

      {/* Selectores de Pasarela */}
      <div className="grid grid-cols-1 gap-4 mb-8">
        {/* MercadoPago */}
        {showMercadoPago && (
          <button
            type="button"
            onClick={() => setProvider('mercadopago')}
            disabled={isLoading || (scheduleOptions.length > 0 && !selectedScheduleOptionId)}
            className={`p-4 sm:p-5 rounded-2xl border-2 text-left flex items-center justify-between transition-all duration-300 cursor-pointer group relative overflow-hidden ${
              provider === 'mercadopago'
                ? 'border-brand-primary bg-brand-primary/[0.02] shadow-lg shadow-brand-primary/5'
                : 'border-slate-200 hover:border-slate-350 hover:bg-slate-50 bg-transparent'
            }`}
          >
            {provider === 'mercadopago' && (
              <div className="absolute top-0 left-0 w-1.5 h-full bg-brand-primary" />
            )}
            <div className="flex items-center space-x-4">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center font-black text-sm transition-colors duration-300 ${
                provider === 'mercadopago' ? 'bg-sky-500/15 text-sky-600' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
              }`}>
                <FiCreditCard className="text-lg" />
              </div>
              <div className="max-w-[70%] sm:max-w-none">
                <span className="text-sm font-extrabold text-brand-text block">Mercado Pago</span>
                <span className="text-[11px] text-brand-text-muted leading-tight block mt-0.5">
                  Tarjetas de débito/crédito, transferencias bancarias o Rapipago (Argentina).
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-3 flex-shrink-0">
              <div className={`h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                provider === 'mercadopago' 
                  ? 'border-brand-primary bg-brand-primary text-white scale-110' 
                  : 'border-slate-300 bg-white'
              }`}>
                {provider === 'mercadopago' && <FiCheck className="text-xs stroke-[4]" />}
              </div>
            </div>
          </button>
        )}

        {/* PayPal */}
        {showPayPal && (
          <button
            type="button"
            onClick={() => setProvider('paypal')}
            disabled={isLoading || (scheduleOptions.length > 0 && !selectedScheduleOptionId)}
            className={`p-4 sm:p-5 rounded-2xl border-2 text-left flex items-center justify-between transition-all duration-300 cursor-pointer group relative overflow-hidden ${
              provider === 'paypal'
                ? 'border-brand-primary bg-brand-primary/[0.02] shadow-lg shadow-brand-primary/5'
                : 'border-slate-200 hover:border-slate-350 hover:bg-slate-50 bg-transparent'
            }`}
          >
            {provider === 'paypal' && (
              <div className="absolute top-0 left-0 w-1.5 h-full bg-brand-primary" />
            )}
            <div className="flex items-center space-x-4">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                provider === 'paypal' ? 'bg-blue-500/15 text-blue-600' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
              }`}>
                <FaPaypal className="text-lg" />
              </div>
              <div className="max-w-[70%] sm:max-w-none">
                <span className="text-sm font-extrabold text-brand-text block">PayPal</span>
                <span className="text-[11px] text-brand-text-muted leading-tight block mt-0.5">
                  Tarjetas de crédito internacionales y cuenta PayPal (procesado en USD).
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-3 flex-shrink-0">
              <div className={`h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                provider === 'paypal' 
                  ? 'border-brand-primary bg-brand-primary text-white scale-110' 
                  : 'border-slate-300 bg-white'
              }`}>
                {provider === 'paypal' && <FiCheck className="text-xs stroke-[4]" />}
              </div>
            </div>
          </button>
        )}

        {/* NOWPayments (Crypto) */}
        {showCrypto && (
          <button
            type="button"
            onClick={() => setProvider('nowpayments')}
            disabled={isLoading || (scheduleOptions.length > 0 && !selectedScheduleOptionId)}
            className={`w-full p-4 sm:p-5 rounded-2xl border-2 text-left flex items-center justify-between transition-all duration-300 cursor-pointer group relative overflow-hidden ${
              provider === 'nowpayments'
                ? 'border-brand-primary bg-brand-primary/[0.02] shadow-lg shadow-brand-primary/5'
                : 'border-slate-200 hover:border-slate-350 hover:bg-slate-50 bg-transparent'
            }`}
          >
            {provider === 'nowpayments' && (
              <div className="absolute top-0 left-0 w-1.5 h-full bg-brand-primary" />
            )}
            <div className="flex items-center space-x-4">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                provider === 'nowpayments' ? 'bg-amber-500/10' : 'bg-slate-100 group-hover:bg-slate-200'
              }`}>
                <CryptoLogo className="w-8 h-8" />
              </div>
              <div className="max-w-[70%] sm:max-w-none">
                <span className="text-sm font-extrabold text-brand-text block">Criptomonedas</span>
                <span className="text-[11px] text-brand-text-muted leading-tight block mt-0.5">
                  Pagá con USDT, BTC y más redes directamente en NOWPayments.
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-3 flex-shrink-0">
              <div className={`h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                provider === 'nowpayments' 
                  ? 'border-brand-primary bg-brand-primary text-white scale-110' 
                  : 'border-slate-300 bg-white'
              }`}>
                {provider === 'nowpayments' && <FiCheck className="text-xs stroke-[4]" />}
              </div>
            </div>
          </button>
        )}
      </div>

      <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[10px] text-slate-400 block font-extrabold uppercase tracking-widest">Monto a pagar</span>
          <span className="text-2xl font-black text-brand-primary block mt-0.5 tracking-tight">
            {getPriceTextForProvider(provider)}
          </span>
        </div>

        <button
          onClick={handlePayment}
          disabled={isLoading || (scheduleOptions.length > 0 && !selectedScheduleOptionId)}
          className="relative px-8 py-4 bg-brand-primary hover:bg-brand-primary/95 text-white font-extrabold rounded-xl transition-all shadow-lg shadow-brand-primary/25 hover:shadow-brand-primary/35 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center space-x-2 cursor-pointer group overflow-hidden"
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
            <>
              <span>Pagar ahora</span>
              <FiChevronRight className="text-lg transition-transform duration-300 group-hover:translate-x-1" />
            </>
          )}
        </button>
      </div>

      {/* Credit cards & security logos badge */}
      <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 opacity-50 grayscale hover:opacity-75 transition-opacity">
        <img src="https://upload.wikimedia.org/wikipedia/commons/5/5c/Visa_Inc._logo_%282021%E2%80%93present%29.svg" alt="Visa" className="h-4" />
        <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-6" />
        <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" alt="PayPal" className="h-4" />
        <span className="text-[10px] text-slate-500 font-bold border border-slate-300 rounded px-1.5 py-0.5">PCI-DSS</span>
      </div>
    </div>
  );
}

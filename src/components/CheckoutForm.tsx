'use client';

import React, { useState } from 'react';

interface CheckoutFormProps {
  courseId?: string;
  plan?: 'MONTHLY' | 'ANNUAL';
  title: string;
  price: number;
  currency?: 'ARS' | 'USD';
  paymentMode?: string;
  durationInMonths?: number;
  startDate?: string | Date;
  startTime?: string | null;
  teacherName?: string | null;
}

export default function CheckoutForm({
  courseId,
  plan,
  title,
  price,
  currency = 'ARS',
  paymentMode = 'cash',
  durationInMonths = 0,
  startDate,
  startTime,
  teacherName,
}: CheckoutFormProps) {
  const [provider, setProvider] = useState<'mercadopago' | 'stripe'>('mercadopago');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceText = currency === 'USD'
    ? (paymentMode === 'installments' && durationInMonths > 0
        ? `${durationInMonths} cuotas de USD ${price}`
        : `USD ${price}`)
    : `$${price.toLocaleString('es-AR')} ARS`;

  const formattedStartDate = startDate 
    ? new Date(startDate).toLocaleDateString('es-AR') 
    : '';

  const buildWhatsappMessage = (currencyType: 'ARS' | 'USD') => {
    const modeLabel = paymentMode === 'installments' ? 'cuotas' : 'contado';
    const installmentsInfo = paymentMode === 'installments' && durationInMonths > 0 ? ` (${durationInMonths} cuotas)` : '';
    
    let msg = `Hola, quiero inscribirme al curso "${title}".\n\n`;
    msg += `Detalles de mi inscripción:\n`;
    msg += `- Moneda: ${currencyType}\n`;
    msg += `- Precio: ${priceText}\n`;
    msg += `- Modalidad: ${modeLabel}${installmentsInfo}\n`;
    
    if (formattedStartDate) {
      msg += `- Fecha de inicio: ${formattedStartDate}\n`;
    }
    if (startTime) {
      msg += `- Horario: ${startTime}\n`;
    }
    if (teacherName) {
      msg += `- Docente: ${teacherName}\n`;
    }
    
    return encodeURIComponent(msg);
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

      // Redirigir al checkout del proveedor externo
      window.location.href = data.url;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudo iniciar el proceso de pago. Intentá de nuevo.');
      setIsLoading(false);
    }
  };

  // Escenario: Pago en USD
  if (currency === 'USD') {
    const whatsappLink = `https://wa.me/5491136458514?text=${buildWhatsappMessage('USD')}`;

    return (
      <div className="bg-brand-card rounded-xl border border-brand-border/30 p-8 shadow-sm max-w-xl mx-auto transition-all duration-200 text-center space-y-6">
        <div className="h-12 w-12 bg-amber-500/10 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-2">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h2 className="text-xl font-bold text-brand-text">Pago en USD Vía Soporte</h2>
        
        <p className="text-xs text-brand-text-muted max-w-md mx-auto leading-relaxed font-light">
          Las pasarelas de pago automático actualmente solo procesan transacciones en pesos argentinos (ARS). 
          Para abonar en dólares (USD), coordiná directamente con nuestro equipo de soporte técnico vía WhatsApp.
        </p>

        <div className="pt-4 border-t border-brand-border/10">
          <span className="text-xs text-brand-text-muted uppercase tracking-wider block font-semibold">Total a coordinar</span>
          <span className="text-2xl font-black text-brand-primary mt-1 block">
            {priceText}
          </span>
        </div>

        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center space-x-2 w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-md hover:scale-[1.01] active:scale-[0.98] mt-4 cursor-pointer"
        >
          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.46h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          <span>Coordinar Inscripción en USD</span>
        </a>
      </div>
    );
  }

  // Escenario: Pago en ARS (Flujo estándar sin cambios)
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
            {priceText}
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

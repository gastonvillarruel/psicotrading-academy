'use client';

import React from 'react';
import Link from 'next/link';
import { formatCoursePrice, getAvailableCurrencies } from '@/lib/price';
import { useCurrency } from '@/context/CurrencyContext';
import { useSession } from 'next-auth/react';

interface CampusCourseCardProps {
  course: {
    id: string;
    slug: string;
    title: string;
    shortDescription: string;
    price: number;
    priceARS?: number | null;
    priceUSD?: number | null;
    originalPriceARS?: number | null;
    originalPriceUSD?: number | null;
    paymentMode?: string | null;
    durationInMonths?: number | null;
    duration?: string | null;
    sortOrder?: number | null;
    type: 'LIVE' | 'RECORDED';
    videoUrl?: string | null;
    scheduledAt?: Date | string | null;
    thumbnail?: string | null;
    available?: boolean | null;
    fakeEnrollments?: number | null;
    createdAt: Date | string;
  };
}

export default function CampusCourseCard({ course }: CampusCourseCardProps) {
  const { currency } = useCurrency();
  const { data: session } = useSession();
  const isAvailable = course.available !== false;
  const canClick = isAvailable;

  // Formatear precio
  const pricing = formatCoursePrice(course as any, currency);

  // Calcular descuento automáticamente en base a la moneda efectiva
  const discountPercent = pricing.originalPrice && pricing.currentPrice && pricing.originalPrice > pricing.currentPrice
    ? Math.round(((pricing.originalPrice - pricing.currentPrice) / pricing.originalPrice) * 100)
    : 0;

  // Detectar si la moneda seleccionada no está disponible en este curso
  const availableCurrencies = getAvailableCurrencies(course as any);
  const currencyUnavailable = isAvailable && availableCurrencies.length > 0 && !availableCurrencies.includes(currency);
  const currencyUnavailableLabel = currencyUnavailable
    ? `Disponible en ${availableCurrencies.map(c => c === 'CRYPTO' ? 'USDT' : c).join(' / ')}`
    : null;

  // Helper para formatear valores
  const formatVal = (val: number, curr: 'ARS' | 'USD' | 'CRYPTO') => {
    if (curr === 'ARS') {
      return `$${Math.round(val).toLocaleString('es-AR')} ARS`;
    } else if (curr === 'CRYPTO') {
      const formatted = Number.isInteger(val) ? String(val) : val.toFixed(2);
      return `${formatted} USDT`;
    } else {
      return `USD ${Math.round(val).toLocaleString('es-AR')}`;
    }
  };

  // Contenido interno de la tarjeta
  const cardInnerContent = (
    <>
      {course.thumbnail && (
        <div className="h-36 w-full overflow-hidden bg-brand-bg-sec relative">
          <img
            src={course.thumbnail}
            alt={course.title}
            className={`w-full h-full object-cover animate-fade-in transition-transform duration-500 ${canClick ? 'group-hover:scale-105' : ''
              }`}
          />
          {!isAvailable && (
            <>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[0.5px]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="px-3 py-1.5 text-xs font-bold rounded-lg shadow-lg bg-black/80 text-white border border-white/10 uppercase tracking-wider backdrop-blur-sm">
                  Próximamente
                </span>
              </div>
            </>
          )}

          {/* Badge de Modalidad */}
          <span className="absolute top-3 right-3 rounded-md bg-black/75 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm border border-white/10">
            {course.type === 'LIVE' ? 'Clases en vivo' : 'Grabado'}
          </span>

          {/* Badge de Descuento o Moneda Disponible */}
          {isAvailable && currencyUnavailableLabel ? (
            <span className="absolute top-3 left-3 rounded-md bg-brand-accent px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              {currencyUnavailableLabel}
            </span>
          ) : isAvailable && discountPercent > 0 ? (
            <span className="absolute top-3 left-3 rounded-md bg-brand-accent px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              {discountPercent}% OFF
            </span>
          ) : null}
        </div>
      )}

      <div className="p-4 flex-grow flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          {/* Card Title */}
          <h3 className="text-lg sm:text-xl font-bold text-brand-text leading-tight line-clamp-2">
            {course.title}
          </h3>

          {/* Short Description */}
          <p className="text-brand-text-muted text-sm leading-relaxed line-clamp-2">
            {course.shortDescription}
          </p>

          {/* Badges secundarios (sólo fecha de inicio si es en vivo y está disponible) */}
          {isAvailable && course.type === 'LIVE' && course.scheduledAt && (
            <div className="pt-0.5">
              <span className="inline-flex text-xs text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded border border-brand-accent/20 items-center gap-1 font-semibold">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Comienza: {new Date(course.scheduledAt).toLocaleDateString('es-AR', {
                  day: 'numeric',
                  month: 'long'
                })}
              </span>
            </div>
          )}
        </div>

        {/* Separador, precio y footer */}
        <div className="pt-3 border-t border-brand-border/15 space-y-3 mt-auto">
          {/* Bloque de Precios */}
          <div className="flex flex-col min-h-[38px] justify-center">
            {isAvailable ? (
              pricing.currentPrice !== null && pricing.currentPrice !== undefined ? (
                <>
                  {pricing.isInstallments && pricing.durationInMonths > 0 && (
                    <span className="text-xs sm:text-sm text-brand-text-muted/80 leading-none mb-1">
                      {pricing.durationInMonths} cuotas de
                    </span>
                  )}
                  <div className="flex items-baseline gap-2 leading-none">
                    {pricing.hasOriginalPrice && pricing.originalPrice && (
                      <span className="text-sm text-brand-text-muted/60 line-through font-light">
                        {formatVal(pricing.originalPrice, pricing.effectiveCurrency)}
                      </span>
                    )}
                    <span className="text-lg sm:text-xl font-extrabold text-brand-primary">
                      {formatVal(pricing.currentPrice, pricing.effectiveCurrency)}
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-sm font-semibold text-brand-text-muted italic">
                  Consultar precio
                </span>
              )
            ) : (
              <span className="text-sm font-semibold text-brand-text-muted italic">
                Inscripción no habilitada
              </span>
            )}
          </div>

          {/* Footer inferior */}
          {((course.fakeEnrollments !== null && course.fakeEnrollments !== undefined && course.fakeEnrollments > 0) || course.duration) && (
            <div className="border-t border-brand-border/10 pt-2 flex items-center justify-between text-xs sm:text-sm text-brand-text-muted/80">
              {/* Personas inscriptas */}
              <div>
                {course.fakeEnrollments !== null && course.fakeEnrollments !== undefined && course.fakeEnrollments > 0 && (
                  <div className="flex items-center gap-1 font-medium">
                    <svg className="w-3.5 h-3.5 text-brand-text-muted/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>{course.fakeEnrollments.toLocaleString('es-AR')}</span>
                  </div>
                )}
              </div>

              {/* Duración */}
              <div>
                {course.duration && (
                  <div className="flex items-center gap-1 font-medium">
                    <svg className="w-3.5 h-3.5 text-brand-text-muted/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0Z" />
                    </svg>
                    <span>{course.duration}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (canClick) {
    return (
      <Link
        href={`/campus/${course.slug}`}
        className={`block group rounded-xl border border-brand-border/30 hover:border-brand-primary/50 shadow-sm hover:shadow-md bg-brand-card overflow-hidden flex flex-col h-full transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer ${!isAvailable ? 'opacity-85' : ''
          }`}
      >
        {cardInnerContent}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-brand-border/35 shadow-sm bg-brand-card overflow-hidden flex flex-col h-full opacity-80 cursor-not-allowed transition-all duration-300">
      {cardInnerContent}
    </div>
  );
}

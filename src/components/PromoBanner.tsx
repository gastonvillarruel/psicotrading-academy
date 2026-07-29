'use client';

import React, { useState, useEffect } from 'react';
import { useCurrency } from '@/context/CurrencyContext';
import { usePathname } from 'next/navigation';

interface PromoBannerProps {
  minPrices: {
    ARS: number;
    USD: number;
    CRYPTO: number;
  };
}

export default function PromoBanner({ minPrices }: PromoBannerProps) {
  const { displayCurrency } = useCurrency();
  const pathname = usePathname();
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0); // Sets to midnight of the current day (00:00:00 of tomorrow)
      const diff = midnight.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft({ hours: 23, minutes: 59, seconds: 59 });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft({ hours, minutes, seconds });
    };

    const timeout = setTimeout(calculateTime, 0);
    const interval = setInterval(calculateTime, 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  if (pathname?.startsWith('/mi-campus') || pathname?.startsWith('/evaluacion') || pathname === '/login') {
    return null;
  }

  const formatDigit = (num: number) => String(num).padStart(2, '0');

  const displayHours = formatDigit(timeLeft.hours);
  const displayMinutes = formatDigit(timeLeft.minutes);
  const displaySeconds = formatDigit(timeLeft.seconds);

  const getFormattedPrice = () => {
    if (displayCurrency === 'ARS') {
      return `$${Math.round(minPrices.ARS).toLocaleString('es-AR')} ARS`;
    }

    if (minPrices.USD > 0) {
      return `$${Math.round(minPrices.USD).toLocaleString('es-AR')} USD`;
    }

    return `$${Math.round(minPrices.ARS).toLocaleString('es-AR')} ARS`;
  };

  const formattedPrice = getFormattedPrice();

  return (
    <div className="w-full bg-amber-50/60 backdrop-blur-md text-slate-800 border-b border-amber-200/80 sticky top-16 z-40 overflow-hidden py-3 px-4 shadow-[0_2px_15px_-3px_rgba(245,158,11,0.08)]">
      {/* Ambient glowing background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-200/20 via-transparent to-transparent opacity-80 pointer-events-none" />
      
      {/* Decorative gradient thin line at the very top */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-amber-500/0 via-amber-500/70 to-amber-500/0" />

      <div className="max-w-7xl mx-auto flex flex-col items-center justify-center text-center gap-2 relative z-10">
        
        {/* Top: Special Offer Text */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] sm:text-xs font-black bg-amber-500 text-slate-950 uppercase tracking-widest animate-pulse shadow-sm">
            Oferta Especial
          </span>
          <p className="text-sm sm:text-base font-bold text-slate-800">
            ¡Oferta Especial por Tiempo Limitado! Aprovecha nuestros cursos con ofertas desde{' '}
            <span className="text-amber-600 font-black tracking-wide bg-amber-100/50 px-1.5 py-0.5 rounded border border-amber-200/60 shadow-sm">
              {formattedPrice}
            </span>
          </p>
        </div>

        {/* Bottom (abajo): Countdown Timer */}
        <div className="flex items-center gap-2.5 mt-0.5">
          <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
            finaliza en
          </span>
          <div className="flex items-center gap-1.5 font-mono text-sm">
            <div className="flex items-baseline gap-0.5">
              <span className="inline-flex items-center justify-center w-7 h-7 bg-white border border-amber-200 rounded-md font-bold text-amber-700 shadow-sm">
                {displayHours}
              </span>
              <span className="text-[10px] font-bold text-slate-400 lowercase mr-0.5">h</span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="inline-flex items-center justify-center w-7 h-7 bg-white border border-amber-200 rounded-md font-bold text-amber-700 shadow-sm">
                {displayMinutes}
              </span>
              <span className="text-[10px] font-bold text-slate-400 lowercase mr-0.5">m</span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="inline-flex items-center justify-center w-7 h-7 bg-white border border-amber-200 rounded-md font-bold text-amber-700 shadow-sm">
                {displaySeconds}
              </span>
              <span className="text-[10px] font-bold text-slate-400 lowercase">s</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

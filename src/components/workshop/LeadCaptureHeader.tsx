'use client';

import React from 'react';

interface LeadCaptureHeaderProps {
  courseTitle: string;
  ctaText?: string;
  onCtaClick?: () => void;
}

export default function LeadCaptureHeader({
  courseTitle,
  ctaText = 'Reservar mi lugar',
  onCtaClick,
}: LeadCaptureHeaderProps) {
  const handleClick = () => {
    if (onCtaClick) {
      onCtaClick();
    } else {
      // Si no hay callback específico, hacer scroll al hero o primer CTA
      const heroCta = document.getElementById('workshop-main-cta');
      if (heroCta) {
        heroCta.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-brand-bg/85 backdrop-blur-md border-b border-brand-border/30 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo sin links que saquen del embudo */}
        <div className="flex items-center space-x-3 select-none">
          <img
            src="/brand/logos/logo-solo-oscuro.png"
            alt={`PSICOEMOTRADING - ${courseTitle}`}
            title={courseTitle}
            className="h-7 w-auto object-contain"
          />
          <span className="text-sm font-black tracking-wider text-brand-text uppercase hidden sm:inline">
            PSICOEMOTRADING
          </span>
        </div>

        {/* Badge Informativo y CTA rápido */}
        <div className="flex items-center space-x-3">
          <span className="hidden md:inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            Taller Gratuito
          </span>
          <button
            type="button"
            onClick={handleClick}
            className="px-4 py-2 bg-brand-primary hover:bg-brand-primary/90 active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
          >
            {ctaText}
          </button>
        </div>
      </div>
    </header>
  );
}

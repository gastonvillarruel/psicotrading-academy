'use client';

import React from 'react';

export function ArgentinaFlag({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 30 30"
      className={`rounded-full overflow-hidden shadow-inner ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="30" height="10" fill="#74ACDF" />
      <rect y="10" width="30" height="10" fill="#FFFFFF" />
      <rect y="20" width="30" height="10" fill="#74ACDF" />
      {/* Sun of May */}
      <circle cx="15" cy="15" r="2.2" fill="#F1B622" />
      {/* Simple crisp rays */}
      <path
        d="M15 11.5v7M11.5 15h7M12.5 12.5l5 5M12.5 17.5l5-5"
        stroke="#F1B622"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      {/* Sun details */}
      <circle cx="15" cy="15" r="1.1" fill="#E6A100" />
    </svg>
  );
}

export function UsaFlag({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 30 30"
      className={`rounded-full overflow-hidden shadow-inner ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 13 stripes */}
      <rect width="30" height="30" fill="#FFF" />
      <path
        d="M0 0h30v2.3H0zm0 4.6h30v2.3H0zm0 4.6h30v2.3H0zm0 4.6h30v2.3H0zm0 4.6h30v2.3H0zm0 4.6h30v2.3H0zm0 4.6h30v2.3H0z"
        fill="#B22234"
      />
      {/* Blue canton */}
      <rect width="14" height="16.1" fill="#3C3B6E" />
      {/* Stars (dots for high legibility at 24px) */}
      <g fill="#FFF">
        <circle cx="2.5" cy="2.5" r="0.6" />
        <circle cx="5.5" cy="2.5" r="0.6" />
        <circle cx="8.5" cy="2.5" r="0.6" />
        <circle cx="11.5" cy="2.5" r="0.6" />
        <circle cx="4" cy="5" r="0.6" />
        <circle cx="7" cy="5" r="0.6" />
        <circle cx="10" cy="5" r="0.6" />
        <circle cx="2.5" cy="7.5" r="0.6" />
        <circle cx="5.5" cy="7.5" r="0.6" />
        <circle cx="8.5" cy="7.5" r="0.6" />
        <circle cx="11.5" cy="7.5" r="0.6" />
        <circle cx="4" cy="10" r="0.6" />
        <circle cx="7" cy="10" r="0.6" />
        <circle cx="10" cy="10" r="0.6" />
        <circle cx="2.5" cy="12.5" r="0.6" />
        <circle cx="5.5" cy="12.5" r="0.6" />
        <circle cx="8.5" cy="12.5" r="0.6" />
        <circle cx="11.5" cy="12.5" r="0.6" />
      </g>
    </svg>
  );
}

interface CurrencyToggleProps {
  currency: 'ARS' | 'USD';
  onToggle: () => void;
  className?: string;
}

export default function CurrencyToggle({ currency, onToggle, className = '' }: CurrencyToggleProps) {
  return (
    <div className={`relative group inline-block ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="relative flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none rounded-full p-0.5 border border-brand-border/30 bg-brand-bg-sec/20 hover:bg-brand-bg-sec/55 hover:border-brand-primary/45 shadow-sm hover:shadow-md"
        aria-label="Cambiar moneda"
      >
        {currency === 'ARS' ? (
          <ArgentinaFlag className="w-7 h-7" />
        ) : (
          <UsaFlag className="w-7 h-7" />
        )}
      </button>

      {/* Tooltip */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 text-[11px] font-semibold text-white bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-md shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 whitespace-nowrap z-50 border border-white/5">
        Cambiar moneda
        {/* Tooltip arrow */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-900/95 dark:border-b-slate-800/95" />
      </div>
    </div>
  );
}

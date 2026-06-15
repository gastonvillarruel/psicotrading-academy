'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import {
  CountryOption,
  CountryRegion,
  getPublicCountriesByRegion,
} from '@/lib/countries';

const REGIONS: CountryRegion[] = ['America Latina', 'Norteamerica', 'Europa'];

function getFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`;
}

interface CountrySelectorProps {
  selectedCountry: CountryOption;
  onSelect: (country: CountryOption) => void;
  compact?: boolean;
  className?: string;
}

export default function CountrySelector({
  selectedCountry,
  onSelect,
  compact = false,
  className = '',
}: CountrySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`flex items-center gap-2 rounded-xl border border-brand-border/20 bg-white/85 px-3 py-2 text-left shadow-sm transition-all duration-200 hover:border-brand-primary/35 hover:bg-brand-bg-sec/35 hover:shadow-md ${
          compact ? 'min-w-[112px] justify-between' : 'w-full justify-between'
        }`}
        aria-label="Seleccionar pais"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 overflow-hidden">
          <img
            src={getFlagUrl(selectedCountry.code)}
            alt={selectedCountry.name}
            className="h-3.5 w-5 rounded-[2px] object-cover shadow-sm"
          />
          <span className="min-w-0">
            {compact ? (
              <span className="block truncate text-xs font-bold text-brand-text">
                {selectedCountry.code}
              </span>
            ) : (
              <>
                <span className="block truncate text-xs font-bold text-brand-text">
                  {selectedCountry.name}
                </span>
                <span className="block truncate text-[10px] font-medium text-brand-text-muted/75">
                  {selectedCountry.cityName}
                </span>
              </>
            )}
          </span>
        </span>
        <FaChevronDown className={`text-[10px] text-brand-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180 text-brand-primary' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-brand-border/10 bg-white/95 py-2 shadow-2xl backdrop-blur-md">
          <div className="border-b border-brand-border/10 bg-brand-bg-sec/20 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-brand-accent">
            Selecciona tu pais
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-brand-border/5">
            {REGIONS.map((region) => (
              <div key={region} className="py-2">
                <div className="px-4 py-1 text-[9px] font-bold uppercase tracking-widest text-brand-text-muted/60">
                  {region}
                </div>
                <div className="mt-1 space-y-0.5">
                  {getPublicCountriesByRegion(region).map((country) => {
                    const isSelected = selectedCountry.code === country.code;

                    return (
                      <button
                        key={country.code}
                        type="button"
                        onClick={() => {
                          onSelect(country);
                          setIsOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-4 py-2 text-xs transition-all duration-200 ${
                          isSelected
                            ? 'border-l-4 border-brand-accent bg-brand-accent/5 pl-3 font-extrabold text-brand-accent'
                            : 'pl-4 text-brand-text hover:bg-brand-bg-sec/40 hover:text-brand-accent'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <img
                            src={getFlagUrl(country.code)}
                            alt={country.name}
                            className="h-3.5 w-5 rounded-[2px] object-cover"
                          />
                          <span>{country.name}</span>
                        </span>
                        <span className="text-[10px] font-medium text-brand-text-muted/65">
                          {country.cityName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

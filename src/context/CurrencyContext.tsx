'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Currency = 'ARS' | 'USD';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>('ARS');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('currency') as Currency;
    setTimeout(() => {
      if (saved === 'ARS' || saved === 'USD') {
        setCurrencyState(saved);
      }
      setMounted(true);
    }, 0);
  }, []);

  const setCurrency = (newCurrency: Currency) => {
    setCurrencyState(newCurrency);
    try {
      localStorage.setItem('currency', newCurrency);
    } catch (e) {
      console.warn('No se pudo guardar la moneda en localStorage', e);
    }
  };

  // Previene hydration warnings exponiendo la selección de cliente una vez montado.
  // Durante SSR y primer render del cliente, usa 'ARS' como fallback seguro.
  const activeCurrency = mounted ? currency : 'ARS';

  return (
    <CurrencyContext.Provider value={{ currency: activeCurrency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency debe usarse dentro de un CurrencyProvider');
  }
  return context;
}

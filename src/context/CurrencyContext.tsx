'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  COUNTRY_STORAGE_KEY,
  CountryOption,
  DEFAULT_COUNTRY_CODE,
  detectCountryFromClient,
  findCountryByCode,
  getDefaultCountry,
  getPreferredCurrencyForCountry,
} from '@/lib/countries';

type Currency = 'ARS' | 'USD' | 'CRYPTO';

interface CurrencyContextType {
  currency: 'ARS' | 'USD';
  displayCurrency: 'ARS' | 'USD';
  country: CountryOption;
  selectedCountry: CountryOption;
  isCountryResolved: boolean;
  mounted: boolean;
  setCurrency: (currency: Currency) => void;
  setCountry: (country: CountryOption | string) => void;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

function mapLegacyCurrencyToCountry(currency: Currency | null | undefined): CountryOption {
  if (currency === 'ARS') {
    return findCountryByCode(DEFAULT_COUNTRY_CODE, { normalizeDetected: true, publicOnly: true }) || getDefaultCountry();
  }

  return findCountryByCode('US', { normalizeDetected: true, publicOnly: true }) || getDefaultCountry();
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [country, setCountryState] = useState<CountryOption>(getDefaultCountry());
  const [mounted, setMounted] = useState(false);
  const [isCountryResolved, setIsCountryResolved] = useState(false);

  useEffect(() => {
    let isActive = true;

    const resolveCountry = async () => {
      setMounted(true);

      const savedCountryCode = localStorage.getItem(COUNTRY_STORAGE_KEY);
      if (savedCountryCode) {
        const savedCountry = findCountryByCode(savedCountryCode, { normalizeDetected: true, publicOnly: true });
        if (savedCountry && isActive) {
          setCountryState(savedCountry);
          setIsCountryResolved(true);
          return;
        }
      }

      const legacyCurrency = localStorage.getItem('currency') as Currency | null;
      if (legacyCurrency === 'ARS' || legacyCurrency === 'USD' || legacyCurrency === 'CRYPTO') {
        const mappedCountry = mapLegacyCurrencyToCountry(legacyCurrency);
        if (isActive) {
          setCountryState(mappedCountry);
          localStorage.setItem(COUNTRY_STORAGE_KEY, mappedCountry.code);
          setIsCountryResolved(true);
          return;
        }
      }

      const detectedCountry = await detectCountryFromClient();
      if (isActive) {
        setCountryState(detectedCountry);
        setIsCountryResolved(true);
      }
    };

    resolveCountry();

    return () => {
      isActive = false;
    };
  }, []);

  const setCountry = (nextCountry: CountryOption | string) => {
    const resolvedCountry = typeof nextCountry === 'string'
      ? findCountryByCode(nextCountry, { normalizeDetected: true, publicOnly: true })
      : findCountryByCode(nextCountry.code, { normalizeDetected: true, publicOnly: true }) || nextCountry;

    if (!resolvedCountry) return;

    setCountryState(resolvedCountry);
    setIsCountryResolved(true);

    try {
      localStorage.setItem(COUNTRY_STORAGE_KEY, resolvedCountry.code);
    } catch (error) {
      console.warn('No se pudo guardar el pais en localStorage', error);
    }
  };

  const setCurrency = (nextCurrency: Currency) => {
    const targetCountry = mapLegacyCurrencyToCountry(nextCurrency);
    setCountry(targetCountry);
  };

  const displayCurrency = getPreferredCurrencyForCountry(country);

  return (
    <CurrencyContext.Provider
      value={{
        currency: displayCurrency,
        displayCurrency,
        country,
        selectedCountry: country,
        isCountryResolved,
        mounted,
        setCurrency,
        setCountry,
      }}
    >
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

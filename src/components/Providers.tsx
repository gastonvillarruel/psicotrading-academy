'use client';

import { SessionProvider } from 'next-auth/react';
import React from 'react';
import { CurrencyProvider } from '@/context/CurrencyContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CurrencyProvider>
        {children}
      </CurrencyProvider>
    </SessionProvider>
  );
}

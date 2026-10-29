'use client';

import { SessionProvider } from 'next-auth/react';
import React from 'react';
import { CurrencyProvider } from '@/context/CurrencyContext';
import SessionCleanup from '@/components/snipers/SessionCleanup';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionCleanup />
      <CurrencyProvider>
        {children}
      </CurrencyProvider>
    </SessionProvider>
  );
}

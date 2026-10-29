'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { scrubIntents } from '@/lib/snipers/pending-intent';

export default function SessionCleanup() {
  const { data, status } = useSession();
  const owner = data?.user?.id ?? null;
  useEffect(() => {
    if (status === 'loading') return;
    const clean = () => { try { scrubIntents(sessionStorage, status === 'authenticated' ? owner : null); } catch { /* A blocked store cannot retain new commercial submissions. */ } };
    clean();
    const timer = window.setInterval(clean, 60000);
    return () => window.clearInterval(timer);
  }, [owner, status]);
  return null;
}

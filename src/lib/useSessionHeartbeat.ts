import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface UseSessionHeartbeatProps {
  onInvalidSession?: () => void;
  intervalMs?: number;
}

export function useSessionHeartbeat({
  onInvalidSession,
  intervalMs = 20000, // Cada 20 segundos
}: UseSessionHeartbeatProps = {}) {
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    console.log('[useSessionHeartbeat] Hook montado.');

    const checkSession = async () => {
      if (hasRedirected.current) {
        return;
      }

      console.log('[useSessionHeartbeat] Realizando consulta a /api/auth/validate-session...');
      try {
        const res = await fetch('/api/auth/validate-session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        console.log(`[useSessionHeartbeat] Status HTTP recibido: ${res.status}`);
        
        if (res.status === 401 || res.status === 403) {
          console.log('[useSessionHeartbeat] ¡Sesión expirada detectada (401/403)!');
          
          if (!hasRedirected.current) {
            hasRedirected.current = true;
            if (onInvalidSession) {
              console.log('[useSessionHeartbeat] Ejecutando callback onInvalidSession...');
              try {
                onInvalidSession();
              } catch (e) {
                console.error('[useSessionHeartbeat] Error en callback onInvalidSession:', e);
              }
            }
            console.log('[useSessionHeartbeat] Redirigiendo vía window.location.replace...');
            window.location.replace('/login?error=SessionExpired');
          }
        } else if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.enabled === false) {
            console.log('[useSessionHeartbeat] Feature flag desactivada en el servidor. Deteniendo heartbeat.');
            clearInterval(timer);
            return;
          }
          console.log('[useSessionHeartbeat] Confirmación: Sesión es válida.');
        } else {
          console.log(`[useSessionHeartbeat] Recibido status inesperado: ${res.status}`);
        }
      } catch (error) {
        console.error('[useSessionHeartbeat] Error al invocar la API de sesión:', error);
      }
    };

    // Chequeo inicial y programar intervalos
    checkSession();
    timer = setInterval(checkSession, intervalMs);

    return () => {
      console.log('[useSessionHeartbeat] Hook desmontado, limpiando timer.');
      clearInterval(timer);
    };
  }, [router, onInvalidSession, intervalMs]);
}

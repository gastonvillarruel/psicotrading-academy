'use client';

import React, { useState } from 'react';
import { togglePromoBannerAction } from '@/app/actions/site-settings';
import { FaTag, FaCheck, FaTimes } from 'react-icons/fa';

interface PromoBannerAdminToggleProps {
  initialEnabled: boolean;
}

export default function PromoBannerAdminToggle({ initialEnabled }: PromoBannerAdminToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleToggle = async () => {
    const nextState = !enabled;
    setIsLoading(true);
    setMessage(null);

    try {
      const res = await togglePromoBannerAction(nextState);
      if (res.success) {
        setEnabled(res.enabled);
        setMessage({
          text: res.enabled ? 'Banner activado en la página principal' : 'Banner desactivado en todo el sitio',
          type: 'success',
        });
      } else {
        setMessage({ text: res.error || 'Error al actualizar', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Error inesperado de conexión', type: 'error' });
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setMessage(null);
      }, 4000);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all">
      <div className="flex items-start sm:items-center gap-4">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          enabled ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'
        }`}>
          <FaTag className="text-lg" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-gray-900">Banner de Oferta Especial por Tiempo Limitado</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider ${
              enabled
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-gray-100 text-gray-500 border border-gray-200'
            }`}>
              {enabled ? 'ACTIVADO (Solo Inicio)' : 'DESACTIVADO'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {enabled
              ? 'Visible con cuenta regresiva exclusivamente en la portada principal (/).'
              : 'Completamente oculto en todo el sitio.'}
          </p>
          {message && (
            <p className={`text-xs font-semibold mt-1.5 flex items-center gap-1 ${
              message.type === 'success' ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {message.type === 'success' ? <FaCheck className="text-[10px]" /> : <FaTimes className="text-[10px]" />}
              <span>{message.text}</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center self-end sm:self-center shrink-0">
        <button
          type="button"
          disabled={isLoading}
          onClick={handleToggle}
          className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
            enabled ? 'bg-amber-500' : 'bg-gray-200'
          }`}
          role="switch"
          aria-checked={enabled}
        >
          <span className="sr-only">Activar o desactivar banner promocional</span>
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              enabled ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

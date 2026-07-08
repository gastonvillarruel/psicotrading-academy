'use client';

import React, { useEffect, useRef } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'success' | 'info' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Escuchar tecla Escape para cerrar
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Evitar scroll en la página detrás del modal
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  // Manejar clic fuera del contenido del modal
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onCancel();
    }
  };

  // Determinar colores del botón de acción principal y del icono según variante
  let confirmBtnClass = 'bg-teal-600 hover:bg-teal-700 text-white focus:ring-teal-500';
  let iconBgClass = 'bg-teal-50 text-teal-600';
  let iconSvg = (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  if (variant === 'danger') {
    confirmBtnClass = 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500';
    iconBgClass = 'bg-red-50 text-red-600';
    iconSvg = (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  } else if (variant === 'warning') {
    confirmBtnClass = 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500';
    iconBgClass = 'bg-amber-50 text-amber-500';
    iconSvg = (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  } else if (variant === 'success') {
    confirmBtnClass = 'bg-teal-600 hover:bg-teal-700 text-white focus:ring-teal-500';
    iconBgClass = 'bg-teal-50 text-teal-600';
    iconSvg = (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
      </svg>
    );
  }

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-100 p-6 flex flex-col transition-all transform scale-100"
      >
        <div className="flex items-start space-x-4">
          <div className={`p-3 rounded-2xl shrink-0 ${iconBgClass}`}>
            {iconSvg}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 truncate">
              {title}
            </h3>
            <div className="mt-2 text-sm text-gray-500 whitespace-pre-line leading-relaxed">
              {message}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold rounded-2xl border border-gray-200 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 text-sm font-semibold rounded-2xl focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors cursor-pointer ${confirmBtnClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

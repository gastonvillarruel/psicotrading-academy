'use client';

import React, { useState } from 'react';

export default function LeadCaptureFooter() {
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <>
      <footer className="w-full bg-brand-card/60 border-t border-brand-border/30 py-8 mt-16 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          {/* Logo y Copyright */}
          <div className="flex items-center space-x-3 select-none">
            <img
              src="/brand/logos/logo-solo-oscuro.png"
              alt="PSICOEMOTRADING"
              className="h-5 w-auto object-contain opacity-80"
            />
            <span className="text-xs font-bold text-brand-text-muted uppercase">
              PSICOEMOTRADING
            </span>
            <span className="text-xs text-brand-text-muted/60">
              © {currentYear} Todos los derechos reservados.
            </span>
          </div>

          {/* Enlaces Legales en Modal (sin salir de la página) */}
          <div className="text-xs text-brand-text-muted">
            <button
              type="button"
              onClick={() => setShowPrivacyModal(true)}
              className="hover:text-brand-primary underline transition-colors cursor-pointer"
            >
              Política de Privacidad y Aviso Legal
            </button>
          </div>
        </div>

        {/* Disclaimer Financiero Obligatorio */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 pt-4 border-t border-brand-border/15 text-center">
          <p className="text-[11px] text-brand-text-muted/60 leading-relaxed max-w-3xl mx-auto">
            El material y las sesiones de este taller tienen fines formativos y educativos sobre disciplina y psicología en el trading. No constituyen recomendaciones de inversión ni asesoramiento financiero.
          </p>
        </div>
      </footer>

      {/* Modal de Política de Privacidad */}
      {showPrivacyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => setShowPrivacyModal(false)}
        >
          <div
            className="bg-brand-card border border-brand-border/40 rounded-2xl max-w-lg w-full p-6 sm:p-8 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-brand-border/30 pb-3">
              <h2 className="text-lg font-bold text-brand-text">Política de Privacidad y Términos</h2>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="text-brand-text-muted hover:text-brand-text font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-brand-text-muted space-y-3 leading-relaxed">
              <p>
                <strong>Tratamiento de Datos:</strong> Los datos proporcionados durante el registro se utilizan exclusivamente para gestionar tu cupo en el taller, enviarte recordatorios y permitirte el acceso al grupo de WhatsApp y a la plataforma educativa.
              </p>
              <p>
                <strong>No Comercialización:</strong> Psicoemotrading no vende ni cede tu información de contacto a terceros.
              </p>
              <p>
                <strong>Finalidad Educativa:</strong> El contenido del taller tiene carácter estrictamente formativo y de desarrollo psicológico y técnico para traders. No constituye asesoramiento financiero ni recomendaciones de inversión.
              </p>
            </div>
            <div className="pt-3 border-t border-brand-border/30 text-right">
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="px-5 py-2 bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

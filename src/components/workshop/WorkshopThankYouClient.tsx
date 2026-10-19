'use client';

import React, { useEffect, useState } from 'react';
import { FaWhatsapp, FaCheckCircle, FaLock, FaCalendarAlt, FaClock, FaVideo, FaUserTie } from 'react-icons/fa';
import { trackWorkshopLead, trackWhatsAppGroupClick } from '@/lib/meta-pixel';

interface WorkshopThankYouClientProps {
  courseId: string;
  courseTitle: string;
  whatsappUrl: string;
  justEnrolled: boolean;
  scheduledDateLabel?: string;
  scheduledTimeLabel?: string;
  modalityLabel?: string;
  instructorName?: string;
}

export default function WorkshopThankYouClient({
  courseId,
  courseTitle,
  whatsappUrl,
  justEnrolled,
  scheduledDateLabel,
  scheduledTimeLabel,
  modalityLabel = 'En vivo por Zoom',
  instructorName,
}: WorkshopThankYouClientProps) {
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Registro de evento Lead de Meta Pixel (Garantizado 1 sola vez tras confirmación del servidor)
  useEffect(() => {
    if (justEnrolled) {
      const storageKey = `lead_tracked_${courseId}`;
      const alreadyReported = typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) : null;

      if (!alreadyReported) {
        trackWorkshopLead(courseTitle, { course_id: courseId });
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(storageKey, 'true');
        }
      }
    }
  }, [justEnrolled, courseId, courseTitle]);

  const handleWhatsAppClick = () => {
    trackWhatsAppGroupClick(courseTitle, { course_id: courseId });
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 sm:py-12 animate-fade-in-up">
      {/* Tarjeta Principal de Confirmación */}
      <div className="bg-brand-card/90 backdrop-blur-md rounded-3xl border border-brand-border/40 shadow-2xl p-6 sm:p-10 text-center relative overflow-hidden">
        {/* Glow decorativo de fondo */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Icono de Confirmación */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-inner">
          <FaCheckCircle className="w-10 h-10" />
        </div>

        {/* Título de Confirmación */}
        <span className="inline-block px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
          Inscripción Confirmada
        </span>

        <h1 className="text-3xl sm:text-4xl font-black text-brand-text tracking-tight mb-3">
          ¡Ya estás inscripto!
        </h1>

        <p className="text-base sm:text-lg text-brand-text-muted max-w-lg mx-auto font-light leading-relaxed mb-6">
          Tu lugar para el taller <strong className="font-bold text-brand-text uppercase">{courseTitle}</strong> está reservado y registrado con éxito.
        </p>

        {/* Datos Informativos del Taller */}
        {(scheduledDateLabel || modalityLabel || instructorName) && (
          <div className="bg-brand-bg-sec/50 border border-brand-border/30 rounded-2xl p-4 sm:p-5 mb-8 text-left grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm text-brand-text-muted">
            {scheduledDateLabel && (
              <div className="flex items-center space-x-2.5">
                <FaCalendarAlt className="text-brand-primary shrink-0 text-base" />
                <div>
                  <span className="block font-medium text-brand-text">{scheduledDateLabel}</span>
                  {scheduledTimeLabel && (
                    <span className="text-[11px] text-brand-text-muted/80 flex items-center gap-1 mt-0.5">
                      <FaClock className="text-[10px]" />
                      <span>{scheduledTimeLabel}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
            {modalityLabel && (
              <div className="flex items-center space-x-2.5">
                <FaVideo className="text-brand-accent shrink-0 text-base" />
                <div>
                  <span className="block font-medium text-brand-text">{modalityLabel}</span>
                  <span className="text-[11px] text-brand-text-muted/80">Acceso exclusivo para inscriptos</span>
                </div>
              </div>
            )}
            {instructorName && (
              <div className="flex items-center space-x-2.5 sm:col-span-2 pt-2 border-t border-brand-border/20">
                <FaUserTie className="text-brand-secondary shrink-0 text-base" />
                <div>
                  <span className="block font-medium text-brand-text">Responsable: {instructorName}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bloque Destacado de WhatsApp */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 sm:p-7 space-y-4 mb-6">
          <p className="text-sm sm:text-base text-brand-text font-medium leading-relaxed">
            Para recibir los enlaces de acceso directo, los recordatorios y el material complementario del taller, sumate ahora al grupo oficial:
          </p>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleWhatsAppClick}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-3 px-8 py-4 bg-[#25D366] hover:bg-[#20ba59] active:scale-[0.98] text-white font-extrabold text-base sm:text-lg rounded-2xl shadow-lg shadow-[#25D366]/25 transition-all hover:shadow-[#25D366]/40 cursor-pointer"
          >
            <FaWhatsapp className="text-2xl" />
            <span>UNIRME AL GRUPO DE WHATSAPP</span>
          </a>

          <p className="text-xs text-brand-text-muted font-light leading-relaxed max-w-md mx-auto">
            Pulsá el botón verde de arriba para incorporarte al grupo. Todo el acceso y las instrucciones se coordinan por allí.
          </p>
        </div>

        {/* Nota de Seguridad */}
        <div className="flex items-center justify-center space-x-2 text-xs text-brand-text-muted/70">
          <FaLock className="text-[10px]" />
          <span>Acceso seguro y verificado por Psicoemotrading</span>
        </div>
      </div>

      {/* Footer Legal Minimalista */}
      <footer className="mt-8 text-center text-xs text-brand-text-muted/60 space-y-2">
        <p>© {new Date().getFullYear()} PSICOEMOTRADING. Todos los derechos reservados.</p>
        <div>
          <button
            type="button"
            onClick={() => setShowPrivacyModal(true)}
            className="hover:text-brand-primary underline transition-colors cursor-pointer"
          >
            Política de Privacidad y Términos Legales
          </button>
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
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

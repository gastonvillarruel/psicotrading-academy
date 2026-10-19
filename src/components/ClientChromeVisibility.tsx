"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

import { FaWhatsapp } from "react-icons/fa";

interface ClientChromeVisibilityProps {
  children: React.ReactNode;
  /** Si la terminal de trading está conectada: sin ella, su enlace no sale en el menú. */
  terminalEnabled?: boolean;
  leadCaptureSlugs?: string[];
}

export default function ClientChromeVisibility({
  children,
  terminalEnabled = false,
  leadCaptureSlugs = [],
}: ClientChromeVisibilityProps) {
  const pathname = usePathname();

  const segments = pathname?.split("/").filter(Boolean) ?? [];

  const isCampusCourseDetail =
    segments[0] === "mi-campus" && segments.length === 2;

  const isEvaluationRoute = pathname?.startsWith("/evaluacion");

  // Ocultar en páginas de gracias de talleres
  const isThankYouPage = segments[0] === "campus" && segments[2] === "gracias";

  // Ocultar en landings con Modo Captación activado
  const isLeadCaptureLanding =
    segments[0] === "campus" &&
    segments.length === 2 &&
    leadCaptureSlugs.includes(segments[1]);

  if (isCampusCourseDetail || isEvaluationRoute || isThankYouPage || isLeadCaptureLanding) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar terminalEnabled={terminalEnabled} />
      {children}
      <Footer />
      <a
        href="https://api.whatsapp.com/send?phone=5491176632244"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-95 hover:-translate-y-0.5 hover:scale-105"
        style={{
          backgroundColor: '#25D366',
          boxShadow: '0 6px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
          transition: 'all 0.25s ease',
        }}
        aria-label="Contactar por WhatsApp"
      >
        <FaWhatsapp size={20} />
      </a>
    </>
  );
}

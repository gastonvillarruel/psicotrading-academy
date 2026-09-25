"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface ClientChromeVisibilityProps {
  children: React.ReactNode;
  /** Si la terminal de trading está conectada: sin ella, su enlace no sale en el menú. */
  terminalEnabled?: boolean;
}

export default function ClientChromeVisibility({
  children,
  terminalEnabled = false,
}: ClientChromeVisibilityProps) {
  const pathname = usePathname();

  const segments = pathname?.split("/").filter(Boolean) ?? [];

  const isCampusCourseDetail =
    segments[0] === "mi-campus" && segments.length === 2;

  const isEvaluationRoute = pathname?.startsWith("/evaluacion");

  if (isCampusCourseDetail || isEvaluationRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar terminalEnabled={terminalEnabled} />
      {children}
      <Footer />
    </>
  );
}

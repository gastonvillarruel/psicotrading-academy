import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import ClientChromeVisibility from "@/components/ClientChromeVisibility";
import { FaWhatsapp } from "react-icons/fa";
import { db } from '@/lib/db';
import PromoBanner from '@/components/PromoBanner';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "PSICOEMOTRADING - Dominá tus emociones antes de operar el mercado",
  description: "Sistema de entrenamiento mental y emocional para traders enfocados en disciplina, método y consistencia.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch all courses to find the cheapest enabled ones in each currency
  const allCourses = await db.course.findMany({
    select: {
      price: true,
      priceARS: true,
      priceUSD: true,
      priceUSDT: true,
      available: true,
    },
  });

  const enabledCourses = allCourses.filter(c => c.available !== false);

  const arsPrices = enabledCourses
    .map(c => c.priceARS !== null && c.priceARS !== undefined ? Number(c.priceARS) : (typeof c.price === 'number' ? c.price : 0))
    .filter(p => p > 0);
  const minARS = arsPrices.length > 0 ? Math.min(...arsPrices) : 0;

  const usdPrices = enabledCourses
    .map(c => c.priceUSD !== null && c.priceUSD !== undefined ? Number(c.priceUSD) : 0)
    .filter(p => p > 0);
  const minUSD = usdPrices.length > 0 ? Math.min(...usdPrices) : 0;

  const usdtPrices = enabledCourses
    .map(c => c.priceUSDT !== null && c.priceUSDT !== undefined ? Number(c.priceUSDT) : 0)
    .filter(p => p > 0);
  const minUSDT = usdtPrices.length > 0 ? Math.min(...usdtPrices) : 0;

  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} h-full antialiased`}>
      <head />
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-200">
        <Providers>
          <ClientChromeVisibility>
            <PromoBanner minPrices={{ ARS: minARS, USD: minUSD, CRYPTO: minUSDT }} />
            <div className="flex-grow">
              {children}
            </div>
          </ClientChromeVisibility>
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
        </Providers>
      </body>
    </html>
  );
}

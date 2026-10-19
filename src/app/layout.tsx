import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import ClientChromeVisibility from "@/components/ClientChromeVisibility";
import { isTerminalConfigured } from "@/lib/terminal-sso";
import { FaWhatsapp } from "react-icons/fa";
import { db } from '@/lib/db';
import PromoBanner from '@/components/PromoBanner';
import MetaPixelScript from '@/components/analytics/MetaPixelScript';

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
  metadataBase: new URL("https://www.psicoemotrading.com"),
  title: "Psicoemotrading | Entrenamiento emocional para traders",
  description:
    "Entrena tu disciplina, gestion emocional y consistencia como trader con cursos, talleres y herramientas de Psicoemotrading.",
  alternates: {
    canonical: "https://www.psicoemotrading.com/",
  },
  openGraph: {
    title: "Psicoemotrading | Entrenamiento emocional para traders",
    description:
      "Entrena tu disciplina, gestion emocional y consistencia como trader con cursos, talleres y herramientas de Psicoemotrading.",
    url: "https://www.psicoemotrading.com/",
    siteName: "Psicoemotrading",
    images: [
      {
        url: "https://www.psicoemotrading.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Psicoemotrading - entrenamiento emocional para traders",
      },
    ],
    locale: "es_AR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Psicoemotrading | Entrenamiento emocional para traders",
    description:
      "Entrena tu disciplina, gestion emocional y consistencia como trader con cursos, talleres y herramientas de Psicoemotrading.",
    images: ["https://www.psicoemotrading.com/og-image.jpg"],
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Psicoemotrading",
  url: "https://www.psicoemotrading.com/",
  logo: "https://www.psicoemotrading.com/brand/logos/logo-solo-oscuro.png",
  sameAs: [
    "https://t.me/fullpsicoytrading",
    "https://www.tiktok.com/@elgonzotrader",
    "https://www.youtube.com/@elgonzotrader",
    "https://www.instagram.com/elgonzotrader",
    "https://x.com/elgonzotrader",
  ],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Psicoemotrading",
  url: "https://www.psicoemotrading.com/",
};

import { getPromoBannerStatus } from '@/app/actions/site-settings';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Estado del banner promocional y cursos
  const [promoBannerEnabled, allCourses] = await Promise.all([
    getPromoBannerStatus(),
    db.course.findMany({
      select: {
        slug: true,
        price: true,
        priceARS: true,
        priceUSD: true,
        priceUSDT: true,
        available: true,
        isLeadCapture: true,
      },
    }),
  ]);

  const leadCaptureSlugs = allCourses.filter(c => c.isLeadCapture).map(c => c.slug);
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
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteSchema),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-200">
        <Providers>
          <MetaPixelScript />
          <ClientChromeVisibility
            terminalEnabled={isTerminalConfigured()}
            leadCaptureSlugs={leadCaptureSlugs}
          >
            <PromoBanner
              minPrices={{ ARS: minARS, USD: minUSD, CRYPTO: minUSDT }}
              enabled={promoBannerEnabled}
            />
            <div className="flex-grow">
              {children}
            </div>
          </ClientChromeVisibility>
        </Providers>
      </body>
    </html>
  );
}

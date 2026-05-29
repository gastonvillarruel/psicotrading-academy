import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { FaWhatsapp } from "react-icons/fa";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PSICOEMOTRADING - Dominá tus emociones antes de operar el mercado",
  description: "Academia de entrenamiento mental para traders enfocados en disciplina, método y consistencia.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-200">
        <Providers>
          <Navbar />
          <div className="flex-grow">
            {children}
          </div>
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
        </Providers>
      </body>
    </html>
  );
}

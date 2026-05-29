export interface HeroSlide {
  title: string;
  subtitle: string;
  badge?: string;
  image: string; // Background / main image path
  instructorImage: string; // Mentor photo path
  ctaText: string;
  ctaUrl: string;
  active: boolean;
  order: number;
}

export const heroSlides: HeroSlide[] = [
  {
    title: "Dominá tus Emociones, Dominá el Mercado",
    subtitle: "Descubrí las herramientas psicológicas indispensables para operar con consistencia, control de impulsos y total disciplina.",
    badge: "MÁS POPULAR",
    image: "/images/bg_trading_1.png",
    instructorImage: "/brand/mentores/el-gonzo/1.png",
    ctaText: "Iniciar Introducción",
    ctaUrl: "/campus/introduccion-al-psicotrading",
    active: true,
    order: 1,
  },
  {
    title: "Gestión Monetaria y Riesgo Emocional",
    subtitle: "Aprendé a calcular el tamaño de tus posiciones y a mantener la calma en tus drawdowns para proteger tu cuenta.",
    badge: "ALTO RENDIMIENTO",
    image: "/images/bg_trading_2.png",
    instructorImage: "/brand/mentores/el-gonzo/2.png",
    ctaText: "Aprender Gestión",
    ctaUrl: "/campus/gestion-monetaria-y-riesgo",
    active: true,
    order: 2,
  },
];

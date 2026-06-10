export interface HeroSlide {
  title: string;
  subtitle: string;
  badge?: string;
  baseColor: string; // Background base color (e.g. '#eef2ff')
  gradientColors: string[]; // Custom gradient colors (will map to radial gradients)
  glowColor: string;  // Glow behind the instructor
  textColor: string; // Title font color (e.g. '#ffffff' or '#0f172a')
  subtitleColor: string; // Subtitle font color (e.g. '#e2e8f0' or '#475569')
  durationMs?: number; // Duration of slide in ms (default: 5000)
  courseSlug: string; // Course slug in database for availability checks
  instructorImage: string; // Mentor photo path
  ctaText: string;
  ctaUrl: string;
  active: boolean;
  order: number;
}

export const heroSlides: HeroSlide[] = [
  {
    title: "Dominá tus Emociones, Dominá el Mercado",
    subtitle: "Descubrí las herramientas psicológicas indispensables para operar con consistencia y total disciplina.",
    badge: "MÁS POPULAR",
    baseColor: "#a4b1ddff", // Soft indigo-blue base
    gradientColors: [
      "#5a72d4", // Medium blue
      "#4255be", // Deep indigo-blue
      "#8b5cf6"  // Violet/Purple
    ],
    glowColor: "rgba(99, 102, 241, 0.22)",
    textColor: "#0a1329", // Deep marine blue
    subtitleColor: "#2d3748", // Dark slate gray
    durationMs: 5000, // Duración en ms
    courseSlug: "introduccion-al-psicotrading",
    instructorImage: "/brand/mentores/el-gonzo/1.png",
    ctaText: "Ver Programa",
    ctaUrl: "/campus/introduccion-al-psicotrading",
    active: true,
    order: 1,
  },
  {
    title: "Gestión Monetaria y Riesgo Emocional",
    subtitle: "Aprendé a calcular tu posición y a mantener la calma en tus drawdowns para proteger tu capital.",
    badge: "ALTO RENDIMIENTO",
    baseColor: "#a8e7caff", // Soft emerald-green base
    gradientColors: [
      "#48c48a", // Medium emerald
      "#2e9c6a", // Deep forest green
      "#e9ba69ff"  // Amber/Gold
    ],
    glowColor: "rgba(16, 185, 129, 0.18)",
    textColor: "#052e16", // Deep forest green
    subtitleColor: "#1b4332", // Dark pine green
    durationMs: 5000, // Duración de 5 segundos
    courseSlug: "gestion-monetaria-y-riesgo",
    instructorImage: "/brand/mentores/el-gonzo/2.png",
    ctaText: "Ver Programa",
    ctaUrl: "/campus/gestion-monetaria-y-riesgo",
    active: true,
    order: 2,
  },
  {
    title: "PENTA TRADE: Scalping Profesional",
    subtitle: "Operá criptomonedas de alta volatilidad con 5 confirmaciones y gestión defensiva. ¡Incluye 1 MES BONIFICADO en el Entrenamiento Snipers!",
    badge: "MÉTODO COMPLETO",
    baseColor: "#ffdcd9", // Soft coral/salmon base
    gradientColors: [
      "#ffaba3", // Soft coral
      "#ff786e", // Coral/reddish
      "#f59e0b"  // Amber/Gold
    ],
    glowColor: "rgba(239, 68, 68, 0.18)",
    textColor: "#3b0712", // Deep dark rose-black
    subtitleColor: "#5c1d24", // Deep dark coral-gray
    durationMs: 10000,
    courseSlug: "penta-trade",
    instructorImage: "/brand/otros/trader-mas-bonus.png",
    ctaText: "Ver Programa",
    ctaUrl: "/campus/penta-trade",
    active: true,
    order: 3,
  },
];

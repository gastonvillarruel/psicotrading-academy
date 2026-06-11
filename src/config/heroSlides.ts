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
  badgeBg?: string;
  badgeTextColor?: string;
  badgeBorderColor?: string;
  btnEnabledBg?: string;
  btnEnabledTextColor?: string;
  btnDisabledBg?: string;
  btnDisabledTextColor?: string;
}

export const heroSlides: HeroSlide[] = [
  {
    title: "Dominá tus Emociones, <span style='color: #5a72d4'>Dominá el Mercado</span>",
    subtitle: "Descubrí las herramientas psicológicas indispensables para operar con <span style='color: #6ba1d3ff'>consistencia y total disciplina</span>.",
    badge: "⭐ MÁS POPULAR",
    baseColor: "#1b057cff", // Soft indigo-blue base
    gradientColors: [
      "#001047", // Medium blue
      "#001047", // Deep indigo-blue
      "#3851b8ff"  // Violet/Purple
    ],
    glowColor: "rgba(99, 102, 241, 0.22)",
    textColor: "#ffffffff",
    subtitleColor: "#f9fafcff", // Dark slate gray
    durationMs: 5000, // Duración en ms
    courseSlug: "introduccion-al-psicotrading",
    instructorImage: "/brand/otros/brain.png",
    ctaText: "Ver Programa",
    ctaUrl: "/campus/introduccion-al-psicotrading",
    active: true,
    order: 1,
    badgeBg: "rgba(255, 255, 255, 0.15)",
    badgeTextColor: "#ffffff",
    badgeBorderColor: "#5a72d4",
    btnEnabledBg: "#f3f312ff",
    btnEnabledTextColor: "#1a1a1aff",
    btnDisabledBg: "",
    btnDisabledTextColor: "",
  },
  {
    title: "Gestión Monetaria y <br/><span style='color: #42c054'>Riesgo Emocional</span>",
    subtitle: "Aprendé a calcular tu posición y a mantener la calma <br/>en tus drawdowns para <span style='color: #42c054'>proteger tu capital.</span>",
    badge: "📈 ALTO RENDIMIENTO",
    baseColor: "#023b2aff",
    gradientColors: [
      "#002419",
      "#098559ff",
      "#094e33ff"
    ],
    glowColor: "rgba(16, 185, 72, 0.18)",
    textColor: "#f3f3f3ff",
    subtitleColor: "#ffffffff",
    durationMs: 5000, // Duración de 5 segundos
    courseSlug: "gestion-monetaria-y-riesgo",
    instructorImage: "/brand/otros/balanza.png",
    ctaText: "Ver Programa",
    ctaUrl: "/campus/gestion-monetaria-y-riesgo",
    active: true,
    order: 2,
    badgeBg: "rgba(255, 255, 255, 0.15)",
    badgeTextColor: "#ffffff",
    badgeBorderColor: "rgba(52, 160, 10, 0.61)",
    btnEnabledBg: "#42c054",
    btnEnabledTextColor: "#ffffff",
    btnDisabledBg: "",
    btnDisabledTextColor: "",
  },
  {
    title: "<span style='color: #d32a2aff'>PENTA TRADE:</span> Scalping de Criptomonedas",
    subtitle: "Operá criptomonedas de alta volatilidad con 5 confirmaciones y gestión defensiva. ¡Incluye <span style='color: #d32a2aff'>1 MES BONIFICADO</span> en el Entrenamiento Snipers!",
    badge: "🚀 MÉTODO COMPLETO",
    baseColor: "#000000ff",
    gradientColors: [
      "#1d0908ff",
      "#66110cff",
      "#ad2323ff"
    ],
    glowColor: "rgba(239, 68, 68, 0.18)",
    textColor: "#fff0f0ff",
    subtitleColor: "#ffffffff",
    durationMs: 10000,
    courseSlug: "penta-trade",
    instructorImage: "/brand/otros/trader-mas-bonus.png",
    ctaText: "Ver Programa",
    ctaUrl: "/campus/penta-trade",
    active: true,
    order: 3,
    badgeBg: "rgba(255, 255, 255, 0.15)",
    badgeTextColor: "#ffffff",
    badgeBorderColor: "rgba(172, 23, 23, 0.62)",
    btnEnabledBg: "#d32a2aff",
    btnEnabledTextColor: "#ffffffff",
    btnDisabledBg: "",
    btnDisabledTextColor: "",
  },
];

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
  courseSlug?: string; // Course slug in database for availability checks
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
  imagePosition?: 'left' | 'right';
  imageScale?: number;
  imageTranslateY?: string;
}

export const heroSlides: HeroSlide[] = [
  {
    title: "¿Operas con el <span style='color: #f8ea67ff'>Sindrome del Impostor?</span>",
    subtitle:
      "<span style='font-size: 1.15em'>¿Crees que tus ganancias son suerte o dudas de tu capacidad como trader?<br/><span style='color:#f8ea67ff'>Respondé 10 preguntas</span> y descubrí tu nivel de vulnerabilidad.<br/><strong>Basada en el último Café & Psicotrading.</strong></span>", badge: "🧠 DIAGNÓSTICO DE LA SEMANA",
    baseColor: "#3a7fe4", // Soft indigo-blue base
    gradientColors: [
      "#3a7fe4", // Medium blue
      "#3a7fe4", // Deep indigo-blue
      "#3a7fe4"  // Violet/Purple
    ],
    glowColor: "rgba(99, 102, 241, 0.22)",
    textColor: "#ffffffff",
    subtitleColor: "#f9fafcff", // Dark slate gray
    durationMs: 10000, // Duración en ms
    courseSlug: "",
    instructorImage: "/brand/otros/sindrome-impostor.png",
    ctaText: "Realizar Evaluación",
    ctaUrl: "/evaluacion/el-sindrome-del-impostor-en-el-trading",
    active: true,
    order: 1,
    badgeBg: "rgba(255, 255, 255, 0.05)",
    badgeTextColor: "#f8ea67ff",
    badgeBorderColor: "#f8ea67ff",
    btnEnabledBg: "#f3f312ff",
    btnEnabledTextColor: "#1a1a1aff",
    btnDisabledBg: "",
    btnDisabledTextColor: "",
    imageScale: 1.095,
    imageTranslateY: "0.5%",
  },
  {
    title: "Gestión Monetaria y <br/><span style='color: #f8ea67ff'>Riesgo Emocional</span>",
    subtitle: "<span style='font-size: 1.2em'>Aprendé a calcular tu posición y a mantener la calma <br/>en tus drawdowns para <span style='color: #f8ea67ff'>proteger tu capital.</span></span>",
    badge: "📈 ALTO RENDIMIENTO",
    baseColor: "#3a7fe4",
    gradientColors: [
      "#3a7fe4",
      "#3a7fe4",
      "#3a7fe4"
    ],
    glowColor: "rgba(16, 185, 72, 0.18)",
    textColor: "#f3f3f3ff",
    subtitleColor: "#ffffffff",
    durationMs: 5000, // Duración de 5 segundos
    courseSlug: "gestion-monetaria-y-riesgo",
    instructorImage: "/brand/otros/gestion-monetaria.png",
    ctaText: "Ver Programa",
    ctaUrl: "/campus/gestion-monetaria-y-riesgo",
    active: true,
    order: 2,
    badgeBg: "rgba(255, 255, 255, 0)",
    badgeTextColor: "#f8ea67ff",
    badgeBorderColor: "#f8ea67ff",
    btnEnabledBg: "#f8ea67ff",
    btnEnabledTextColor: "#1a1a1aff",
    btnDisabledBg: "",
    btnDisabledTextColor: "",
    imagePosition: "right",
  },
  {
    title: "<span style='color: #f8ea67ff'>PENTA TRADE:</span> Scalping de Criptomonedas",
    subtitle: "<span style='font-size: 1.2em'>Operá criptomonedas de alta volatilidad con 5 confirmaciones y gestión defensiva. ¡Incluye <span style='color: #f8ea67ff'>1 MES BONIFICADO</span> en el Entrenamiento Snipers!</span>",
    badge: "🚀 MÉTODO COMPLETO",
    baseColor: "#3a7fe4",
    gradientColors: [
      "#3a7fe4",
      "#3a7fe4",
      "#3a7fe4"
    ],
    glowColor: "rgba(143, 242, 255, 0.64)",
    textColor: "#fff0f0ff",
    subtitleColor: "#ffffffff",
    durationMs: 5000,
    courseSlug: "penta-trade",
    instructorImage: "/brand/otros/trader-mas-bonus.png",
    ctaText: "Ver Programa",
    ctaUrl: "/campus/penta-trade",
    active: true,
    order: 3,
    badgeBg: "rgba(255, 255, 255, 0)",
    badgeTextColor: "#f8ea67ff",
    badgeBorderColor: "#f8ea67ff",
    btnEnabledBg: "#f8ea67ff",
    btnEnabledTextColor: "#1a1a1aff",
    btnDisabledBg: "",
    btnDisabledTextColor: "",
  },
];

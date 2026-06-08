export interface HeroSlide {
  title: string;
  subtitle: string;
  badge?: string;
  bgGradient: string; // CSS mesh/gradient string
  glowColor: string;  // Glow behind the instructor
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
    bgGradient: "radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.38) 0px, transparent 70%), radial-gradient(at 50% 0%, rgba(139, 92, 246, 0.32) 0px, transparent 60%), radial-gradient(at 100% 0%, rgba(20, 184, 166, 0.28) 0px, transparent 60%)",
    glowColor: "rgba(59, 130, 246, 0.35)",
    instructorImage: "/brand/mentores/el-gonzo/1.png",
    ctaText: "Proximamente",
    ctaUrl: "/campus",
    active: true,
    order: 1,
  },
  {
    title: "Gestión Monetaria y Riesgo Emocional",
    subtitle: "Aprendé a calcular tu posición y a mantener la calma en tus drawdowns para proteger tu capital.",
    badge: "ALTO RENDIMIENTO",
    bgGradient: "radial-gradient(at 0% 0%, rgba(13, 148, 136, 0.38) 0px, transparent 70%), radial-gradient(at 50% 0%, rgba(245, 158, 11, 0.28) 0px, transparent 60%), radial-gradient(at 100% 0%, rgba(16, 185, 129, 0.28) 0px, transparent 60%)",
    glowColor: "rgba(245, 158, 11, 0.3)",
    instructorImage: "/brand/mentores/el-gonzo/2.png",
    ctaText: "Proximamente",
    ctaUrl: "/campus",
    active: true,
    order: 2,
  },
];

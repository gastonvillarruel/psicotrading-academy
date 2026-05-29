import { z } from 'zod';

export interface BaseSection<TType extends string, TData> {
  id: string;
  type: TType;
  enabled: boolean;
  data: TData;
}

export type HeroEnhancementsSection = BaseSection<"heroEnhancements", {
  promotionalBadges?: string[];
  whatsappCtaText?: string;
  quickHighlightsOverride?: string[];
  urgencyText?: string;
  secondaryText?: string;
}>;

export type ProblemsSection = BaseSection<"problems", {
  title: string;
  description?: string;
  items: string[];
  transformationMessage?: string;
}>;

export type AchievementsSection = BaseSection<"achievements", {
  title: string;
  benefits: string[];
}>;

export type ProposalSection = BaseSection<"proposal", {
  title: string;
  subtitle?: string;
  content: string; // Markdown
}>;

export type AdditionalBenefitsSection = BaseSection<"additionalBenefits", {
  title?: string;
  benefits: Array<{ icon: string; title: string; description: string; }>;
}>;

export type CampusVirtualSection = BaseSection<"campusVirtual", {
  title: string;
  description: string;
  image?: string;
  gallery?: string[];
  videoUrl?: string;
}>;

export type InstructorSection = BaseSection<"instructorSection", {
  title?: string;
  instructors: Array<{
    name: string;
    role: string;
    bio: string;
    avatarUrl: string;
    socials?: { twitter?: string; linkedin?: string; instagram?: string; youtube?: string; };
    rating?: number;
    studentsCount?: number;
  }>;
}>;

export type RequirementsSection = BaseSection<"requirements", {
  title?: string;
  requiredItems: string[];
  optionalItems?: string[];
}>;

export type FeaturesGridSection = BaseSection<"featuresGrid", {
  title?: string;
  items: Array<{ icon: string; title: string; description: string; }>;
}>;

export type EnrollmentEnhancementsSection = BaseSection<"enrollmentEnhancements", {
  title?: string;
  subtitle?: string;
  urgencyText?: string;
  extraNote?: string;
  whatsappHelpText?: string;
}>;

export type TestimonialsSection = BaseSection<"testimonials", {
  title?: string;
  items: Array<{ name: string; avatarUrl?: string; text: string; roleOrCompany?: string; rating?: number; }>;
}>;

export type FaqSection = BaseSection<"faq", {
  title?: string;
  items: Array<{ question: string; answer: string; }>;
}>;

export type CurriculumSection = BaseSection<"curriculum", {
  title?: string;
  description?: string;
  modules: Array<{ title: string; description?: string; lessons?: string[]; }>;
}>;

export type CourseDescriptionSection =
  | HeroEnhancementsSection
  | ProblemsSection
  | AchievementsSection
  | ProposalSection
  | AdditionalBenefitsSection
  | CampusVirtualSection
  | InstructorSection
  | RequirementsSection
  | FeaturesGridSection
  | EnrollmentEnhancementsSection
  | TestimonialsSection
  | FaqSection
  | CurriculumSection;

// Zod Schemas para validación en tiempo de ejecución
export const heroEnhancementsSchema = z.object({
  promotionalBadges: z.array(z.string()).optional().default([]),
  whatsappCtaText: z.string().optional().default(''),
  quickHighlightsOverride: z.array(z.string()).optional(),
  urgencyText: z.string().optional(),
  secondaryText: z.string().optional(),
});

export const problemsSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().optional(),
  items: z.array(z.string()).min(1, 'Debe haber al menos un problema listado'),
  transformationMessage: z.string().optional(),
});

export const achievementsSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  benefits: z.array(z.string()).min(1, 'Debe haber al menos un beneficio listado'),
});

export const proposalSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  subtitle: z.string().optional(),
  content: z.string().min(1, 'El contenido de la propuesta es requerido'),
});

export const additionalBenefitsSchema = z.object({
  title: z.string().optional(),
  benefits: z.array(z.object({
    icon: z.string().min(1, 'El icono es requerido'),
    title: z.string().min(1, 'El título es requerido'),
    description: z.string().min(1, 'La descripción es requerida'),
  })).min(1, 'Debe haber al menos un beneficio'),
});

export const campusVirtualSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().min(1, 'La descripción es requerida'),
  image: z.string().optional(),
  gallery: z.array(z.string()).optional().default([]),
  videoUrl: z.string().optional(),
});

export const instructorSchema = z.object({
  title: z.string().optional(),
  instructors: z.array(z.object({
    name: z.string().min(1, 'El nombre es requerido'),
    role: z.string().min(1, 'El cargo es requerido'),
    bio: z.string().min(1, 'La biografía es requerida'),
    avatarUrl: z.string().min(1, 'La URL de foto es requerida'),
    socials: z.object({
      twitter: z.string().optional(),
      linkedin: z.string().optional(),
      instagram: z.string().optional(),
      youtube: z.string().optional(),
    }).optional(),
    rating: z.number().optional(),
    studentsCount: z.number().optional(),
  })).min(1, 'Debe haber al menos un instructor'),
});

export const requirementsSchema = z.object({
  title: z.string().optional(),
  requiredItems: z.array(z.string()).min(1, 'Debe haber al menos un requisito obligatorio'),
  optionalItems: z.array(z.string()).optional().default([]),
});

export const featuresGridSchema = z.object({
  title: z.string().optional(),
  items: z.array(z.object({
    icon: z.string().min(1, 'El icono es requerido'),
    title: z.string().min(1, 'El título es requerido'),
    description: z.string().min(1, 'La descripción es requerida'),
  })).min(1, 'Debe haber al menos una característica'),
});

export const enrollmentEnhancementsSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  urgencyText: z.string().optional(),
  extraNote: z.string().optional(),
  whatsappHelpText: z.string().optional(),
});

export const testimonialsSchema = z.object({
  title: z.string().optional(),
  items: z.array(z.object({
    name: z.string().min(1, 'El nombre es requerido'),
    avatarUrl: z.string().optional(),
    text: z.string().min(1, 'El testimonio es requerido'),
    roleOrCompany: z.string().optional(),
    rating: z.number().min(1).max(5).optional(),
  })).min(1, 'Debe haber al menos un testimonio'),
});

export const faqSchema = z.object({
  title: z.string().optional(),
  items: z.array(z.object({
    question: z.string().min(1, 'La pregunta es requerida'),
    answer: z.string().min(1, 'La respuesta es requerida'),
  })).min(1, 'Debe haber al menos una pregunta'),
});

export const curriculumSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  modules: z.array(z.object({
    title: z.string().min(1, 'El título del módulo es requerido'),
    description: z.string().optional(),
    lessons: z.array(z.string()).optional().default([]),
  })).min(1, 'Debe haber al menos un módulo'),
});

// Validación polimórfica basada en discriminador
export const singleSectionSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string(), type: z.literal('heroEnhancements'), enabled: z.boolean(), data: heroEnhancementsSchema }),
  z.object({ id: z.string(), type: z.literal('problems'), enabled: z.boolean(), data: problemsSchema }),
  z.object({ id: z.string(), type: z.literal('achievements'), enabled: z.boolean(), data: achievementsSchema }),
  z.object({ id: z.string(), type: z.literal('proposal'), enabled: z.boolean(), data: proposalSchema }),
  z.object({ id: z.string(), type: z.literal('additionalBenefits'), enabled: z.boolean(), data: additionalBenefitsSchema }),
  z.object({ id: z.string(), type: z.literal('campusVirtual'), enabled: z.boolean(), data: campusVirtualSchema }),
  z.object({ id: z.string(), type: z.literal('instructorSection'), enabled: z.boolean(), data: instructorSchema }),
  z.object({ id: z.string(), type: z.literal('requirements'), enabled: z.boolean(), data: requirementsSchema }),
  z.object({ id: z.string(), type: z.literal('featuresGrid'), enabled: z.boolean(), data: featuresGridSchema }),
  z.object({ id: z.string(), type: z.literal('enrollmentEnhancements'), enabled: z.boolean(), data: enrollmentEnhancementsSchema }),
  z.object({ id: z.string(), type: z.literal('testimonials'), enabled: z.boolean(), data: testimonialsSchema }),
  z.object({ id: z.string(), type: z.literal('faq'), enabled: z.boolean(), data: faqSchema }),
  z.object({ id: z.string(), type: z.literal('curriculum'), enabled: z.boolean(), data: curriculumSchema }),
]);

export const courseSectionsSchema = z.array(singleSectionSchema);

// Función para obtener la plantilla de secciones por defecto ordenadas
export function createDefaultSections(): CourseDescriptionSection[] {
  const uniqId = () => Math.random().toString(36).substring(2, 9);
  return [
    { id: uniqId(), type: 'heroEnhancements', enabled: false, data: { promotionalBadges: [], whatsappCtaText: '', quickHighlightsOverride: [] } },
    { id: uniqId(), type: 'problems', enabled: false, data: { title: '¿Te pasa alguna de estas situaciones?', items: [''], transformationMessage: '' } },
    { id: uniqId(), type: 'achievements', enabled: false, data: { title: '¿Qué lograrás?', benefits: [''] } },
    { id: uniqId(), type: 'proposal', enabled: false, data: { title: 'Desarrollo de la propuesta', subtitle: '', content: '' } },
    { id: uniqId(), type: 'additionalBenefits', enabled: false, data: { title: 'Beneficios adicionales', benefits: [{ icon: 'FaAward', title: 'Certificación', description: 'Certificado al completar el entrenamiento' }] } },
    { id: uniqId(), type: 'campusVirtual', enabled: false, data: { title: 'Campus Virtual', description: 'Nuestra plataforma interactiva para el seguimiento del alumno.', image: '', gallery: [], videoUrl: '' } },
    { id: uniqId(), type: 'instructorSection', enabled: false, data: { title: 'Tu Instructor', instructors: [{ name: 'El Gonzo', role: 'Especialista en Psicología de Trading', bio: '', avatarUrl: '' }] } },
    { id: uniqId(), type: 'requirements', enabled: false, data: { title: 'Requisitos de inscripción', requiredItems: [''] } },
    { id: uniqId(), type: 'featuresGrid', enabled: false, data: { title: '¿Qué estás comprando?', items: [{ icon: 'FaCheckCircle', title: 'Acceso Vitalicio', description: 'Clases grabadas y material complementario' }] } },
    { id: uniqId(), type: 'enrollmentEnhancements', enabled: false, data: { title: 'Inscripción y Fechas', subtitle: 'Asegurá tu lugar hoy mismo', urgencyText: 'Últimos cupos disponibles', extraNote: '', whatsappHelpText: '' } },
    { id: uniqId(), type: 'testimonials', enabled: false, data: { title: 'Lo que dicen nuestros alumnos', items: [{ name: '', text: '', roleOrCompany: '', rating: 5 }] } },
    { id: uniqId(), type: 'faq', enabled: false, data: { title: 'Preguntas Frecuentes', items: [{ question: '', answer: '' }] } },
    { id: uniqId(), type: 'curriculum', enabled: false, data: { title: 'Plan de estudios', description: '', modules: [{ title: 'Módulo 1', description: '', lessons: [] }] } },
  ];
}

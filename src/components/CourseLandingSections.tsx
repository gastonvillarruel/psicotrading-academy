'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import * as FaIcons from 'react-icons/fa';
import * as MdIcons from 'react-icons/md';
import * as HiIcons from 'react-icons/hi';
import SafeMarkdown from './SafeMarkdown';
import { CourseDescriptionSection } from '@/types/course';
import { formatCoursePrice, getAvailableCurrencies, getDefaultCurrency } from '@/lib/price';
import { getAvailableStartDates, getDefaultStartDate, formatCourseStartDate } from '@/lib/courseStartDates';
import { useCurrency } from '@/context/CurrencyContext';
import CurrencyToggle from './CurrencyToggle';

// Resolver iconos dinámicamente con fallbacks seguros
const renderIcon = (iconName: string, className?: string) => {
  // Buscar en FontAwesome
  let IconComponent = (FaIcons as any)[iconName];
  if (IconComponent) return <IconComponent className={className} />;

  // Buscar en Material Design
  IconComponent = (MdIcons as any)[iconName];
  if (IconComponent) return <IconComponent className={className} />;

  // Buscar en HeroIcons
  IconComponent = (HiIcons as any)[iconName];
  if (IconComponent) return <IconComponent className={className} />;

  // Fallback a un check por defecto
  return <FaIcons.FaCheck className={className} />;
};

interface CourseLandingSectionsProps {
  course: {
    id: string;
    slug: string;
    title: string;
    shortDescription: string;
    longDescription: string;
    price: number;
    priceARS: number | null;
    priceUSD: number | null;
    originalPriceARS: number | null;
    originalPriceUSD: number | null;
    paymentMode: string | null;
    durationInMonths: number | null;
    type: 'LIVE' | 'RECORDED';
    videoUrl: string | null;
    scheduledAt: Date | null;
    thumbnail: string | null;
    instructorName: string | null;
    instructorRole: string | null;
    instructorBio: string | null;
    descriptionSections: any; // Se parseará a CourseDescriptionSection[]
  };
  isAuthenticated: boolean;
  checkoutCourseUrl: string;
  checkoutMonthlyUrl: string;
  checkoutAnnualUrl: string;
}

// Selector de moneda reusable y premium
function CurrencySwitcher({
  available,
  selected,
  onChange,
}: {
  available: ('ARS' | 'USD' | 'CRYPTO')[];
  selected: 'ARS' | 'USD' | 'CRYPTO';
  onChange: (cur: 'ARS' | 'USD' | 'CRYPTO') => void;
}) {
  if (available.length < 2) return null;
  
  return (
    <CurrencyToggle
      currency={selected}
      onToggle={() => {
        const index = available.indexOf(selected);
        const nextIndex = (index + 1) % available.length;
        onChange(available[nextIndex]);
      }}
    />
  );
}

export default function CourseLandingSections({
  course,
  isAuthenticated,
  checkoutCourseUrl,
  checkoutMonthlyUrl,
  checkoutAnnualUrl,
}: CourseLandingSectionsProps) {
  const { currency, setCurrency } = useCurrency();
  const availableCurrencies = getAvailableCurrencies(course);

  // Sincronizar con el context global de moneda
  const selectedCurrency = currency;
  const setSelectedCurrency = setCurrency;

  // Generar URLs de Checkout seguras propagando la moneda
  const checkoutCourseUrlWithCurrency = isAuthenticated
    ? `/checkout?courseId=${course.id}&currency=${selectedCurrency}`
    : `/login?callbackUrl=${encodeURIComponent(`/checkout?courseId=${course.id}&currency=${selectedCurrency}`)}`;

  // Parsear secciones desde JSON
  let sections: CourseDescriptionSection[] = [];
  try {
    if (course.descriptionSections) {
      sections = typeof course.descriptionSections === 'string'
        ? JSON.parse(course.descriptionSections)
        : (course.descriptionSections as CourseDescriptionSection[]);
    }
  } catch (error) {
    console.error('Error parseando descriptionSections:', error);
  }

  // Filtrar solo las secciones activas
  const activeSections = sections.filter(s => s.enabled);

  // Si no hay secciones activas, renderizamos el fallback clásico (diseño viejo compatible)
  if (activeSections.length === 0) {
    return (
      <ClassicLayout
        course={course}
        checkoutCourseUrl={checkoutCourseUrlWithCurrency}
        checkoutMonthlyUrl={checkoutMonthlyUrl}
        checkoutAnnualUrl={checkoutAnnualUrl}
        selectedCurrency={selectedCurrency}
        setSelectedCurrency={setSelectedCurrency}
        availableCurrencies={availableCurrencies}
        isAuthenticated={isAuthenticated}
      />
    );
  }

  // Si hay secciones, buscamos heroEnhancements o enrollmentEnhancements para integrarlos
  const heroEnhance = activeSections.find(s => s.type === 'heroEnhancements')?.data as any;
  const enrollmentEnhance = activeSections.find(s => s.type === 'enrollmentEnhancements')?.data as any;

  return (
    <div className="space-y-20 pb-20">
      {/* 1. Hero del curso (Siempre renderiza arriba de todo si está activo o por defecto) */}
      <HeroSection
        course={course}
        enhance={heroEnhance}
        checkoutCourseUrl={checkoutCourseUrlWithCurrency}
        selectedCurrency={selectedCurrency}
        setSelectedCurrency={setSelectedCurrency}
        availableCurrencies={availableCurrencies}
      />

      {/* Renderizado dinámico de las secciones restantes respetando el orden del array */}
      {activeSections
        .filter(s => s.type !== 'heroEnhancements') // El hero ya se renderiza arriba
        .map((section) => {
          switch (section.type) {
            case 'problems':
              return <ProblemsSection key={section.id} data={section.data} />;
            case 'achievements':
              return <AchievementsSection key={section.id} data={section.data} />;
            case 'proposal':
              return <ProposalSection key={section.id} data={section.data} />;
            case 'additionalBenefits':
              return <AdditionalBenefitsSection key={section.id} data={section.data} />;
            case 'campusVirtual':
              return <CampusVirtualSection key={section.id} data={section.data} />;
            case 'instructorSection':
              return <InstructorSection key={section.id} data={section.data} />;
            case 'requirements':
              return <RequirementsSection key={section.id} data={section.data} />;
            case 'featuresGrid':
              return <FeaturesGridSection key={section.id} data={section.data} />;
            case 'enrollmentEnhancements':
              return (
                <EnrollmentSection
                  key={section.id}
                  course={course}
                  enhance={enrollmentEnhance}
                  checkoutCourseUrl={checkoutCourseUrlWithCurrency}
                  checkoutMonthlyUrl={checkoutMonthlyUrl}
                  checkoutAnnualUrl={checkoutAnnualUrl}
                  selectedCurrency={selectedCurrency}
                  setSelectedCurrency={setSelectedCurrency}
                  availableCurrencies={availableCurrencies}
                />
              );
            case 'testimonials':
              return <TestimonialsSection key={section.id} data={section.data} />;
            case 'faq':
              return <FaqSection key={section.id} data={section.data} />;
            case 'curriculum':
              return <CurriculumSection key={section.id} data={section.data} />;
            default:
              return null;
          }
        })}

      {/* Cierre de inscripción final */}
      <FinalEnrollmentSection
        course={course}
        isAuthenticated={isAuthenticated}
        selectedCurrency={selectedCurrency}
        setSelectedCurrency={setSelectedCurrency}
        availableCurrencies={availableCurrencies}
      />
    </div>
  );
}

/* ==========================================
   COMPONENTES VISUALES DE SECCIÓN (ESTILO PREMIUM)
   ========================================== */

// 1. HERO SECTION
function HeroSection({
  course,
  enhance,
  checkoutCourseUrl,
  selectedCurrency,
  setSelectedCurrency,
  availableCurrencies,
}: {
  course: any;
  enhance: any;
  checkoutCourseUrl: string;
  selectedCurrency: 'ARS' | 'USD' | 'CRYPTO';
  setSelectedCurrency: (cur: 'ARS' | 'USD' | 'CRYPTO') => void;
  availableCurrencies: ('ARS' | 'USD' | 'CRYPTO')[];
}) {
  const badges = enhance?.promotionalBadges || [];
  const quickHighlights = enhance?.quickHighlightsOverride || [
    `Duración: ${course.type === 'LIVE' ? '6 Semanas' : 'Acceso Vitalicio'}`,
    `Modalidad: ${course.type === 'LIVE' ? 'Mentoria en Vivo' : 'Entrenamiento Grabado'}`,
    `Instructor: ${course.instructorName || 'El Gonzo'}`,
    `Nivel: Todos los niveles`
  ];

  const pricing = formatCoursePrice(course, selectedCurrency);

  return (
    <section className="relative overflow-hidden bg-brand-bg-sec/30 border border-brand-border/20 rounded-2xl p-6 sm:p-10 lg:p-12 shadow-sm">
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-primary/5 rounded-full blur-3xl -z-10" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Izquierda: Info */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1 text-xs font-bold rounded-md uppercase tracking-wider ${
              course.type === 'LIVE' 
                ? 'bg-brand-accent/15 text-brand-accent border border-brand-accent/20' 
                : 'bg-brand-secondary/15 text-brand-secondary border border-brand-secondary/20'
            }`}>
              {course.type === 'LIVE' ? 'Mentoría en Vivo' : 'Curso Grabado'}
            </span>
            {badges.map((badge: string, idx: number) => (
              <span key={idx} className="px-3 py-1 text-xs font-bold rounded-md bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                {badge}
              </span>
            ))}
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-brand-text tracking-tight leading-tight">
            {course.title}
          </h1>

          {enhance?.secondaryText && (
            <p className="text-base text-brand-secondary font-medium uppercase tracking-wider">
              {enhance.secondaryText}
            </p>
          )}

          <p className="text-lg text-brand-text-muted leading-relaxed font-light">
            {course.shortDescription}
          </p>

          {/* Highlights Rápidos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {quickHighlights.map((hl: string, idx: number) => (
              <div key={idx} className="flex items-center space-x-2 text-sm text-brand-text-muted">
                <FaIcons.FaCheckCircle className="text-brand-primary flex-shrink-0" />
                <span className="font-light">{hl}</span>
              </div>
            ))}
          </div>

          {/* Precio y CTA */}
          <div className="pt-6 border-t border-brand-border/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <span className="text-xs text-brand-text-muted uppercase tracking-wider block font-medium">Inversión del entrenamiento</span>
                <CurrencySwitcher
                  available={availableCurrencies}
                  selected={selectedCurrency}
                  onChange={setSelectedCurrency}
                />
              </div>
              <div className="flex flex-col mt-1">
                {pricing.hasOriginalPrice && (
                  <span className="text-sm font-medium text-brand-text-muted/65 line-through whitespace-nowrap">
                    {pricing.originalPriceLabel}
                  </span>
                )}
                <span className="text-3xl sm:text-4xl font-black text-brand-primary whitespace-nowrap">
                  {pricing.currentPriceLabel}
                </span>
              </div>
              {enhance?.urgencyText && (
                <span className="text-xs text-brand-accent font-semibold block mt-1 animate-pulse">{enhance.urgencyText}</span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  const element = document.getElementById('final-enrollment-section');
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="px-8 py-3.5 bg-brand-primary hover:bg-brand-primary/95 text-white font-bold rounded-xl text-center transition-all shadow-md shadow-brand-primary/10 active:scale-[0.98]"
              >
                Inscribirme Ahora
              </button>
              {enhance?.whatsappCtaText && (
                <a
                  href={`https://wa.me/5491136458514?text=Hola,%20quiero%20más%20información%20sobre%20el%20curso%20${encodeURIComponent(course.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-center transition-all flex items-center justify-center space-x-2 active:scale-[0.98]"
                >
                  <FaIcons.FaWhatsapp className="text-lg" />
                  <span>{enhance.whatsappCtaText}</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Derecha: Imagen del curso */}
        <div className="lg:col-span-5">
          {enhance?.heroImage || course.thumbnail ? (
            <div className="relative rounded-2xl overflow-hidden border border-brand-border/30 shadow-lg aspect-video lg:aspect-square bg-brand-bg-sec flex items-center justify-center">
              <img
                src={enhance?.heroImage || course.thumbnail}
                alt={course.title}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-brand-border/30 bg-brand-card aspect-video flex items-center justify-center">
              <FaIcons.FaImage className="text-brand-text-muted/20 text-6xl" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// 2. PROBLEMS SECTION
function ProblemsSection({ data }: { data: any }) {
  return (
    <section className="space-y-6">
      <div className="text-center max-w-3xl mx-auto space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text leading-tight">{data.title}</h2>
        {data.description && <p className="text-brand-text-muted font-light text-sm">{data.description}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-5xl mx-auto">
        {data.items.filter(Boolean).map((item: string, idx: number) => (
          <div key={idx} className="bg-brand-bg-sec/15 border border-brand-border/15 rounded-xl py-3 px-4 flex items-start space-x-3 transition-colors duration-200">
            <div className="h-6 w-6 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center flex-shrink-0 mt-0.5">
              <FaIcons.FaBrain className="text-xs" />
            </div>
            <div className="text-brand-text-muted text-sm font-light leading-relaxed self-center">
              {item}
            </div>
          </div>
        ))}
      </div>

      {data.transformationMessage && (
        <div className="relative overflow-hidden bg-brand-bg-sec/95 border-t-2 border-b-2 border-brand-primary/50 rounded-2xl p-6 sm:p-8 max-w-3xl mx-auto mt-8 shadow-lg text-center">
          {/* Subtle glow decoration */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-brand-secondary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Cita Principal (Centro visual) */}
          <div className="relative z-10 space-y-4">
            <div className="flex justify-center">
              <div className="h-10 w-10 rounded-full bg-brand-primary/15 text-brand-primary flex items-center justify-center">
                <FaIcons.FaQuoteLeft className="text-sm" />
              </div>
            </div>
            <p className="text-brand-text font-bold text-lg sm:text-xl md:text-2xl italic leading-relaxed max-w-2xl mx-auto">
              "{data.transformationMessage}"
            </p>
            <span className="text-[10px] uppercase font-black tracking-widest text-brand-primary block">
              La Transformación
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

// 3. ACHIEVEMENTS SECTION
function AchievementsSection({ data }: { data: any }) {
  return (
    <section className="bg-brand-card border border-brand-border/30 rounded-2xl p-8 sm:p-10 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent" />
      <div className="space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text leading-tight">{data.title}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.benefits.filter(Boolean).map((benefit: string, idx: number) => (
            <div key={idx} className="flex items-start space-x-3 p-2">
              <div className="h-6 w-6 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <FaIcons.FaCheck className="text-xs" />
              </div>
              <span className="text-brand-text-muted text-sm font-light leading-relaxed">{benefit}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// 4. PROPOSAL SECTION
function ProposalSection({ data }: { data: any }) {
  return (
    <section className="max-w-4xl mx-auto space-y-6">
      <div className="border-b border-brand-border/20 pb-4">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text">{data.title}</h2>
        {data.subtitle && <p className="text-brand-secondary font-medium text-sm mt-1">{data.subtitle}</p>}
      </div>
      <div className="bg-brand-card/50 p-6 sm:p-8 rounded-xl border border-brand-border/20">
        <SafeMarkdown content={data.content} />
      </div>
    </section>
  );
}

// 5. ADDITIONAL BENEFITS SECTION
function AdditionalBenefitsSection({ data }: { data: any }) {
  return (
    <section className="space-y-8">
      {data.title && (
        <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text text-center">{data.title}</h2>
      )}
      <div className="flex flex-wrap justify-center gap-6">
        {data.benefits.map((benefit: any, idx: number) => (
          <div key={idx} className="bg-brand-card p-6 rounded-xl border border-brand-border/30 hover:border-brand-primary/30 transition-all duration-300 group w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] max-w-md">
            <div className="h-12 w-12 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              {renderIcon(benefit.icon, 'text-xl')}
            </div>
            <h3 className="font-bold text-brand-text text-base mb-2">{benefit.title}</h3>
            <p className="text-brand-text-muted text-xs font-light leading-relaxed">{benefit.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// 6. CAMPUS VIRTUAL SECTION
function CampusVirtualSection({ data }: { data: any }) {
  const [activeImg, setActiveImg] = useState<string>(data.image || (data.gallery && data.gallery[0]) || '');

  return (
    <section className="bg-brand-card/30 border border-brand-border/20 rounded-2xl p-6 sm:p-10 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Info */}
        <div className="lg:col-span-5 space-y-4">
          <span className="text-xs uppercase font-bold tracking-widest text-brand-secondary">Experiencia de Aprendizaje</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text leading-tight">{data.title}</h2>
          <p className="text-brand-text-muted text-sm font-light leading-relaxed">{data.description}</p>

          {data.videoUrl && (
            <div className="pt-4">
              <a
                href={data.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 text-brand-primary hover:text-brand-secondary font-bold text-sm transition-colors"
              >
                <FaIcons.FaPlay className="text-xs" />
                <span>Ver video demostrativo</span>
              </a>
            </div>
          )}
        </div>

        {/* Media / Galería */}
        <div className="lg:col-span-7 space-y-4">
          {activeImg && (
            <div className="rounded-xl overflow-hidden border border-brand-border/30 aspect-video bg-brand-bg-sec">
              <img src={activeImg} alt={data.title} className="w-full h-full object-cover" />
            </div>
          )}
          
          {data.gallery && data.gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {data.gallery.map((imgUrl: string, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setActiveImg(imgUrl)}
                  className={`w-20 h-12 rounded-md overflow-hidden border-2 transition-all flex-shrink-0 ${
                    activeImg === imgUrl ? 'border-brand-primary scale-95' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={imgUrl} className="w-full h-full object-cover" alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// 7. INSTRUCTOR SECTION
function InstructorSection({ data }: { data: any }) {
  return (
    <section className="space-y-8">
      {data.title && (
        <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text text-center">{data.title}</h2>
      )}
      <div className="flex flex-col gap-6 max-w-4xl mx-auto">
        {data.instructors.map((ins: any, idx: number) => (
          <div key={idx} className="bg-brand-card p-6 sm:p-8 rounded-xl border border-brand-border/30 flex flex-col md:flex-row gap-6 items-center md:items-start">
            <div className="h-24 w-24 rounded-full overflow-hidden border border-brand-border/40 bg-brand-bg-sec flex-shrink-0 shadow-sm">
              {ins.avatarUrl ? (
                <img src={ins.avatarUrl} alt={ins.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-brand-primary text-white flex items-center justify-center text-3xl font-bold">
                  {ins.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
                </div>
              )}
            </div>

            <div className="space-y-3 flex-grow text-center md:text-left">
              <div>
                <h3 className="font-extrabold text-brand-text text-xl">{ins.name}</h3>
                <p className="text-brand-secondary text-xs font-semibold uppercase tracking-wider">{ins.role}</p>
              </div>

              <div className="text-brand-text-muted text-sm font-light leading-relaxed">
                <SafeMarkdown content={ins.bio} />
              </div>

              {/* Redes sociales */}
              {ins.socials && Object.values(ins.socials).some(Boolean) && (
                <div className="flex justify-center md:justify-start gap-4 pt-2">
                  {ins.socials.linkedin && (
                    <a href={ins.socials.linkedin} target="_blank" rel="noopener noreferrer" className="text-brand-text-muted hover:text-brand-primary transition-colors">
                      <FaIcons.FaLinkedin className="text-lg" />
                    </a>
                  )}
                  {ins.socials.twitter && (
                    <a href={ins.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-brand-text-muted hover:text-brand-primary transition-colors">
                      <FaIcons.FaTwitter className="text-lg" />
                    </a>
                  )}
                  {ins.socials.instagram && (
                    <a href={ins.socials.instagram} target="_blank" rel="noopener noreferrer" className="text-brand-text-muted hover:text-brand-primary transition-colors">
                      <FaIcons.FaInstagram className="text-lg" />
                    </a>
                  )}
                  {ins.socials.youtube && (
                    <a href={ins.socials.youtube} target="_blank" rel="noopener noreferrer" className="text-brand-text-muted hover:text-brand-primary transition-colors">
                      <FaIcons.FaYoutube className="text-lg" />
                    </a>
                  )}
                </div>
              )}

              {/* Rating / Estudiantes (opcional) */}
              {(ins.rating || ins.studentsCount) && (
                <div className="flex justify-center md:justify-start gap-6 pt-2 text-xs font-semibold text-brand-text-muted border-t border-brand-border/10">
                  {ins.rating && (
                    <div className="flex items-center space-x-1">
                      <FaIcons.FaStar className="text-yellow-500" />
                      <span>{ins.rating} Calificación</span>
                    </div>
                  )}
                  {ins.studentsCount && (
                    <div>
                      <span>+{ins.studentsCount.toLocaleString('es-AR')} Alumnos</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// 8. REQUIREMENTS SECTION
function RequirementsSection({ data }: { data: any }) {
  return (
    <section className="max-w-2xl mx-auto bg-brand-card/45 border border-brand-border/20 rounded-xl p-6 sm:p-8 space-y-6">
      <div className="flex items-center space-x-3 border-b border-brand-border/10 pb-4">
        <FaIcons.FaExclamationTriangle className="text-brand-secondary text-xl" />
        <h2 className="text-xl font-bold text-brand-text">{data.title || 'Requisitos del entrenamiento'}</h2>
      </div>

      <div className="space-y-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Obligatorios</span>
          <ul className="space-y-2 mt-2">
            {data.requiredItems.filter(Boolean).map((req: string, idx: number) => (
              <li key={idx} className="flex items-start space-x-2 text-sm text-brand-text-muted font-light">
                <span className="h-1.5 w-1.5 bg-red-500 rounded-full mt-1.5 flex-shrink-0" />
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>

        {data.optionalItems && data.optionalItems.filter(Boolean).length > 0 && (
          <div className="pt-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Recomendados / Opcionales</span>
            <ul className="space-y-2 mt-2">
              {data.optionalItems.filter(Boolean).map((req: string, idx: number) => (
                <li key={idx} className="flex items-start space-x-2 text-sm text-brand-text-muted/85 font-light">
                  <span className="h-1.5 w-1.5 bg-brand-primary rounded-full mt-1.5 flex-shrink-0" />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// 9. FEATURES GRID
function FeaturesGridSection({ data }: { data: any }) {
  return (
    <section className="space-y-8">
      {data.title && (
        <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text text-center">{data.title}</h2>
      )}
      <div className="flex flex-wrap justify-center gap-6">
        {data.items.map((feat: any, idx: number) => (
          <div key={idx} className="bg-brand-card p-5 rounded-xl border border-brand-border/30 text-center w-full sm:w-[calc(50%-12px)] md:w-[calc(25%-18px)] max-w-sm">
            <div className="mx-auto h-10 w-10 rounded-full bg-brand-secondary/10 text-brand-secondary flex items-center justify-center mb-3">
              {renderIcon(feat.icon, 'text-lg')}
            </div>
            <h3 className="font-bold text-brand-text text-sm mb-1">{feat.title}</h3>
            <p className="text-brand-text-muted text-[11px] font-light leading-relaxed">{feat.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// 10. ENROLLMENT SECTION (CHECKOUT COMPATIBLE)
function EnrollmentSection({
  course,
  enhance,
  checkoutCourseUrl,
  checkoutMonthlyUrl,
  checkoutAnnualUrl,
  selectedCurrency,
  setSelectedCurrency,
  availableCurrencies,
}: {
  course: any;
  enhance: any;
  checkoutCourseUrl: string;
  checkoutMonthlyUrl: string;
  checkoutAnnualUrl: string;
  selectedCurrency: 'ARS' | 'USD' | 'CRYPTO';
  setSelectedCurrency: (cur: 'ARS' | 'USD' | 'CRYPTO') => void;
  availableCurrencies: ('ARS' | 'USD' | 'CRYPTO')[];
}) {
  const pricing = formatCoursePrice(course, selectedCurrency);

  return (
    <section id="inscripcion" className="max-w-4xl mx-auto bg-brand-card rounded-2xl border border-brand-border/30 p-8 sm:p-12 shadow-md relative overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 bg-brand-primary/5 rounded-full blur-3xl -z-10" />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Info lateral */}
        <div className="md:col-span-7 space-y-4">
          <span className="text-xs uppercase font-bold tracking-widest text-brand-primary">Inscripción Abierta</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text leading-tight">
            {enhance?.title || 'Comenzá tu transformación mental'}
          </h2>
          <p className="text-brand-text-muted text-sm font-light leading-relaxed">
            {enhance?.subtitle || 'Accedé inmediatamente a las lecciones and transformá tu trading con la mentoría de El Gonzo.'}
          </p>

          {enhance?.whatsappHelpText && (
            <div className="flex items-center space-x-2 text-xs font-semibold text-brand-text-muted pt-2">
              <FaIcons.FaQuestionCircle />
              <span>¿Dudas? <a href={`https://wa.me/5491136458514?text=Hola,%20tengo%20dudas%20sobre%20${encodeURIComponent(course.title)}`} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">{enhance.whatsappHelpText}</a></span>
            </div>
          )}
        </div>

        {/* Caja de compra */}
        <div className="md:col-span-5 bg-brand-bg-sec/50 border border-brand-border/30 p-6 rounded-xl space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-brand-text-muted uppercase font-bold block">Inversión</span>
              <CurrencySwitcher
                available={availableCurrencies}
                selected={selectedCurrency}
                onChange={setSelectedCurrency}
              />
            </div>
            <div className="flex flex-col mt-1">
              {pricing.hasOriginalPrice && (
                <span className="text-xs text-brand-text-muted/65 line-through">
                  {pricing.originalPriceLabel}
                </span>
              )}
              <span className="text-3xl font-black text-brand-primary block">
                {pricing.currentPriceLabel}
              </span>
            </div>
            {enhance?.urgencyText && (
              <span className="text-[10px] text-brand-accent font-bold block mt-1 animate-pulse">{enhance.urgencyText}</span>
            )}
          </div>

          <div className="space-y-3">
            {/* Opción 1: Compra Curso Individual */}
            <div className="p-4 rounded-lg bg-brand-primary/5 border border-brand-primary/20">
              <span className="text-xs font-bold text-brand-primary block">Acceso Vitalicio</span>
              <p className="text-[10px] text-brand-text-muted mt-1 leading-normal font-light">Pago único. Acceso para siempre a las grabaciones y material.</p>
              <Link
                href={checkoutCourseUrl}
                className="w-full text-center block mt-3 py-2 px-3 bg-brand-primary hover:bg-brand-primary/95 text-white text-xs font-bold rounded-lg transition-all shadow-sm active:scale-[0.98]"
              >
                Inscribirme al Curso
              </Link>
            </div>

            {/* Divisor */}
            <div className="text-center text-[9px] text-brand-text-muted/40 font-bold uppercase py-1">O la membresía completa</div>

            {/* Opción 2: Suscripción Mensual */}
            <div className="flex justify-between items-center p-3 rounded-lg border border-brand-border/30 bg-brand-bg-sec/10">
              <div>
                <span className="text-[9px] text-brand-text-muted font-bold block uppercase">Mensual</span>
                <span className="font-bold text-brand-text text-xs">$8.500 / mes</span>
              </div>
              <Link
                href={checkoutMonthlyUrl}
                className="px-3 py-1.5 bg-brand-secondary hover:bg-brand-primary text-white text-[10px] font-bold rounded transition-all"
              >
                Suscribirme
              </Link>
            </div>

            {/* Opción 3: Suscripción Anual */}
            <div className="flex justify-between items-center p-3 rounded-lg border border-brand-border/30 bg-brand-bg-sec/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-brand-accent text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl">
                Ahorrá 20%
              </div>
              <div>
                <span className="text-[9px] text-brand-text-muted font-bold block uppercase mt-1">Anual</span>
                <span className="font-bold text-brand-text text-xs">$81.600 / año</span>
              </div>
              <Link
                href={checkoutAnnualUrl}
                className="px-3 py-1.5 bg-brand-secondary hover:bg-brand-primary text-white text-[10px] font-bold rounded transition-all"
              >
                Suscribirme
              </Link>
            </div>
          </div>

          {enhance?.extraNote && (
            <p className="text-[9px] text-brand-text-muted/70 text-center font-light leading-normal mt-2">
              {enhance.extraNote}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// 11. TESTIMONIALS SECTION
function TestimonialsSection({ data }: { data: any }) {
  return (
    <section className="space-y-8">
      {data.title && (
        <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text text-center">{data.title}</h2>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data.items.filter((item: any) => item.name && item.text).map((item: any, idx: number) => (
          <div key={idx} className="bg-brand-card p-6 rounded-xl border border-brand-border/30 flex flex-col justify-between shadow-sm">
            <div className="space-y-4">
              {/* Estrellas */}
              {item.rating && (
                <div className="flex gap-0.5 text-yellow-500">
                  {Array.from({ length: item.rating }).map((_, i) => (
                    <FaIcons.FaStar key={i} className="text-xs" />
                  ))}
                </div>
              )}
              <p className="text-brand-text-muted text-xs font-light italic leading-relaxed">
                "{item.text}"
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-4 mt-4 border-t border-brand-border/10">
              <div className="h-9 w-9 rounded-full overflow-hidden border border-brand-border/20 bg-brand-bg-sec flex-shrink-0 flex items-center justify-center text-xs font-bold text-brand-primary">
                {item.avatarUrl ? (
                  <img src={item.avatarUrl} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  item.name[0]
                )}
              </div>
              <div>
                <h4 className="font-bold text-brand-text text-xs">{item.name}</h4>
                {item.roleOrCompany && (
                  <p className="text-brand-text-muted text-[10px] font-light">{item.roleOrCompany}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// 12. FAQ SECTION
function FaqSection({ data }: { data: any }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="max-w-3xl mx-auto space-y-8">
      {data.title && (
        <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text text-center">{data.title}</h2>
      )}
      <div className="space-y-4">
        {data.items.filter((item: any) => item.question && item.answer).map((item: any, idx: number) => (
          <div key={idx} className="bg-brand-card rounded-xl border border-brand-border/30 overflow-hidden transition-colors">
            <button
              onClick={() => toggleFaq(idx)}
              className="w-full px-6 py-4 flex justify-between items-center text-left text-brand-text hover:text-brand-primary font-bold text-sm transition-colors cursor-pointer"
            >
              <span>{item.question}</span>
              <span className="ml-4 flex-shrink-0 text-brand-text-muted">
                {openIndex === idx ? <FaIcons.FaChevronUp className="text-xs" /> : <FaIcons.FaChevronDown className="text-xs" />}
              </span>
            </button>
            
            {openIndex === idx && (
              <div className="px-6 pb-5 pt-1 text-brand-text-muted text-xs font-light leading-relaxed border-t border-brand-border/10 bg-brand-bg-sec/10">
                {item.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// 13. CURRICULUM SECTION
function CurriculumSection({ data }: { data: any }) {
  const [openMod, setOpenMod] = useState<number | null>(0);

  return (
    <section className="max-w-3xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text">{data.title || 'Plan de estudios'}</h2>
        {data.description && <p className="text-brand-text-muted font-light text-sm">{data.description}</p>}
      </div>

      <div className="space-y-4">
        {data.modules.filter((mod: any) => mod.title).map((mod: any, idx: number) => (
          <div key={idx} className="bg-brand-card rounded-xl border border-brand-border/30 overflow-hidden">
            <button
              onClick={() => setOpenMod(openMod === idx ? null : idx)}
              className="w-full px-6 py-5 flex justify-between items-start text-left hover:text-brand-primary transition-colors cursor-pointer"
            >
              <div className="space-y-1">
                <span className="text-[10px] text-brand-secondary font-bold uppercase tracking-wider">Módulo {idx + 1}</span>
                <h3 className="font-extrabold text-brand-text text-sm sm:text-base">{mod.title}</h3>
              </div>
              <span className="ml-4 flex-shrink-0 text-brand-text-muted pt-1">
                {openMod === idx ? <FaIcons.FaChevronUp className="text-xs" /> : <FaIcons.FaChevronDown className="text-xs" />}
              </span>
            </button>

            {openMod === idx && (
              <div className="px-6 pb-6 pt-1 border-t border-brand-border/10 bg-brand-bg-sec/10 space-y-4">
                {mod.description && (
                  <p className="text-brand-text-muted text-xs font-light leading-relaxed">{mod.description}</p>
                )}
                
                {mod.lessons && mod.lessons.filter(Boolean).length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-brand-border/10">
                    <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">Contenido de clases:</span>
                    <ul className="space-y-1.5">
                      {mod.lessons.filter(Boolean).map((les: string, lIdx: number) => (
                        <li key={lIdx} className="flex items-center space-x-2 text-xs text-brand-text-muted/90 font-light">
                          <FaIcons.FaPlayCircle className="text-brand-primary flex-shrink-0 text-[10px]" />
                          <span>{les}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// FALLBACK CLÁSICO (DISEÑO ORIGINAL COMPATIBLE)
function ClassicLayout({
  course,
  checkoutCourseUrl,
  checkoutMonthlyUrl,
  checkoutAnnualUrl,
  selectedCurrency,
  setSelectedCurrency,
  availableCurrencies,
  isAuthenticated,
}: {
  course: any;
  checkoutCourseUrl: string;
  checkoutMonthlyUrl: string;
  checkoutAnnualUrl: string;
  selectedCurrency: 'ARS' | 'USD' | 'CRYPTO';
  setSelectedCurrency: (cur: 'ARS' | 'USD' | 'CRYPTO') => void;
  availableCurrencies: ('ARS' | 'USD' | 'CRYPTO')[];
  isAuthenticated: boolean;
}) {
  const pricing = formatCoursePrice(course, selectedCurrency);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
      {/* Columna izquierda: Información detallada */}
      <div className="lg:col-span-8">
        {course.thumbnail && (
          <div className="h-72 sm:h-96 w-full rounded-xl overflow-hidden bg-brand-bg-sec mb-8 border border-brand-border/30 shadow-sm relative">
            <img
              src={course.thumbnail}
              alt={course.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-center space-x-3 mb-4">
          <span className={`px-3 py-1 text-xs font-bold rounded-md shadow-sm ${
            course.type === 'LIVE' 
              ? 'bg-brand-accent/15 text-brand-accent border border-brand-accent/20' 
              : 'bg-brand-secondary/15 text-brand-secondary border border-brand-secondary/20'
          }`}>
            {course.type === 'LIVE' ? 'Mentoria en Vivo' : 'Entrenamiento Grabado'}
          </span>
          {course.type === 'LIVE' && course.scheduledAt && (
            <span className="text-xs text-brand-accent bg-brand-accent/10 px-3 py-1 rounded-md font-semibold border border-brand-accent/20">
              Comienza: {new Date(course.scheduledAt).toLocaleDateString('es-AR')}
            </span>
          )}
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-brand-text tracking-tight mb-4">
          {course.title}
        </h1>

        <p className="text-lg text-brand-text-muted leading-relaxed mb-8">
          {course.shortDescription}
        </p>

        <div className="border-t border-brand-border/20 pt-8 mb-8">
          <h2 className="text-xl font-bold text-brand-text mb-4">Acerca de este curso</h2>
          <div className="text-brand-text-muted text-sm leading-relaxed space-y-4 font-light">
            {course.longDescription.split('\n').map((paragraph: string, index: number) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>

        {/* Instructor */}
        <div className="border-t border-brand-border/20 pt-8">
          <h2 className="text-xl font-bold text-brand-text mb-4">Tu Instructor</h2>
          <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 bg-brand-card p-6 rounded-xl border border-brand-border/30">
            <div className="h-16 w-16 rounded-full bg-brand-primary text-white flex items-center justify-center font-bold text-xl shadow-sm flex-shrink-0">
              EG
            </div>
            <div>
              <h3 className="font-bold text-brand-text text-center sm:text-left">{course.instructorName || 'El Gonzo'}</h3>
              <p className="text-brand-text-muted text-xs mt-0.5 text-center sm:text-left">{course.instructorRole || 'Especialista en Psicología de Trading y Fundador de PSICOEMOTRADING'}</p>
              <p className="text-brand-text-muted text-xs mt-3 leading-relaxed text-center sm:text-left font-light">
                {course.instructorBio || 'Con años de experiencia acompañando a traders en su desarrollo mental, El Gonzo enfoca su mentoría en erradicar conductas compulsivas y reconfigurar la respuesta ante el riesgo y la incertidumbre.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Columna derecha: Compra e inscripciones */}
      <div className="lg:col-span-4">
        <div className="sticky top-24 bg-brand-card rounded-xl border border-brand-border/30 p-8 shadow-sm flex flex-col transition-all">
          <div className="mb-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-brand-text-muted font-bold uppercase tracking-wider block">Precio del Curso</span>
              <CurrencySwitcher
                available={availableCurrencies}
                selected={selectedCurrency}
                onChange={setSelectedCurrency}
              />
            </div>
            <div className="flex flex-col mt-1">
              {pricing.hasOriginalPrice && (
                <span className="text-xs text-brand-text-muted/65 line-through">
                  {pricing.originalPriceLabel}
                </span>
              )}
              <span className="text-4xl font-extrabold text-brand-primary block">
                {pricing.currentPriceLabel}
              </span>
            </div>
          </div>

          {/* Opción 1: Compra Individual */}
          <div className="mb-6 p-5 rounded-lg border border-brand-secondary/15 bg-brand-secondary/5">
            <h3 className="font-bold text-brand-secondary text-sm">Acceso Vitalicio</h3>
            <p className="text-xs text-brand-text-muted mt-1 font-light">Comprá el curso individualmente y accedé para siempre a todas las lecciones.</p>
            <Link
              href={checkoutCourseUrl}
              className="w-full text-center block mt-4 py-3 px-4 bg-brand-primary hover:bg-brand-primary/95 text-white text-sm font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98]"
            >
              Comprar este curso
            </Link>
          </div>

          {/* Divisor */}
          <div className="flex items-center my-4">
            <div className="flex-grow border-t border-brand-border/20" />
            <span className="mx-3 text-[10px] text-brand-text-muted/60 font-bold uppercase tracking-wider">O también</span>
            <div className="flex-grow border-t border-brand-border/20" />
          </div>

          {/* Opción 2: Suscripción */}
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-brand-text text-sm">Membresía Completa</h3>
              <p className="text-xs text-brand-text-muted mt-1 font-light">Accedé a todos los cursos y talleres de acompañamiento mediante una membresía activa.</p>
            </div>

            {/* Plan Mensual */}
            <div className="p-4 rounded-lg border border-brand-border/30 hover:border-brand-primary/45 transition-colors flex justify-between items-center bg-brand-bg-sec/10">
              <div>
                <span className="text-[10px] text-brand-text-muted block font-bold uppercase tracking-wider">Suscripción Mensual</span>
                <span className="font-bold text-brand-text text-sm mt-0.5">$8.500 / mes</span>
              </div>
              <Link
                href={checkoutMonthlyUrl}
                className="px-4 py-2 bg-brand-secondary hover:bg-brand-primary text-white text-xs font-semibold rounded-md transition-all shadow-sm"
              >
                Suscribirme
              </Link>
            </div>

            {/* Plan Anual */}
            <div className="p-4 rounded-lg border border-brand-border/30 hover:border-brand-primary/45 transition-colors flex justify-between items-center bg-brand-bg-sec/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-brand-accent text-white text-[9px] font-bold uppercase px-2 py-0.5 rounded-bl-md">
                Ahorrá 20%
              </div>
              <div>
                <span className="text-[9px] text-brand-text-muted block font-bold uppercase tracking-wider">Suscripción Anual</span>
                <span className="font-bold text-brand-text text-sm mt-0.5">$81.600 / año</span>
              </div>
              <Link
                href={checkoutAnnualUrl}
                className="px-4 py-2 bg-brand-secondary hover:bg-brand-primary text-white text-xs font-semibold rounded-md transition-all shadow-sm"
              >
                Suscribirme
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Cierre de inscripción final */}
      <FinalEnrollmentSection
        course={course}
        isAuthenticated={isAuthenticated}
        selectedCurrency={selectedCurrency}
        setSelectedCurrency={setSelectedCurrency}
        availableCurrencies={availableCurrencies}
      />
    </div>
  );
}

// 14. SECCIÓN FINAL DE INSCRIPCIÓN / CIERRE DE COMPRA
function FinalEnrollmentSection({
  course,
  isAuthenticated,
  selectedCurrency,
  setSelectedCurrency,
  availableCurrencies,
}: {
  course: any;
  isAuthenticated: boolean;
  selectedCurrency: 'ARS' | 'USD' | 'CRYPTO';
  setSelectedCurrency: (cur: 'ARS' | 'USD' | 'CRYPTO') => void;
  availableCurrencies: ('ARS' | 'USD' | 'CRYPTO')[];
}) {
  const startDates = getAvailableStartDates(course);
  
  // Si solo hay una fecha de inicio activa, preseleccionarla automáticamente.
  const [selectedStartDateId, setSelectedStartDateId] = useState<string | undefined>(
    startDates.length === 1 ? startDates[0].id : undefined
  );
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pricing = formatCoursePrice(course, selectedCurrency);
  const isInstallments = course.paymentMode === 'installments';
  const duration = course.durationInMonths || 0;

  const formatValCustom = (val: number) => {
    return `${Math.round(val).toLocaleString('es-AR')} ${selectedCurrency === 'CRYPTO' ? 'USDT' : selectedCurrency}`;
  };

  const originalPriceLabelFormatted = pricing.originalPrice
    ? (isInstallments && duration > 0
        ? `${duration} cuotas de ${formatValCustom(pricing.originalPrice)}`
        : formatValCustom(pricing.originalPrice))
    : '';

  // Construir url de checkout de forma condicional y segura (sin params vacíos)
  const params = new URLSearchParams({
    courseId: course.id,
    currency: selectedCurrency,
  });
  
  if (selectedStartDateId) {
    params.set('startDateId', selectedStartDateId);
  }
  
  const targetCheckoutUrl = isAuthenticated
    ? `/checkout?${params.toString()}`
    : `/login?callbackUrl=${encodeURIComponent(`/checkout?${params.toString()}`)}`;

  const handleEnrollClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (startDates.length > 1 && !selectedStartDateId) {
      e.preventDefault();
      setErrorMsg('Elegí una fecha de inicio para continuar.');
      
      const element = document.getElementById('final-enrollment-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    setErrorMsg(null);
  };

  return (
    <section 
      id="final-enrollment-section" 
      className="max-w-4xl mx-auto rounded-2xl border border-brand-border/30 shadow-2xl relative overflow-hidden transition-all duration-300"
      style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #F8F9FC 100%)' }}
    >
      {/* Decorative gradient overlay */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-brand-primary/5 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-brand-secondary/5 rounded-full blur-3xl -z-10" />

      {/* Franja superior promocional de urgencia */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white text-[11px] sm:text-xs font-extrabold py-3.5 px-4 text-center flex items-center justify-center gap-2 tracking-wider uppercase shadow-inner">
        <FaIcons.FaClock className="animate-pulse text-sm" />
        <span>Reservá tu lugar antes del cierre de inscripción</span>
      </div>

      <div className="p-8 sm:p-12 pt-8 sm:pt-10 pb-0 sm:pb-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          {/* COLUMNA IZQUIERDA: Info y Fechas de cursada */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              {/* Título y Subtítulo alineados a la izquierda */}
              <div className="space-y-3">
                <h2 className="text-3xl sm:text-4xl font-black text-brand-text leading-tight text-left">
                  Iniciá tu camino hacia la consistencia mental
                </h2>
                <p className="text-brand-text-muted text-sm font-normal leading-relaxed text-left">
                  Seleccioná tu fecha de inicio, la moneda de tu preferencia y reservá tu lugar hoy mismo. Cupos limitados para garantizar el acompañamiento.
                </p>
              </div>

              <div className="border-t border-brand-border/10 my-4" />

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest block">Entrenamiento</span>
                <h3 className="text-xl font-extrabold text-brand-text leading-snug">{course.title}</h3>
                <p className="text-xs text-brand-text-muted font-light">{course.shortDescription}</p>
              </div>

              {/* Selector de Fechas Múltiples */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-brand-text-muted uppercase tracking-wider block">Opciones de fecha de inicio:</span>
                
                {startDates.length === 0 ? (
                  <div className="p-4 bg-brand-bg-sec/45 border border-brand-border/20 rounded-xl">
                    <span className="text-sm font-semibold text-brand-text block">Fecha a confirmar</span>
                    <span className="text-xs text-brand-text-muted font-light mt-0.5 block">Próximamente coordinaremos la fecha de inicio. Reservá tu vacante ahora.</span>
                  </div>
                ) : startDates.length === 1 ? (
                  <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs text-amber-500 font-bold uppercase tracking-wider block">Fecha única asignada</span>
                      <span className="text-base font-extrabold text-brand-text mt-1 block">
                        {formatCourseStartDate(startDates[0].startDate)}
                      </span>
                      {startDates[0].startTime && (
                        <span className="text-xs text-brand-text-muted font-light mt-0.5 block">
                          Horario: {startDates[0].startTime}
                        </span>
                      )}
                    </div>
                    {startDates[0].teacherName && (
                      <div className="text-right border-l border-brand-border/20 pl-4 hidden sm:block">
                        <span className="text-[10px] text-brand-text-muted font-semibold uppercase tracking-wider block">Docente</span>
                        <span className="text-xs font-bold text-brand-text mt-0.5 block">{startDates[0].teacherName}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {startDates.map((sd) => {
                      const isSelected = selectedStartDateId === sd.id;
                      return (
                        <button
                          key={sd.id}
                          type="button"
                          onClick={() => {
                            setSelectedStartDateId(sd.id);
                            setErrorMsg(null);
                          }}
                          className={`p-4 rounded-xl text-left border transition-all cursor-pointer relative flex flex-col justify-between ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500/10 shadow-sm shadow-amber-500/5'
                              : 'border-brand-border/40 hover:border-amber-500/40 bg-brand-bg-sec/20'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-extrabold text-brand-text">
                                {formatCourseStartDate(sd.startDate)}
                              </span>
                              <span className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center ${
                                isSelected ? 'border-amber-500 bg-amber-500 text-white' : 'border-brand-border/60'
                              }`}>
                                {isSelected && <span className="h-1.5 w-1.5 bg-white rounded-full" />}
                              </span>
                            </div>
                            
                            {sd.startTime && (
                              <span className="text-[11px] text-brand-text-muted font-light mt-1.5 block leading-normal">
                                Horario: {sd.startTime}
                              </span>
                            )}
                          </div>

                          {sd.teacherName && (
                            <div className="mt-3 pt-2 border-t border-brand-border/10">
                              <span className="text-[9px] text-brand-text-muted font-semibold uppercase tracking-wider block">Docente</span>
                              <span className="text-[10px] font-bold text-brand-text">{sd.teacherName}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                
                {errorMsg && (
                  <p className="text-xs font-semibold text-red-500 animate-pulse mt-2">{errorMsg}</p>
                )}
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA: Caja de Checkout y Precio */}
          <div className="lg:col-span-5 bg-white border-2 border-amber-500 p-6 sm:p-8 rounded-xl flex flex-col justify-between space-y-6 shadow-2xl relative overflow-hidden transition-all duration-300">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-brand-border/10 pb-4">
                <span className="text-[10px] text-brand-text-muted uppercase font-bold tracking-wider">Inversión</span>
                <CurrencySwitcher
                  available={availableCurrencies}
                  selected={selectedCurrency}
                  onChange={setSelectedCurrency}
                />
              </div>

              <div className="space-y-2">
                {/* Badge destacado arriba del precio */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse flex items-center gap-1 shadow-sm">
                    <span>🔥</span>
                    <span>{pricing.hasOriginalPrice ? 'Descuento Activo' : 'Últimos Cupos'}</span>
                  </span>
                </div>

                {pricing.hasOriginalPrice && (
                  <span className="text-xs font-semibold text-brand-text-muted/65 line-through block whitespace-nowrap">
                    {originalPriceLabelFormatted}
                  </span>
                )}
                
                {isInstallments && duration > 0 ? (
                  <div className="space-y-0.5">
                    <span className="text-[10px] sm:text-xs font-bold text-brand-text-muted block uppercase tracking-wider">
                      {duration} cuotas de
                    </span>
                    <span className="text-3xl sm:text-4xl font-black text-amber-500 block leading-none tracking-tight whitespace-nowrap">
                      {formatValCustom(pricing.currentPrice ?? 0)}
                    </span>
                  </div>
                ) : (
                  <span className="text-3xl sm:text-4xl font-black text-amber-500 block leading-none tracking-tight whitespace-nowrap">
                    {formatValCustom(pricing.currentPrice ?? 0)}
                  </span>
                )}

                <span className="text-[10px] text-brand-text-muted block font-light whitespace-nowrap">
                  {isInstallments && duration > 0 ? '* El precio representa la cuota mensual' : '* Pago único para acceso vitalicio'}
                </span>
              </div>
              
              <div className="space-y-2 pt-2 border-t border-brand-border/10">
                <div className="flex items-center space-x-2 text-xs text-brand-text">
                  <FaIcons.FaAward className="text-amber-500 text-sm flex-shrink-0" />
                  <span className="font-semibold text-brand-text/90">Garantía de soporte 24/7</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-brand-text">
                  <FaIcons.FaShieldAlt className="text-amber-500 text-sm flex-shrink-0" />
                  <span className="font-semibold text-brand-text/90">Procesamiento de pago seguro</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-3">
                <Link
                  href={targetCheckoutUrl}
                  onClick={handleEnrollClick}
                  className="w-full text-center block py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-extrabold text-sm rounded-xl transition-all shadow-md hover:scale-[1.01] active:scale-[0.98] cursor-pointer tracking-wider uppercase"
                >
                  Inscribirme ahora
                </Link>
                
                <div className="text-center text-[10px] text-brand-text-muted font-light leading-normal">
                  ¿Dudas sobre el método de pago? <a href={`https://wa.me/5491136458514?text=Hola,%20quiero%20coordinar%20mi%20inscripción%20para%20${encodeURIComponent(course.title)}`} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline font-semibold">Consultar soporte</a>
                </div>
              </div>

              {/* Medios de pago dinámicos */}
              <div className="space-y-2.5 pt-4 border-t border-brand-border/10">
                <span className="text-[10px] text-brand-text-muted font-bold uppercase tracking-wider block text-center">
                  Medios de pago disponibles
                </span>
                <div className="flex flex-wrap justify-center gap-2">
                  {selectedCurrency === 'CRYPTO' ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-bg-sec/40 border border-brand-border/20 text-[11px] font-bold text-brand-text shadow-sm hover:border-amber-500/30 transition-colors">
                      <FaIcons.FaBitcoin className="text-[#F7931A] text-xs" />
                      <span>USDT/USDC</span>
                    </div>
                  ) : selectedCurrency === 'ARS' ? (
                    <>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-bg-sec/40 border border-brand-border/20 text-[11px] font-bold text-brand-text shadow-sm hover:border-amber-500/30 transition-colors">
                        <FaIcons.FaWallet className="text-[#009EE3] text-xs" />
                        <span>Mercado Pago</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-bg-sec/40 border border-brand-border/20 text-[11px] font-bold text-brand-text shadow-sm hover:border-amber-500/30 transition-colors">
                        <FaIcons.FaCcVisa className="text-[#1A1F71] text-xs" />
                        <span>Visa</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-bg-sec/40 border border-brand-border/20 text-[11px] font-bold text-brand-text shadow-sm hover:border-amber-500/30 transition-colors">
                        <FaIcons.FaCcMastercard className="text-[#EB001B] text-xs" />
                        <span>Mastercard</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-bg-sec/40 border border-brand-border/20 text-[11px] font-bold text-brand-text shadow-sm hover:border-amber-500/30 transition-colors">
                        <FaIcons.FaPaypal className="text-[#003087] text-xs" />
                        <span>PayPal</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-bg-sec/40 border border-brand-border/20 text-[11px] font-bold text-brand-text shadow-sm hover:border-amber-500/30 transition-colors">
                        <FaIcons.FaCcVisa className="text-[#1A1F71] text-xs" />
                        <span>Visa</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-bg-sec/40 border border-brand-border/20 text-[11px] font-bold text-brand-text shadow-sm hover:border-amber-500/30 transition-colors">
                        <FaIcons.FaCcMastercard className="text-[#EB001B] text-xs" />
                        <span>Mastercard</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Banda inferior horizontal de confianza y cierre */}
      <div className="border-t border-brand-border/10 flex flex-col sm:flex-row items-center justify-center gap-3 text-center sm:text-left bg-amber-500/5 mt-8 px-8 sm:px-12 py-5 border-b rounded-b-2xl">
        <span className="text-lg flex-shrink-0">🔒</span>
        <div>
          <span className="text-xs font-extrabold text-brand-text block uppercase tracking-wider">Inscripción segura y confidencial</span>
          <span className="text-xs text-brand-text-muted font-normal mt-0.5 block">Acceso automático al Campus Virtual luego de completar el pago.</span>
        </div>
      </div>
    </section>
  );
}

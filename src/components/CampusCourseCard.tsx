'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { formatCoursePrice, getDefaultCurrency } from '@/lib/price';

interface CampusCourseCardProps {
  course: {
    id: string;
    slug: string;
    title: string;
    shortDescription: string;
    price: number;
    priceARS?: number | null;
    priceUSD?: number | null;
    originalPriceARS?: number | null;
    originalPriceUSD?: number | null;
    paymentMode?: string | null;
    durationInMonths?: number | null;
    duration?: string | null;
    sortOrder?: number | null;
    type: 'LIVE' | 'RECORDED';
    videoUrl?: string | null;
    scheduledAt?: Date | string | null;
    thumbnail?: string | null;
    available?: boolean | null;
    createdAt: Date | string;
  };
}

export default function CampusCourseCard({ course }: CampusCourseCardProps) {
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const isAvailable = course.available !== false;
  const isLongDescription = course.shortDescription.length > 100;

  return (
    <div
      className={`bg-brand-card rounded-xl border border-brand-border/30 shadow-sm overflow-hidden flex flex-col transition-all duration-300 relative group ${
        isAvailable 
          ? "hover:shadow-md hover:-translate-y-0.5" 
          : "opacity-85 cursor-not-allowed"
      }`}
    >
      {course.thumbnail && (
        <div className="h-48 w-full overflow-hidden bg-brand-bg-sec relative">
          <img
            src={course.thumbnail}
            alt={course.title}
            className={`w-full h-full object-cover animate-fade-in ${!isAvailable ? 'grayscale' : ''}`}
          />
          {!isAvailable ? (
            <>
              <div className="absolute inset-0 bg-black/45 backdrop-blur-[0.5px]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="px-3.5 py-2 text-xs font-bold rounded-lg shadow-lg bg-black/75 text-white border border-white/10 uppercase tracking-wider backdrop-blur-sm">
                  Próximamente
                </span>
              </div>
            </>
          ) : (
            <span
              className={`absolute top-4 right-4 px-3 py-1 text-xs font-bold rounded-md shadow-sm border ${
                course.type === 'LIVE'
                  ? 'bg-brand-accent/15 text-brand-accent border-brand-accent/25'
                  : 'bg-brand-secondary/15 text-brand-secondary border-brand-secondary/25'
              }`}
            >
              {course.type === 'LIVE' ? 'En Vivo' : 'Grabado'}
            </span>
          )}
        </div>
      )}

      <div className="p-6 flex-grow flex flex-col relative overflow-hidden">
        {/* Desktop Hover Overlay (covers the text content above the footer) */}
        {isLongDescription && (
          <div className="absolute inset-x-0 top-0 bottom-[76px] bg-brand-card/98 backdrop-blur-md opacity-0 pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto transition-opacity duration-300 z-10 flex flex-col px-6 pt-6 pb-2 text-left">
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider mb-2 block">
              Descripción Completa
            </span>
            <h4 className="text-sm font-bold text-brand-text mb-2 leading-snug line-clamp-2">
              {course.title}
            </h4>
            <div className="overflow-y-auto pr-1 text-xs text-brand-text-muted leading-relaxed whitespace-pre-line scrollbar-thin">
              {course.shortDescription}
            </div>
          </div>
        )}

        {/* Card Title */}
        <h3 className="text-lg font-bold text-brand-text line-clamp-1 mb-2">
          {course.title}
        </h3>

        {/* Short Description */}
        <p className="text-brand-text-muted text-sm line-clamp-2 mb-3">
          {course.shortDescription}
        </p>

        {/* Show Complete Description Trigger */}
        {isLongDescription && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setIsMobileModalOpen(true);
            }}
            className="text-xs text-brand-primary font-semibold mb-4 text-left hover:underline cursor-pointer focus:outline-none self-start"
          >
            Ver descripción completa
          </button>
        )}

        {/* Duration & Start Date Badges Container */}
        <div className="flex flex-wrap gap-2 mb-4 mt-auto">
          {course.duration && (
            <div className="text-[10px] text-brand-secondary bg-brand-secondary/10 px-2.5 py-1 rounded-md font-semibold border border-brand-secondary/20 flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0Z" />
              </svg>
              {course.duration}
            </div>
          )}

          {course.type === 'LIVE' && course.scheduledAt && (
            <div className="text-[10px] text-brand-accent bg-brand-accent/10 px-2.5 py-1 rounded-md font-semibold border border-brand-accent/20 flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Comienza: {new Date(course.scheduledAt).toLocaleDateString('es-AR', {
                day: 'numeric',
                month: 'long'
              })}
            </div>
          )}
        </div>

        {/* Card Footer (Pricing & CTA Button) */}
        <div className="pt-4 border-t border-brand-border/20 flex items-center justify-between">
          <div className="flex flex-col min-h-[40px] justify-center">
            {isAvailable && (() => {
              const pricing = formatCoursePrice(course as any, getDefaultCurrency(course as any));
              return (
                <>
                  {pricing.hasOriginalPrice && (
                    <span className="text-xs text-brand-text-muted/65 line-through font-light">
                      {pricing.originalPriceLabel}
                    </span>
                  )}
                  <span className="text-lg font-extrabold text-brand-primary">
                    {pricing.currentPriceLabel}
                  </span>
                </>
              );
            })()}
          </div>
          
          {isAvailable ? (
            <Link
              href={`/campus/${course.slug}`}
              className="text-sm font-semibold text-white bg-brand-primary hover:bg-brand-primary/95 px-4 py-2 rounded-lg transition-all shadow-sm active:scale-[0.98]"
            >
              Ver detalles
            </Link>
          ) : (
            <button
              disabled
              className="text-sm font-semibold text-brand-text-muted bg-brand-border/40 px-4 py-2 rounded-lg cursor-not-allowed border border-brand-border/10"
            >
              Próximamente
            </button>
          )}
        </div>
      </div>

      {/* Mobile Drawer/Modal (Opens on description click for mobile) */}
      {isMobileModalOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:hidden"
          onClick={() => setIsMobileModalOpen(false)}
        >
          <div 
            className="bg-brand-card border border-brand-border/45 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl relative animate-fade-in text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setIsMobileModalOpen(false)}
              className="absolute top-4 right-4 text-brand-text-muted hover:text-brand-text p-1 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="text-xs font-bold text-brand-primary uppercase tracking-wider block">
              Descripción del Curso
            </span>
            <h3 className="text-lg font-black text-brand-text pr-6 leading-tight">
              {course.title}
            </h3>
            <div className="max-h-[50vh] overflow-y-auto pr-1 text-sm text-brand-text-muted leading-relaxed whitespace-pre-line scrollbar-thin">
              {course.shortDescription}
            </div>
            <div className="pt-4 border-t border-brand-border/20 flex items-center justify-between">
              {course.duration && (
                <span className="text-xs font-semibold text-brand-secondary flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0Z" />
                  </svg>
                  {course.duration}
                </span>
              )}
              {isAvailable ? (
                <Link
                  href={`/campus/${course.slug}`}
                  className="text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/95 px-4 py-2 rounded-lg transition-all"
                  onClick={() => setIsMobileModalOpen(false)}
                >
                  Ver detalles
                </Link>
              ) : (
                <button disabled className="text-xs font-semibold text-brand-text-muted bg-brand-border/40 px-4 py-2 rounded-lg cursor-not-allowed">
                  Próximamente
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

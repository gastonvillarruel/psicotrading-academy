'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { HeroSlide } from '@/config/heroSlides';

interface HeroSliderProps {
  slides?: (HeroSlide & { isAvailable?: boolean })[];
}

export default function HeroSlider({ slides = [] }: HeroSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Reset index if out of bounds (e.g. when slides list filters dynamically)
  useEffect(() => {
    if (currentIndex >= slides.length && slides.length > 0) {
      setCurrentIndex(0);
    }
  }, [slides.length, currentIndex]);

  const hasMultipleSlides = slides.length > 1;

  const currentSlide = slides[currentIndex] || slides[0];
  const currentDuration = currentSlide?.durationMs || 5000;

  useEffect(() => {
    if (!hasMultipleSlides || isPaused || slides.length === 0) return;

    const timer = setTimeout(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
    }, currentDuration);

    return () => clearTimeout(timer);
  }, [currentIndex, hasMultipleSlides, isPaused, slides.length, currentDuration]);

  // Defensive fallbacks
  if (!slides || slides.length === 0) {
    return null;
  }

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + slides.length) % slides.length);
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
  };

  const handleDotClick = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <section
      className="relative w-full h-[372px] bg-[#f8fafc] overflow-hidden select-none border-b border-slate-200/60 transition-all duration-300"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="Destacados del Campus"
    >
      {/* Slides Container - Flex layout with translateX for slide-to-left effect */}
      <div
        className="flex w-full h-full transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {slides.map((slide, index) => {
          // Normaliza el color base si tiene canal alfa en formato hexadecimal de 8 caracteres
          const cleanBaseColor = slide.baseColor.startsWith('#') && slide.baseColor.length === 9
            ? slide.baseColor.slice(0, 7)
            : slide.baseColor;

          // Normaliza los colores del gradiente si tienen canal alfa de 8 caracteres
          const cleanGradientColors = slide.gradientColors
            ? slide.gradientColors.map(color => 
                color.startsWith('#') && color.length === 9 ? color.slice(0, 7) : color
              )
            : [];

          // Genera un gradiente lineal diagonal real que mezcla todos los colores de forma visible
          const linearGradient = cleanGradientColors.length > 0
            ? `linear-gradient(135deg, ${cleanBaseColor}, ${cleanGradientColors.join(', ')})`
            : 'none';

          const slideBgStyle = {
            backgroundColor: cleanBaseColor,
            backgroundImage: linearGradient
          };

          return (
            <div
              key={index}
              className="relative w-full h-full flex-shrink-0"
            >
              {/* Premium Light Mesh Background */}
              <div
                className="absolute inset-0 w-full h-full transition-all duration-500"
                style={slideBgStyle}
              >
                {/* Tech Grid Overlay */}
                <div
                  className="absolute inset-0 opacity-25 mix-blend-overlay"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(15, 23, 42, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.08) 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                  }}
                />
                {/* Contrast overlays to guarantee text readability in light theme using cleanBaseColor (more transparent to show the mesh gradient) */}
                <div 
                  className="absolute inset-0 hidden md:block"
                  style={{ 
                    backgroundImage: slide.imagePosition === 'left'
                      ? `linear-gradient(to left, ${cleanBaseColor}70 0%, ${cleanBaseColor}40 30%, ${cleanBaseColor}10 60%, transparent 100%)`
                      : `linear-gradient(to right, ${cleanBaseColor}70 0%, ${cleanBaseColor}40 30%, ${cleanBaseColor}10 60%, transparent 100%)`
                  }}
                />
                <div 
                  className="absolute inset-0 hidden md:block"
                  style={{ 
                    backgroundImage: `linear-gradient(to top, ${cleanBaseColor}30 0%, transparent 100%)` 
                  }}
                />
                <div 
                  className="absolute inset-0 md:hidden"
                  style={{ 
                    backgroundColor: `${cleanBaseColor}80` // More transparent on mobile to let mesh shine
                  }}
                />
              </div>

              {/* Slide Content */}
              <div className="relative z-20 max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                {/* Left side: Information (Titles, Badge, CTA) */}
                <div className={`w-full md:max-w-2xl space-y-3.5 sm:space-y-4 md:space-y-3.5 my-auto flex flex-col ${slide.imagePosition === 'left' ? 'md:order-last' : 'md:order-first'}`}>
                  {slide.badge && (
                    <div className="text-left">
                      <span 
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold tracking-widest border uppercase"
                        style={{
                          backgroundColor: slide.badgeBg || 'rgba(99, 102, 241, 0.1)',
                          color: slide.badgeTextColor || '#6366f1',
                          borderColor: slide.badgeBorderColor || 'rgba(99, 102, 241, 0.2)'
                        }}
                      >
                        {slide.badge}
                      </span>
                    </div>
                  )}

                  <h2
                    className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight text-center"
                    style={{ color: slide.textColor }}
                    dangerouslySetInnerHTML={{ __html: slide.title }}
                  />

                  <p
                    className="text-sm sm:text-base font-semibold line-clamp-3 max-w-2xl text-center mx-auto"
                    style={{ color: slide.subtitleColor }}
                    dangerouslySetInnerHTML={{ __html: slide.subtitle }}
                  />

                  <div className="pt-2 flex justify-end">
                    {slide.isAvailable !== false ? (
                      <Link
                        href={slide.ctaUrl}
                        className="inline-flex items-center justify-center px-6 py-2.5 sm:px-7 sm:py-3 text-xs sm:text-sm md:text-base font-bold rounded-xl transition-all duration-200 shadow-md hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          backgroundColor: slide.btnEnabledBg || '#0f172a',
                          color: slide.btnEnabledTextColor || '#ffffff'
                        }}
                      >
                        <span>{slide.ctaText}</span>
                        <svg className="ml-1.5 h-4 w-4 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </Link>
                    ) : (
                      <button
                        disabled
                        className="inline-flex items-center justify-center px-6 py-2.5 sm:px-7 sm:py-3 text-xs sm:text-sm md:text-base font-bold rounded-xl shadow-md cursor-default select-none"
                        style={{
                          backgroundColor: slide.btnDisabledBg || slide.btnEnabledBg || '#0f172a',
                          color: slide.btnDisabledTextColor || slide.btnEnabledTextColor || '#ffffff'
                        }}
                      >
                        <span>Proximamente</span>
                      </button>
                    )}
                  </div>
                </div>

                 {/* Right side: Instructor (Hidden in mobile, float animation) */}
                 {slide.instructorImage && (
                   <div className={`hidden md:flex w-1/3 relative h-full items-end justify-center self-end ${slide.imagePosition === 'left' ? 'md:order-first' : 'md:order-last'}`}>
                     <div className="relative h-full w-full flex items-end justify-center">
                       {/* Glow Behind Instructor */}
                       <div
                         className="absolute bottom-6 left-1/2 -translate-x-1/2 w-36 h-36 md:w-44 md:h-44 rounded-full blur-3xl transition-all duration-500"
                         style={{ backgroundColor: slide.glowColor }}
                       />
 
                       <img
                         src={slide.instructorImage}
                         alt="Instructor"
                         className="relative z-10 h-full w-auto max-w-none drop-shadow-[0_15px_30px_rgba(0,0,0,0.15)] animate-fade-in-up select-none"
                         style={{
                           transform: `scale(${slide.imageScale || 1}) translateY(${slide.imageTranslateY || '0px'})`,
                           transformOrigin: 'bottom center'
                         }}
                       />
                     </div>
                   </div>
                 )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual Navigation Arrows (Only shown if multiple slides exist) */}
      {hasMultipleSlides && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-30 p-2.5 bg-white/80 hover:bg-white text-slate-800 hover:text-brand-primary rounded-full border border-slate-200/50 backdrop-blur-sm transition-all shadow-md active:scale-95 group focus:outline-none"
            aria-label="Slide anterior"
          >
            <svg className="h-4.5 w-4.5 transform group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={handleNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-30 p-2.5 bg-white/80 hover:bg-white text-slate-800 hover:text-brand-primary rounded-full border border-slate-200/50 backdrop-blur-sm transition-all shadow-md active:scale-95 group focus:outline-none"
            aria-label="Siguiente slide"
          >
            <svg className="h-4.5 w-4.5 transform group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Bottom dots indicators (Only shown if multiple slides exist) */}
      {hasMultipleSlides && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex space-x-1.5">
          {slides.map((_, index) => {
            const isActive = index === currentIndex;

            return (
              <button
                key={index}
                onClick={() => handleDotClick(index)}
                className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none ${isActive ? 'w-6 bg-slate-800' : 'w-1.5 bg-slate-900/20 hover:bg-slate-900/40'
                  }`}
                aria-label={`Ir al slide ${index + 1}`}
                aria-current={isActive ? 'true' : 'false'}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

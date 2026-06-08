'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { HeroSlide } from '@/config/heroSlides';

interface HeroSliderProps {
  slides?: HeroSlide[];
}

export default function HeroSlider({ slides = [] }: HeroSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const hasMultipleSlides = slides.length > 1;

  useEffect(() => {
    if (!hasMultipleSlides || isPaused || slides.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [hasMultipleSlides, isPaused, slides.length]);

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
      className="relative w-full h-[190px] bg-[#0c1322] overflow-hidden select-none border-b border-brand-border/10"
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
          return (
            <div
              key={index}
              className="relative w-full h-full flex-shrink-0"
            >
              {/* Premium Mesh Background */}
              <div 
                className="absolute inset-0 w-full h-full bg-[#0c1322] transition-all duration-500"
                style={{ backgroundImage: slide.bgGradient }}
              >
                {/* Tech Grid Overlay */}
                <div 
                  className="absolute inset-0 opacity-40 mix-blend-overlay"
                  style={{ 
                    backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)', 
                    backgroundSize: '18px 18px' 
                  }}
                />
                {/* Contrast overlays to guarantee text readability */}
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/30 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent" />
              </div>

              {/* Slide Content */}
              <div className="relative z-20 max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                {/* Left side: Information (Titles, Badge, CTA) */}
                <div className="w-full md:max-w-2xl text-left space-y-1.5 sm:space-y-2">
                  {slide.badge && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold tracking-widest bg-brand-primary/20 text-blue-300 border border-brand-primary/30 uppercase">
                      {slide.badge}
                    </span>
                  )}

                  <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white leading-tight tracking-tight drop-shadow-sm">
                    {slide.title}
                  </h2>

                  <p className="text-[11px] sm:text-xs md:text-sm text-slate-300 font-medium line-clamp-2 max-w-xl">
                    {slide.subtitle}
                  </p>

                  <div className="pt-0.5">
                    <Link
                      href={slide.ctaUrl}
                      className="inline-flex items-center justify-center px-4 py-1.5 sm:py-2 bg-brand-primary hover:bg-brand-primary/90 text-white text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 shadow-md shadow-brand-primary/10 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <span>{slide.ctaText}</span>
                      <svg className="ml-1 h-3.5 w-3.5 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </Link>
                  </div>
                </div>

                {/* Right side: Instructor (Hidden in mobile, float animation) */}
                {slide.instructorImage && (
                  <div className="hidden md:flex w-1/3 relative h-full items-end justify-center self-end">
                    <div className="relative max-h-full w-full flex items-end justify-center">
                      {/* Glow Behind Instructor */}
                      <div 
                        className="absolute bottom-6 left-1/2 -translate-x-1/2 w-28 h-28 rounded-full blur-2xl transition-all duration-500" 
                        style={{ backgroundColor: slide.glowColor }}
                      />

                      <img
                        src={slide.instructorImage}
                        alt="Instructor"
                        className="relative z-10 max-h-[175px] md:max-h-[185px] w-auto object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] animate-fade-in-up select-none"
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
            className="absolute left-3 top-1/2 -translate-y-1/2 z-30 p-1.5 bg-slate-900/60 hover:bg-slate-900/90 text-white hover:text-blue-400 rounded-full border border-slate-800/30 backdrop-blur-sm transition-all shadow-md active:scale-95 group focus:outline-none"
            aria-label="Slide anterior"
          >
            <svg className="h-4 w-4 transform group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={handleNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-30 p-1.5 bg-slate-900/60 hover:bg-slate-900/90 text-white hover:text-blue-400 rounded-full border border-slate-800/30 backdrop-blur-sm transition-all shadow-md active:scale-95 group focus:outline-none"
            aria-label="Siguiente slide"
          >
            <svg className="h-4 w-4 transform group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Bottom dots indicators (Only shown if multiple slides exist) */}
      {hasMultipleSlides && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex space-x-1.5">
          {slides.map((_, index) => {
            const isActive = index === currentIndex;

            return (
              <button
                key={index}
                onClick={() => handleDotClick(index)}
                className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none ${isActive ? 'w-5 bg-blue-400' : 'w-1.5 bg-white/30 hover:bg-white/60'
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

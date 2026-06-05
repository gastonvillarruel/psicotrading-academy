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
      className="relative w-full h-[300px] md:h-[320px] bg-slate-950 overflow-hidden select-none border-b border-brand-border/10"
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
              {/* Background Image with Dark Overlays */}
              <div className="absolute inset-0 w-full h-full bg-slate-900">
                <img
                  src={slide.image}
                  alt=""
                  className="w-full h-full object-cover opacity-85"
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-slate-950/20" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
              </div>

              {/* Slide Content */}
              <div className="relative z-20 max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                {/* Left side: Information (Titles, Badge, CTA) */}
                <div className="w-full md:max-w-2xl text-left space-y-2.5 sm:space-y-4">
                  {slide.badge && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest bg-brand-primary/20 text-blue-300 border border-brand-primary/30 uppercase animate-pulse">
                      {slide.badge}
                    </span>
                  )}

                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white leading-tight tracking-tight drop-shadow-sm">
                    {slide.title}
                  </h2>

                  <p className="text-sm sm:text-base text-slate-300 font-medium line-clamp-2 max-w-xl">
                    {slide.subtitle}
                  </p>

                  <div className="pt-1">
                    <Link
                      href={slide.ctaUrl}
                      className="inline-flex items-center justify-center px-5 py-2.5 bg-brand-primary hover:bg-brand-primary/90 text-white text-sm font-bold rounded-xl transition-all duration-200 shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <span>{slide.ctaText}</span>
                      <svg className="ml-1.5 h-4 w-4 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </Link>
                  </div>
                </div>

                {/* Right side: Instructor (Hidden in mobile, float animation) */}
                {slide.instructorImage && (
                  <div className="hidden md:flex w-1/3 relative h-full items-end justify-center self-end pt-4">
                    <div className="relative max-h-[95%] w-full flex items-end justify-center">
                      {/* Glow Behind Instructor */}
                      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-36 h-36 bg-blue-500/20 rounded-full blur-2xl" />

                      <img
                        src={slide.instructorImage}
                        alt="Instructor"
                        className="relative z-10 max-h-[260px] md:max-h-[280px] w-auto object-contain drop-shadow-[0_15px_30px_rgba(0,0,0,0.6)] animate-fade-in-up select-none"
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
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-2.5 bg-slate-900/50 hover:bg-slate-900/80 text-white hover:text-blue-400 rounded-full border border-slate-800/30 backdrop-blur-sm transition-all shadow-md active:scale-95 group focus:outline-none"
            aria-label="Slide anterior"
          >
            <svg className="h-4.5 w-4.5 transform group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-2.5 bg-slate-900/50 hover:bg-slate-900/80 text-white hover:text-blue-400 rounded-full border border-slate-800/30 backdrop-blur-sm transition-all shadow-md active:scale-95 group focus:outline-none"
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
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex space-x-2">
          {slides.map((_, index) => {
            const isActive = index === currentIndex;

            return (
              <button
                key={index}
                onClick={() => handleDotClick(index)}
                className={`h-2 rounded-full transition-all duration-300 focus:outline-none ${isActive ? 'w-6 bg-blue-400' : 'w-2 bg-white/40 hover:bg-white/70'
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

'use client';

import React, { useState, useEffect } from 'react';
import { FiCheckCircle, FiXCircle, FiBookOpen, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

interface Answer {
  id?: string;
  questionTextSnapshot: string;
  isCorrect: boolean;
  selectedOptionTextSnapshot?: string | null;
  correctOptionTextSnapshot?: string | null;
  explanationSnapshot?: string | null;
}

interface AnswerBreakdownSliderProps {
  answers: Answer[];
}

export default function AnswerBreakdownSlider({ answers }: AnswerBreakdownSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pending_quiz_attempt_id');
    }
  }, []);

  if (!answers || answers.length === 0) return null;

  const currentAnswer = answers[currentIndex];
  const isCorrect = currentAnswer.isCorrect;

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : answers.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < answers.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 flex flex-col justify-between h-full">
      {/* Header with Title & Navigation Controls */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2 text-white">
          <FiBookOpen className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg sm:text-xl font-bold">Desglose de Respuestas</h2>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700/50">
            {currentIndex + 1} de {answers.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrev}
              title="Respuesta anterior"
              className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-700/80 transition-all cursor-pointer"
            >
              <FiChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              title="Siguiente respuesta"
              className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-700/80 transition-all cursor-pointer"
            >
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Answer Content - Centered Layout with Uniform Height */}
      <div className="flex-1 flex flex-col items-center justify-center text-center py-2 space-y-4 min-h-[380px] sm:min-h-[420px]">
        {/* Status Badge */}
        <div className="flex justify-center">
          {isCorrect ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider shadow-sm shadow-emerald-500/10">
              <FiCheckCircle className="w-4 h-4" /> Respuesta Correcta
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold uppercase tracking-wider shadow-sm shadow-rose-500/10">
              <FiXCircle className="w-4 h-4" /> Respuesta Incorrecta
            </span>
          )}
        </div>

        {/* Question Text */}
        <div className="max-w-2xl mx-auto">
          <h3 className="text-base sm:text-lg font-bold text-white leading-relaxed">
            {currentAnswer.questionTextSnapshot}
          </h3>
        </div>

        {/* Choices Comparison Boxes - Full Width Stacked */}
        <div className="w-full max-w-xl mx-auto flex flex-col gap-3 pt-1">
          <div className={`w-full p-4 rounded-2xl border text-center space-y-1 flex flex-col items-center justify-center ${
            isCorrect
              ? 'bg-emerald-950/20 border-emerald-500/30'
              : 'bg-rose-950/20 border-rose-500/30'
          }`}>
            <span className="text-xs text-slate-400 font-medium block uppercase tracking-wider text-[11px]">
              Tu respuesta elegida:
            </span>
            <span className={`font-bold text-sm sm:text-base ${isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
              {currentAnswer.selectedOptionTextSnapshot || 'Sin responder'}
            </span>
          </div>

          {!isCorrect && (
            <div className="w-full p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-center space-y-1 flex flex-col items-center justify-center">
              <span className="text-xs text-slate-400 font-medium block uppercase tracking-wider text-[11px]">
                Respuesta correcta:
              </span>
              <span className="font-bold text-sm sm:text-base text-emerald-400">
                {currentAnswer.correctOptionTextSnapshot || 'N/A'}
              </span>
            </div>
          )}

          {/* Explanation Box */}
          {currentAnswer.explanationSnapshot && (
            <div className="w-full p-4 rounded-2xl bg-slate-800/40 border border-slate-700/40 text-center space-y-1.5">
              <span className="font-bold text-amber-400 block uppercase tracking-wider text-[11px]">
                Explicación:
              </span>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
                {currentAnswer.explanationSnapshot}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Dots & Navigation */}
      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-center gap-1.5 flex-wrap">
        {answers.map((ans, idx) => {
          const active = idx === currentIndex;
          const correct = ans.isCorrect;
          return (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`w-7 h-7 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                active
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400/50 scale-110 shadow-md shadow-amber-500/30'
                  : correct
                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-900/60'
                  : 'bg-rose-950/40 text-rose-400 border border-rose-500/30 hover:bg-rose-900/60'
              }`}
              title={`Ir a pregunta ${idx + 1}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

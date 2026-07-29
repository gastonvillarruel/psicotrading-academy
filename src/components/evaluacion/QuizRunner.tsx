'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startEvaluationAttemptAction, completeEvaluationAttemptAction } from '@/app/actions/evaluaciones';
import { FiCheckCircle, FiArrowRight, FiClock, FiHelpCircle, FiVideo } from 'react-icons/fi';

interface QuestionOption {
  id: string;
  text: string;
  imageUrl?: string | null;
}

interface Question {
  id: string;
  text: string;
  type: string;
  options: QuestionOption[];
}

interface QuizItem {
  id: string;
  question: Question;
}

interface QuizRunnerProps {
  quiz: {
    id: string;
    title: string;
    description?: string | null;
    coverImage?: string | null;
    youtubeLiveUrl?: string | null;
    questions: QuizItem[];
  };
  isAuthenticated: boolean;
}

export default function QuizRunner({ quiz, isAuthenticated }: QuizRunnerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [hasStarted, setHasStarted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);

  const totalQuestions = quiz.questions.length;
  const currentQuestionItem = quiz.questions[currentIndex];
  const currentQuestion = currentQuestionItem?.question;

  // Extract marketing & analytics parameters
  const getTrackingData = () => {
    let guestToken = typeof window !== 'undefined' ? localStorage.getItem('quiz_guest_token') : null;
    if (!guestToken && typeof window !== 'undefined') {
      guestToken = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('quiz_guest_token', guestToken);
    }

    const utmSource = searchParams.get('utm_source') || undefined;
    const utmMedium = searchParams.get('utm_medium') || undefined;
    const utmCampaign = searchParams.get('utm_campaign') || undefined;
    const referer = typeof document !== 'undefined' ? document.referrer : undefined;
    const source = searchParams.get('source') || 'live_qr';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
    const device = typeof window !== 'undefined' && window.innerWidth < 768 ? 'Mobile' : 'Desktop';

    return {
      guestToken: guestToken || undefined,
      utmSource,
      utmMedium,
      utmCampaign,
      referer,
      source,
      device,
      userAgent
    };
  };

  const handleStart = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const tracking = getTrackingData();
      const res = await startEvaluationAttemptAction({
        quizId: quiz.id,
        ...tracking
      });

      if (!res.success || !res.attemptId) {
        throw new Error(res.error || 'No se pudo iniciar la evaluación');
      }

      setAttemptId(res.attemptId);
      setStartTime(Date.now());
      setHasStarted(true);
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al iniciar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOptionSelect = (optionId: string) => {
    if (!currentQuestion) return;
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: optionId
    }));
  };

  const handleNext = async () => {
    if (!currentQuestion) return;
    const selected = selectedAnswers[currentQuestion.id];
    if (!selected) {
      setError('Por favor, seleccioná una respuesta antes de continuar.');
      return;
    }
    setError(null);

    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Complete attempt
      await finishQuiz();
    }
  };

  const finishQuiz = async () => {
    if (!attemptId) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const formattedAnswers = Object.entries(selectedAnswers).map(([questionId, selectedOptionId]) => ({
        questionId,
        selectedOptionId
      }));

      const durationSeconds = startTime ? Math.round((Date.now() - startTime) / 1000) : undefined;

      const res = await completeEvaluationAttemptAction({
        attemptId,
        answers: formattedAnswers,
        duration: durationSeconds
      });

      if (!res.success) {
        throw new Error(res.error || 'Error al enviar las respuestas');
      }

      // Store attemptId in localStorage for unauthenticated backup
      if (typeof window !== 'undefined') {
        localStorage.setItem('pending_quiz_attempt_id', attemptId);
      }

      if (!isAuthenticated) {
        router.push(`/evaluacion/unauthenticated?attemptId=${attemptId}`);
      } else {
        router.push(`/evaluacion/resultado?attemptId=${attemptId}`);
      }
    } catch (err: any) {
      setError(err.message || 'Hubo un problema al enviar tus respuestas.');
      setIsSubmitting(false);
    }
  };

  // Pre-start Start Screen
  if (!hasStarted) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-xl bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
          {quiz.coverImage && (
            <div className="w-full h-48 sm:h-56 rounded-2xl overflow-hidden mb-4 relative border border-slate-800">
              <img src={quiz.coverImage} alt={quiz.title} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <FiHelpCircle className="w-4 h-4" /> Evaluación Psicotrading
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
            {quiz.title}
          </h1>

          {quiz.description && (
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-lg mx-auto">
              {quiz.description}
            </p>
          )}

          {quiz.youtubeLiveUrl && (
            <div className="pt-2">
              <a
                href={quiz.youtubeLiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 hover:border-red-500/50 text-red-400 font-bold text-xs sm:text-sm rounded-xl transition-all duration-200"
              >
                <FiVideo className="w-4 h-4 stroke-[2.5]" />
                <span>Ver Clase en Vivo (YouTube)</span>
              </a>
            </div>
          )}

          <div className="flex items-center justify-center gap-6 text-slate-400 text-xs sm:text-sm font-medium py-2">
            <div className="flex items-center gap-2 bg-slate-800/60 px-4 py-2 rounded-xl border border-slate-700/50">
              <FiCheckCircle className="text-emerald-400 w-4 h-4" />
              <span>{totalQuestions} {totalQuestions === 1 ? 'Pregunta' : 'Preguntas'}</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/60 px-4 py-2 rounded-xl border border-slate-700/50">
              <FiClock className="text-amber-400 w-4 h-4" />
              <span>~{Math.max(1, Math.round(totalQuestions * 0.5))} min</span>
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-xs sm:text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={isSubmitting}
            className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-base sm:text-lg rounded-2xl shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <span>Cargando...</span>
            ) : (
              <>
                <span>Comenzar Evaluación</span>
                <FiArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Active Question Screen
  const currentAnswer = selectedAnswers[currentQuestion?.id || ''];
  const progressPercent = Math.round(((currentIndex + 1) / totalQuestions) * 100);

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Progress Bar & Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
            <span className="text-amber-400">Pregunta {currentIndex + 1} de {totalQuestions}</span>
            <span className="text-slate-400">{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Question Statement */}
        <div className="py-2">
          <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
            {currentQuestion?.text}
          </h2>
        </div>

        {/* Options Grid */}
        <div className="space-y-3">
          {currentQuestion?.options.map((opt) => {
            const isSelected = currentAnswer === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleOptionSelect(opt.id)}
                className={`w-full p-4 rounded-2xl border text-left transition-all duration-200 flex items-center justify-between gap-4 cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-200 hover:bg-slate-800 hover:border-slate-600'
                }`}
              >
                <span className="text-sm sm:text-base font-medium leading-relaxed">{opt.text}</span>
                <div
                  className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected
                      ? 'border-amber-400 bg-amber-400 text-slate-950'
                      : 'border-slate-600 bg-slate-800'
                  }`}
                >
                  {isSelected && <FiCheckCircle className="w-4 h-4 stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-xs sm:text-sm text-center">
            {error}
          </div>
        )}

        {/* Next / Submit Button */}
        <div className="pt-4">
          <button
            onClick={handleNext}
            disabled={!currentAnswer || isSubmitting}
            className={`w-full py-4 px-6 font-bold text-base sm:text-lg rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
              currentAnswer && !isSubmitting
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <span>Calculando resultado...</span>
            ) : (
              <>
                <span>{currentIndex === totalQuestions - 1 ? 'Finalizar y Ver Resultado' : 'Siguiente Pregunta'}</span>
                <FiArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

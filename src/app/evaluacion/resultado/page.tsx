import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { quizAttemptService } from '@/lib/services/quiz-attempt.service';
import Link from 'next/link';
import { FiAward } from 'react-icons/fi';
import { FaYoutube, FaTiktok, FaInstagram, FaTelegramPlane, FaTwitter, FaHome } from 'react-icons/fa';
import AnswerBreakdownSlider from '@/components/evaluacion/AnswerBreakdownSlider';

interface ResultPageProps {
  searchParams: Promise<{ attemptId?: string }>;
}

export default async function QuizResultPage({ searchParams }: ResultPageProps) {
  const session = await getServerSession(authOptions);
  const resolvedSearchParams = await searchParams;
  const attemptId = resolvedSearchParams.attemptId;

  if (!attemptId) {
    redirect('/evaluacion');
  }

  if (!session?.user) {
    redirect(`/evaluacion/unauthenticated?attemptId=${attemptId}`);
  }

  const result = await quizAttemptService.getAttemptResult(attemptId, session.user.id);
  const { attempt, level } = result;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4 sm:px-6 lg:py-10 flex items-center justify-center">
      <div className="max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
          {/* Left Column: Vertical Score & Level Card */}
          <div className="lg:col-span-5 xl:col-span-4 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between space-y-6 text-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider">
                <FiAward className="w-4 h-4" /> Resultado de Evaluación
              </div>

              <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
                {attempt.quiz.title}
              </h1>

              {/* Vertical Stats Stack */}
              <div className="space-y-4 pt-2">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 text-center space-y-1">
                  <span className="text-slate-400 text-xs uppercase font-bold tracking-wider block">Puntaje</span>
                  <div className="text-3xl sm:text-4xl font-black text-white">
                    {attempt.score} <span className="text-slate-500 text-base font-medium">/ {attempt.maxScore}</span>
                  </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 text-center space-y-1">
                  <span className="text-slate-400 text-xs uppercase font-bold tracking-wider block">Porcentaje</span>
                  <div className="text-3xl sm:text-4xl font-black text-amber-400">
                    {Math.round(attempt.percentage)}%
                  </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 text-center space-y-1">
                  <span className="text-slate-400 text-xs uppercase font-bold tracking-wider block">Nivel Obtenido</span>
                  <div className="text-lg sm:text-xl font-bold text-emerald-400 leading-snug">
                    {level}
                  </div>
                </div>
              </div>
            </div>

            {/* Micro summary indicator */}
            <div className="pt-4 border-t border-slate-800/80 text-xs text-slate-400 font-medium">
              PSICOEMOTRADING • Evaluación Oficial
            </div>
          </div>

          {/* Right Column: Breakdown Slider + Social & Navigation Footer */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6 lg:gap-8 justify-between">
            {/* Top Right: Answer Breakdown Slider */}
            <div className="flex-1 min-h-0">
              <AnswerBreakdownSlider answers={attempt.answers} />
            </div>

            {/* Bottom Right: Thank you & Social Community Links */}
            <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl text-center space-y-5">
              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-white">¡Gracias por participar!</h3>
                <p className="text-slate-400 text-xs sm:text-sm max-w-xl mx-auto">
                  Sumate a nuestras comunidades oficiales para seguir aprendiendo y no perderte las próximas sesiones de Psicotrading.
                </p>
              </div>

              {/* Social Links */}
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <a
                  href="https://www.youtube.com/@acfullscalping"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-600/10 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white transition-all text-xs font-bold"
                >
                  <FaYoutube className="w-4 h-4" /> YouTube
                </a>
                <a
                  href="https://www.instagram.com/fullscalping"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-pink-600/10 border border-pink-500/30 text-pink-400 hover:bg-pink-600 hover:text-white transition-all text-xs font-bold"
                >
                  <FaInstagram className="w-4 h-4" /> Instagram
                </a>
                <a
                  href="https://www.tiktok.com/@fullscalping"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white transition-all text-xs font-bold"
                >
                  <FaTiktok className="w-4 h-4" /> TikTok
                </a>
                <a
                  href="https://t.me/fullscalping"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600/10 border border-sky-500/30 text-sky-400 hover:bg-sky-600 hover:text-white transition-all text-xs font-bold"
                >
                  <FaTelegramPlane className="w-4 h-4" /> Telegram
                </a>
                <a
                  href="https://x.com/fullscalping"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white transition-all text-xs font-bold"
                >
                  <FaTwitter className="w-4 h-4" /> X (Twitter)
                </a>
              </div>

              {/* Button to Home */}
              <div className="pt-1">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all duration-300"
                >
                  <FaHome className="w-4 h-4" />
                  <span>Volver a la Página Principal</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

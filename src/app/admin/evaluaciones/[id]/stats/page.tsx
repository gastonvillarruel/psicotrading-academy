import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { quizService } from '@/lib/services/quiz.service';
import { quizAttemptService } from '@/lib/services/quiz-attempt.service';
import { FiArrowLeft, FiUsers, FiPercent, FiClock, FiAlertOctagon, FiBarChart2, FiCheckCircle } from 'react-icons/fi';

export const metadata = {
  title: 'Estadísticas de Evaluación | Panel de Administración',
};

interface StatsPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminQuizStatsPage({ params }: StatsPageProps) {
  const resolvedParams = await params;
  const quiz = await quizService.getQuizById(resolvedParams.id);
  if (!quiz) notFound();

  const stats = await quizAttemptService.getQuizStats(resolvedParams.id);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} seg`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/evaluaciones"
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <FiArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Estadísticas: {quiz.title}</h1>
            <p className="text-xs text-gray-500">Métricas de rendimiento, participación y precisión</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-gray-500">Participantes</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FiUsers className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-gray-900">{stats.totalFinished}</div>
          <p className="text-xs text-gray-500">de {stats.totalStarted} iniciados</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-gray-500">Promedio General</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <FiPercent className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-amber-600">{stats.averagePercentage}%</div>
          <p className="text-xs text-gray-500">Acierto general</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-gray-500">Tiempo Promedio</span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <FiClock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-gray-900">{formatDuration(stats.averageDuration)}</div>
          <p className="text-xs text-gray-500">Resolución promedio</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-gray-500">Tasa de Abandono</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <FiAlertOctagon className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-rose-600">{stats.abandonmentRate}%</div>
          <p className="text-xs text-gray-500">Iniciaron sin finalizar</p>
        </div>
      </div>

      {/* Most Failed Question Highlight */}
      {stats.mostFailedQuestion && (
        <div className="bg-gradient-to-r from-rose-50 to-orange-50 rounded-2xl border border-rose-200/80 p-6 space-y-3">
          <div className="flex items-center gap-2 text-rose-700 font-bold text-xs uppercase tracking-wider">
            <FiAlertOctagon className="w-4 h-4" /> Pregunta más fallada
          </div>
          <h3 className="text-base sm:text-lg font-bold text-gray-900">
            "{stats.mostFailedQuestion.text}"
          </h3>
          <div className="flex items-center gap-4 text-xs font-semibold text-rose-700">
            <span>Precisión de acierto: {stats.mostFailedQuestion.accuracyPercentage}%</span>
            <span>({stats.mostFailedQuestion.correctAnswers} aciertos de {stats.mostFailedQuestion.totalAnswers})</span>
          </div>
        </div>
      )}

      {/* Questions accuracy breakdown table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2 text-gray-900 font-bold text-lg">
          <FiBarChart2 className="w-5 h-5 text-amber-500" />
          <h2>Desglose por Pregunta</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-700 uppercase text-[11px] font-bold tracking-wider border-b border-gray-100">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Enunciado</th>
                <th className="px-4 py-3">Respuestas</th>
                <th className="px-4 py-3">Aciertos</th>
                <th className="px-4 py-3 text-right">% Acierto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.questionBreakdown.map((q, idx) => (
                <tr key={q.questionId} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3.5 font-bold text-gray-400">{idx + 1}</td>
                  <td className="px-4 py-3.5 font-semibold text-gray-900 max-w-md truncate">
                    {q.text}
                  </td>
                  <td className="px-4 py-3.5 text-gray-700">{q.totalAnswers}</td>
                  <td className="px-4 py-3.5 text-emerald-600 font-medium">{q.correctAnswers}</td>
                  <td className="px-4 py-3.5 text-right font-bold text-gray-900">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-lg text-xs ${
                        q.accuracyPercentage >= 70
                          ? 'bg-emerald-50 text-emerald-700'
                          : q.accuracyPercentage >= 40
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {q.accuracyPercentage}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

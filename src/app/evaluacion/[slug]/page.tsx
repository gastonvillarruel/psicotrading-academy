import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { quizService } from '@/lib/services/quiz.service';
import QuizRunner from '@/components/evaluacion/QuizRunner';
import { FiAward, FiInfo } from 'react-icons/fi';
import { Metadata } from 'next';

interface SlugEvaluationPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: SlugEvaluationPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const quiz = await quizService.getQuizBySlug(slug);
    if (quiz) {
      return {
        title: `${quiz.title} | Psicotrading Academy`,
        description: quiz.description || 'Participá en nuestras evaluaciones en vivo y descubrí tu nivel de ejecución en Psicotrading.',
      };
    }
  } catch (e) {}

  return {
    title: 'Evaluación Psicotrading | Psicotrading Academy',
    description: 'Participá en nuestras evaluaciones en vivo y descubrí tu nivel de ejecución en Psicotrading.',
  };
}

export default async function SlugEvaluationPage({ params }: SlugEvaluationPageProps) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  
  let quiz = null;
  try {
    quiz = await quizService.getQuizBySlug(slug);
  } catch (e) {}

  if (!quiz || quiz.questions.length === 0) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <FiAward className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Evaluación no encontrada</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              La evaluación solicitada no está disponible o ha sido desactivada.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300 text-xs font-medium">
            <FiInfo className="text-amber-400 w-4 h-4" />
            <span>Psicotrading Academy</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100">
      <QuizRunner quiz={quiz} isAuthenticated={!!session?.user} />
    </div>
  );
}

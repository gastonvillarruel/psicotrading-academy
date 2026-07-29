import React from 'react';
import { quizService } from '@/lib/services/quiz.service';
import QuizFormEditor from '@/components/admin/evaluaciones/QuizFormEditor';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Editar Evaluación | Panel de Administración',
};

interface EditPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEditQuizPage({ params }: EditPageProps) {
  const resolvedParams = await params;
  const quiz = await quizService.getQuizById(resolvedParams.id);

  if (!quiz) {
    notFound();
  }

  return (
    <QuizFormEditor
      initialQuiz={{
        id: quiz.id,
        title: quiz.title,
        slug: quiz.slug,
        description: quiz.description,
        coverImage: quiz.coverImage,
        status: quiz.status,
        isPublic: quiz.isPublic,
        publishedAt: quiz.publishedAt,
        closedAt: quiz.closedAt,
        customLevels: quiz.customLevels,
        youtubeLiveUrl: quiz.youtubeLiveUrl,
        questions: quiz.questions,
        attemptsCount: quiz._count?.attempts || 0
      }}
    />
  );
}

import React from 'react';
import { quizService } from '@/lib/services/quiz.service';
import AdminEvaluacionesClient from './AdminEvaluacionesClient';

export const metadata = {
  title: 'Evaluaciones | Panel de Administración',
};

export default async function AdminEvaluacionesPage() {
  const quizzes = await quizService.getAllQuizzesAdmin();

  return <AdminEvaluacionesClient initialQuizzes={quizzes} />;
}

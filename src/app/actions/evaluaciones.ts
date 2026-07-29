'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireAdminSession } from '@/lib/auth-helpers';
import { quizService } from '@/lib/services/quiz.service';
import { quizAttemptService } from '@/lib/services/quiz-attempt.service';
import { CreateQuizInput, UpdateQuizInput, CreateQuestionInput } from '@/lib/repositories/quiz.repository';
import { SubmitAnswerItem } from '@/lib/repositories/quiz-attempt.repository';
import { QuizStatus } from '@prisma/client';

export async function getActiveEvaluationAction() {
  try {
    return { success: true, quiz: await quizService.getAvailablePublicQuiz() };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al obtener la evaluación activa.' };
  }
}

export async function getEvaluationBySlugAction(slug: string) {
  try {
    return { success: true, quiz: await quizService.getQuizBySlug(slug) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Evaluación no encontrada.' };
  }
}

export async function startEvaluationAttemptAction(input: {
  quizId: string;
  guestToken?: string;
  name?: string;
  email?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referer?: string;
  source?: string;
  device?: string;
  browser?: string;
  country?: string;
  ip?: string;
  userAgent?: string;
}) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id || null;

    const attempt = await quizAttemptService.startAttempt({
      ...input,
      userId
    });

    return { success: true, attemptId: attempt.id };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al iniciar la evaluación.' };
  }
}

export async function completeEvaluationAttemptAction(input: {
  attemptId: string;
  answers: SubmitAnswerItem[];
  duration?: number;
}) {
  try {
    const result = await quizAttemptService.completeAttempt(
      input.attemptId,
      input.answers,
      input.duration
    );
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al procesar el intento.' };
  }
}

export async function getEvaluationResultAction(attemptId: string) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id || null;

    const result = await quizAttemptService.getAttemptResult(attemptId, userId);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al obtener los resultados.' };
  }
}

// ==========================
// ADMIN SERVER ACTIONS
// ==========================

export async function adminGetQuizzesAction() {
  try {
    await requireAdminSession();
    const quizzes = await quizService.getAllQuizzesAdmin();
    return { success: true, quizzes };
  } catch (error: any) {
    return { success: false, error: error.message || 'Acceso denegado.' };
  }
}

export async function adminGetQuizByIdAction(id: string) {
  try {
    await requireAdminSession();
    const quiz = await quizService.getQuizById(id);
    return { success: true, quiz };
  } catch (error: any) {
    return { success: false, error: error.message || 'Evaluación no encontrada.' };
  }
}

export async function adminCreateQuizAction(input: CreateQuizInput) {
  try {
    await requireAdminSession();
    const quiz = await quizService.createQuiz(input);
    return { success: true, quiz };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al crear la evaluación.' };
  }
}

export async function adminUpdateQuizAction(
  id: string,
  input: UpdateQuizInput,
  questions?: (CreateQuestionInput & { id?: string })[]
) {
  try {
    await requireAdminSession();
    const quiz = await quizService.updateQuiz(id, input, questions);
    return { success: true, quiz };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al actualizar la evaluación.' };
  }
}

export async function adminSetQuizStatusAction(id: string, status: QuizStatus) {
  try {
    await requireAdminSession();
    const quiz = await quizService.setQuizStatus(id, status);
    return { success: true, quiz };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al cambiar el estado.' };
  }
}

export async function adminDuplicateQuizAction(id: string) {
  try {
    await requireAdminSession();
    const quiz = await quizService.duplicateQuiz(id);
    return { success: true, quiz };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al duplicar la evaluación.' };
  }
}

export async function adminDeleteQuizAction(id: string) {
  try {
    await requireAdminSession();
    await quizService.deleteQuiz(id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al eliminar la evaluación.' };
  }
}

export async function adminGetQuizStatsAction(quizId: string) {
  try {
    await requireAdminSession();
    const stats = await quizAttemptService.getQuizStats(quizId);
    return { success: true, stats };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al cargar estadísticas.' };
  }
}

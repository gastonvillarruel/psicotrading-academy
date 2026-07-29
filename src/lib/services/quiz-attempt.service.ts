import { quizAttemptRepository, StartAttemptInput, SubmitAnswerItem } from '../repositories/quiz-attempt.repository';
import { quizRepository } from '../repositories/quiz.repository';

export interface DefaultLevelResult {
  minPercentage: number;
  maxPercentage: number;
  title: string;
}

export const DEFAULT_QUIZ_LEVELS: DefaultLevelResult[] = [
  { minPercentage: 0, maxPercentage: 40, title: 'Novato emocional' },
  { minPercentage: 41, maxPercentage: 70, title: 'Trader consciente' },
  { minPercentage: 71, maxPercentage: 90, title: 'PsicoTrader avanzado' },
  { minPercentage: 91, maxPercentage: 100, title: 'Maestro de la ejecución' }
];

export const quizAttemptService = {
  async startAttempt(input: StartAttemptInput) {
    const quiz = await quizRepository.findById(input.quizId);
    if (!quiz) throw new Error('Evaluación no encontrada');

    return quizAttemptRepository.startAttempt(input);
  },

  async completeAttempt(attemptId: string, answers: SubmitAnswerItem[], duration?: number) {
    const completedAttempt = await quizAttemptRepository.completeAttempt({
      attemptId,
      answers,
      duration
    });

    const level = this.calculateLevel(completedAttempt.percentage, completedAttempt.quiz.customLevels);

    return {
      attempt: completedAttempt,
      level
    };
  },

  async claimGuestAttempt(attemptId: string, userId: string) {
    return quizAttemptRepository.claimGuestAttempt(attemptId, userId);
  },

  async getAttemptResult(attemptId: string, userId?: string | null) {
    const attempt = await quizAttemptRepository.findById(attemptId);
    if (!attempt) throw new Error('Intento no encontrado');

    // If attempt was anonymous, claim it for this user
    if (userId && !attempt.userId) {
      await quizAttemptRepository.claimGuestAttempt(attemptId, userId);
      attempt.userId = userId;
    }

    const level = this.calculateLevel(attempt.percentage, attempt.quiz.customLevels);

    return {
      attempt,
      level
    };
  },

  async getQuizStats(quizId: string) {
    return quizAttemptRepository.getQuizStats(quizId);
  },

  calculateLevel(percentage: number, customLevelsJson: any): string {
    let levels: DefaultLevelResult[] = DEFAULT_QUIZ_LEVELS;

    if (customLevelsJson && Array.isArray(customLevelsJson) && customLevelsJson.length > 0) {
      levels = customLevelsJson;
    }

    const matched = levels.find(l => percentage >= l.minPercentage && percentage <= l.maxPercentage);
    if (matched) return matched.title;

    // Fallback based on ranges
    if (percentage <= 40) return 'Novato emocional';
    if (percentage <= 70) return 'Trader consciente';
    if (percentage <= 90) return 'PsicoTrader avanzado';
    return 'Maestro de la ejecución';
  }
};

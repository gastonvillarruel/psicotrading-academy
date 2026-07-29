import { quizRepository, CreateQuizInput, UpdateQuizInput, CreateQuestionInput } from '../repositories/quiz.repository';
import { QuizStatus } from '@prisma/client';

export const quizService = {
  async getAvailablePublicQuiz() {
    return quizRepository.findAvailablePublicQuiz();
  },

  async getQuizBySlug(slug: string) {
    const quiz = await quizRepository.findBySlug(slug);
    if (!quiz) throw new Error('Evaluación no encontrada');
    return quiz;
  },

  async getQuizById(id: string) {
    const quiz = await quizRepository.findById(id);
    if (!quiz) throw new Error('Evaluación no encontrada');
    return quiz;
  },

  async getAllQuizzesAdmin() {
    const list = await quizRepository.findAllAdmin();
    return list.map((q: any) => {
      const finishedAttempts = q.attempts.filter((a: any) => a.status === 'FINISHED');
      const totalParticipants = finishedAttempts.length;
      const averagePercentage = totalParticipants > 0
        ? finishedAttempts.reduce((acc: number, curr: any) => acc + curr.percentage, 0) / totalParticipants
        : 0;

      return {
        id: q.id,
        slug: q.slug,
        title: q.title,
        status: q.status,
        isPublic: q.isPublic,
        publishedAt: q.publishedAt,
        closedAt: q.closedAt,
        questionsCount: q.questions.length,
        totalParticipants,
        averagePercentage: Math.round(averagePercentage * 10) / 10,
        createdAt: q.createdAt
      };
    });
  },

  async createQuiz(input: CreateQuizInput) {
    // Generate slug if missing or normalize it
    const slug = input.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = await quizRepository.findBySlug(slug);
    if (existing) {
      throw new Error(`El slug "${slug}" ya está en uso. Elige un slug diferente.`);
    }

    return quizRepository.create({
      ...input,
      slug
    });
  },

  async updateQuiz(id: string, input: UpdateQuizInput, questions?: (CreateQuestionInput & { id?: string })[]) {
    const current = await quizRepository.findById(id);
    if (!current) throw new Error('Evaluación no encontrada');

    // If quiz has completed attempts and questions are modified, duplicate to a new version for immutability!
    const finishedAttemptsCount = current._count.attempts;
    if (finishedAttemptsCount > 0 && questions && questions.length > 0) {
      // Auto-duplicate / versioning to preserve history
      const duplicated = await quizRepository.duplicate(id);
      await quizRepository.update(duplicated.id, input);
      return quizRepository.updateQuestions(duplicated.id, questions);
    }

    // Otherwise standard update
    if (input.slug && input.slug !== current.slug) {
      const slug = input.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const existing = await quizRepository.findBySlug(slug);
      if (existing && existing.id !== id) {
        throw new Error(`El slug "${slug}" ya está en uso.`);
      }
      input.slug = slug;
    }

    await quizRepository.update(id, input);
    if (questions) {
      return quizRepository.updateQuestions(id, questions);
    }
    return quizRepository.findById(id);
  },

  async setQuizStatus(id: string, status: QuizStatus) {
    return quizRepository.update(id, {
      status,
      publishedAt: status === 'PUBLISHED' ? new Date() : undefined
    });
  },

  async duplicateQuiz(id: string) {
    return quizRepository.duplicate(id);
  },

  async deleteQuiz(id: string) {
    return quizRepository.delete(id);
  }
};

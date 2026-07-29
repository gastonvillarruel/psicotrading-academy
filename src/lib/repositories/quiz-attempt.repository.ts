import { db as prisma } from '@/lib/db';
import { QuizAttemptStatus, Prisma } from '@prisma/client';

export interface StartAttemptInput {
  quizId: string;
  userId?: string | null;
  guestToken?: string | null;
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
}

export interface SubmitAnswerItem {
  questionId: string;
  selectedOptionId?: string | null;
}

export interface CompleteAttemptInput {
  attemptId: string;
  answers: SubmitAnswerItem[];
  duration?: number;
}

export const quizAttemptRepository = {
  async startAttempt(input: StartAttemptInput) {
    return prisma.quizAttempt.create({
      data: {
        quizId: input.quizId,
        userId: input.userId || null,
        guestToken: input.guestToken || null,
        name: input.name,
        email: input.email,
        status: 'STARTED',
        startedAt: new Date(),
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        referer: input.referer,
        source: input.source,
        device: input.device,
        browser: input.browser,
        country: input.country,
        ip: input.ip,
        userAgent: input.userAgent
      }
    });
  },

  async completeAttempt(input: CompleteAttemptInput) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: input.attemptId },
      include: {
        quiz: {
          include: {
            questions: {
              orderBy: { sortOrder: 'asc' },
              include: {
                question: {
                  include: { options: { orderBy: { sortOrder: 'asc' } } }
                }
              }
            }
          }
        }
      }
    });

    if (!attempt) throw new Error('Intento no encontrado');

    // Calculate score & snapshot answers
    let score = 0;
    const maxScore = attempt.quiz.questions.length;
    const answerRecords: Prisma.QuizAttemptAnswerCreateManyInput[] = [];

    for (const item of attempt.quiz.questions) {
      const q = item.question;
      const userAns = input.answers.find(a => a.questionId === q.id);
      const selectedOption = userAns?.selectedOptionId
        ? q.options.find((o: any) => o.id === userAns.selectedOptionId)
        : null;
      const correctOption = q.options.find((o: any) => o.isCorrect);

      const isCorrect = selectedOption?.isCorrect ?? false;
      if (isCorrect) score += 1;

      answerRecords.push({
        attemptId: attempt.id,
        questionId: q.id,
        selectedOptionId: selectedOption?.id || null,
        isCorrect,
        questionTextSnapshot: q.text,
        selectedOptionTextSnapshot: selectedOption?.text || null,
        correctOptionTextSnapshot: correctOption?.text || null,
        explanationSnapshot: q.explanation || null
      });
    }

    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
    const finishedAt = new Date();

    return prisma.$transaction(async (tx: any) => {
      await tx.quizAttemptAnswer.deleteMany({
        where: { attemptId: attempt.id }
      });

      await tx.quizAttemptAnswer.createMany({
        data: answerRecords
      });

      const updatedAttempt = await tx.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FINISHED',
          score,
          maxScore,
          percentage,
          finishedAt,
          duration: input.duration || Math.round((finishedAt.getTime() - attempt.startedAt.getTime()) / 1000)
        },
        include: {
          quiz: {
            include: {
              questions: {
                orderBy: { sortOrder: 'asc' }
              }
            }
          },
          answers: {
            include: {
              question: true,
              selectedOption: true
            }
          }
        }
      });

      const questionOrderMap = new Map<string, number>();
      updatedAttempt.quiz.questions.forEach((item: any) => {
        questionOrderMap.set(item.questionId, item.sortOrder);
      });

      updatedAttempt.answers.sort((a: any, b: any) => {
        const orderA = questionOrderMap.get(a.questionId) ?? 0;
        const orderB = questionOrderMap.get(b.questionId) ?? 0;
        return orderA - orderB;
      });

      return updatedAttempt;
    });
  },

  async claimGuestAttempt(attemptId: string, userId: string) {
    return prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { userId }
    });
  },

  async findById(id: string) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id },
      include: {
        quiz: {
          include: {
            questions: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        },
        user: {
          select: { id: true, name: true, email: true, image: true }
        },
        answers: true
      }
    });

    if (!attempt) return null;

    // Sort answers to match quiz.questions sortOrder
    const questionOrderMap = new Map<string, number>();
    attempt.quiz.questions.forEach(item => {
      questionOrderMap.set(item.questionId, item.sortOrder);
    });

    attempt.answers.sort((a, b) => {
      const orderA = questionOrderMap.get(a.questionId) ?? 0;
      const orderB = questionOrderMap.get(b.questionId) ?? 0;
      return orderA - orderB;
    });

    return attempt;
  },

  async findByGuestToken(guestToken: string) {
    return prisma.quizAttempt.findFirst({
      where: { guestToken },
      orderBy: { createdAt: 'desc' },
      include: {
        quiz: true,
        answers: true
      }
    });
  },

  async getQuizStats(quizId: string) {
    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId, status: 'FINISHED' },
      include: {
        answers: true
      }
    });

    const totalStarted = await prisma.quizAttempt.count({
      where: { quizId }
    });

    const totalFinished = attempts.length;
    const abandonmentRate = totalStarted > 0 ? ((totalStarted - totalFinished) / totalStarted) * 100 : 0;

    let totalPercentageSum = 0;
    let totalDurationSum = 0;
    const questionStatsMap: Record<string, { total: number; correct: number; text: string }> = {};

    for (const att of attempts) {
      totalPercentageSum += att.percentage;
      totalDurationSum += (att.duration || 0);

      for (const ans of att.answers) {
        if (!questionStatsMap[ans.questionId]) {
          questionStatsMap[ans.questionId] = {
            total: 0,
            correct: 0,
            text: ans.questionTextSnapshot
          };
        }
        questionStatsMap[ans.questionId].total += 1;
        if (ans.isCorrect) {
          questionStatsMap[ans.questionId].correct += 1;
        }
      }
    }

    const averagePercentage = totalFinished > 0 ? totalPercentageSum / totalFinished : 0;
    const averageDuration = totalFinished > 0 ? totalDurationSum / totalFinished : 0;

    // Determine question accuracy rates
    const questionBreakdown = Object.entries(questionStatsMap).map(([questionId, data]) => {
      const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
      return {
        questionId,
        text: data.text,
        totalAnswers: data.total,
        correctAnswers: data.correct,
        accuracyPercentage: Math.round(accuracy * 10) / 10
      };
    });

    // Sort by most failed (lowest accuracy)
    const sortedByFailure = [...questionBreakdown].sort((a, b) => a.accuracyPercentage - b.accuracyPercentage);
    const mostFailedQuestion = sortedByFailure.length > 0 ? sortedByFailure[0] : null;

    return {
      totalStarted,
      totalFinished,
      abandonmentRate: Math.round(abandonmentRate * 10) / 10,
      averagePercentage: Math.round(averagePercentage * 10) / 10,
      averageDuration: Math.round(averageDuration),
      mostFailedQuestion,
      questionBreakdown
    };
  }
};

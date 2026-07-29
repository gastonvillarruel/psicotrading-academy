import { db as prisma } from '@/lib/db';
import { QuizStatus, QuestionType, Prisma } from '@prisma/client';

export interface CreateQuestionInput {
  text: string;
  type?: QuestionType;
  category?: string;
  explanation?: string;
  explanationLink?: string;
  explanationVideo?: string;
  explanationResources?: any;
  options: {
    text: string;
    isCorrect: boolean;
    sortOrder?: number;
    imageUrl?: string;
  }[];
}

export interface CreateQuizInput {
  title: string;
  slug: string;
  description?: string;
  coverImage?: string;
  status?: QuizStatus;
  isPublic?: boolean;
  publishedAt?: Date | null;
  closedAt?: Date | null;
  customLevels?: any;
  youtubeLiveUrl?: string | null;
  questions?: CreateQuestionInput[];
}

export interface UpdateQuizInput {
  title?: string;
  slug?: string;
  description?: string;
  coverImage?: string;
  status?: QuizStatus;
  isPublic?: boolean;
  publishedAt?: Date | null;
  closedAt?: Date | null;
  customLevels?: any;
  youtubeLiveUrl?: string | null;
}

export const quizRepository = {
  async findAvailablePublicQuiz() {
    const now = new Date();
    return prisma.quiz.findFirst({
      where: {
        status: 'PUBLISHED',
        isPublic: true,
        OR: [
          { publishedAt: null },
          { publishedAt: { lte: now } }
        ],
        AND: [
          {
            OR: [
              { closedAt: null },
              { closedAt: { gt: now } }
            ]
          }
        ]
      },
      orderBy: {
        publishedAt: 'desc'
      },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            question: {
              include: {
                options: {
                  orderBy: { sortOrder: 'asc' }
                }
              }
            }
          }
        }
      }
    });
  },

  async findBySlug(slug: string) {
    return prisma.quiz.findUnique({
      where: { slug },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            question: {
              include: {
                options: {
                  orderBy: { sortOrder: 'asc' }
                }
              }
            }
          }
        }
      }
    });
  },

  async findById(id: string) {
    return prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            question: {
              include: {
                options: {
                  orderBy: { sortOrder: 'asc' }
                }
              }
            }
          }
        },
        _count: {
          select: { attempts: true }
        }
      }
    });
  },

  async findAllAdmin() {
    return prisma.quiz.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        questions: true,
        attempts: {
          select: {
            score: true,
            maxScore: true,
            percentage: true,
            status: true
          }
        }
      }
    });
  },

  async create(data: CreateQuizInput) {
    return prisma.quiz.create({
      data: {
        title: data.title,
        slug: data.slug,
        description: data.description,
        coverImage: data.coverImage,
        status: data.status || 'DRAFT',
        isPublic: data.isPublic ?? true,
        publishedAt: data.publishedAt,
        closedAt: data.closedAt,
        customLevels: data.customLevels ?? Prisma.DbNull,
        youtubeLiveUrl: data.youtubeLiveUrl,
        questions: data.questions
          ? {
              create: data.questions.map((q, idx) => ({
                sortOrder: idx,
                points: 1,
                question: {
                  create: {
                    text: q.text,
                    type: q.type || 'MULTIPLE_CHOICE',
                    category: q.category,
                    explanation: q.explanation,
                    explanationLink: q.explanationLink,
                    explanationVideo: q.explanationVideo,
                    explanationResources: q.explanationResources ?? Prisma.DbNull,
                    options: {
                      create: q.options.map((opt, oIdx) => ({
                        text: opt.text,
                        isCorrect: opt.isCorrect,
                        sortOrder: opt.sortOrder ?? oIdx,
                        imageUrl: opt.imageUrl
                      }))
                    }
                  }
                }
              }))
            }
          : undefined
      },
      include: {
        questions: {
          include: {
            question: {
              include: { options: true }
            }
          }
        }
      }
    });
  },

  async update(id: string, data: UpdateQuizInput) {
    return prisma.quiz.update({
      where: { id },
      data: {
        ...data,
        customLevels: data.customLevels !== undefined ? (data.customLevels ?? Prisma.DbNull) : undefined
      }
    });
  },

  async updateQuestions(
    quizId: string,
    questionsInput: (CreateQuestionInput & { id?: string })[]
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.quizQuestionItem.deleteMany({
        where: { quizId }
      });

      for (let i = 0; i < questionsInput.length; i++) {
        const q = questionsInput[i];
        let questionId = q.id;

        if (!questionId) {
          const createdQ = await tx.question.create({
            data: {
              text: q.text,
              type: q.type || 'MULTIPLE_CHOICE',
              category: q.category,
              explanation: q.explanation,
              explanationLink: q.explanationLink,
              explanationVideo: q.explanationVideo,
              explanationResources: q.explanationResources ?? Prisma.DbNull,
              options: {
                create: q.options.map((opt, oIdx) => ({
                  text: opt.text,
                  isCorrect: opt.isCorrect,
                  sortOrder: opt.sortOrder ?? oIdx,
                  imageUrl: opt.imageUrl
                }))
              }
            }
          });
          questionId = createdQ.id;
        } else {
          await tx.question.update({
            where: { id: questionId },
            data: {
              text: q.text,
              type: q.type || 'MULTIPLE_CHOICE',
              category: q.category,
              explanation: q.explanation,
              explanationLink: q.explanationLink,
              explanationVideo: q.explanationVideo,
              explanationResources: q.explanationResources ?? Prisma.DbNull,
              options: {
                deleteMany: {},
                create: q.options.map((opt, oIdx) => ({
                  text: opt.text,
                  isCorrect: opt.isCorrect,
                  sortOrder: opt.sortOrder ?? oIdx,
                  imageUrl: opt.imageUrl
                }))
              }
            }
          });
        }

        await tx.quizQuestionItem.create({
          data: {
            quizId,
            questionId,
            sortOrder: i,
            points: 1
          }
        });
      }

      return tx.quiz.findUnique({
        where: { id: quizId },
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
      });
    });
  },

  async duplicate(quizId: string) {
    const original = await this.findById(quizId);
    if (!original) throw new Error('Evaluación no encontrada');

    const newSlug = `${original.slug}-copia-${Date.now()}`;
    const newTitle = `${original.title} (Copia)`;

    return prisma.quiz.create({
      data: {
        title: newTitle,
        slug: newSlug,
        description: original.description,
        coverImage: original.coverImage,
        status: 'DRAFT',
        isPublic: original.isPublic,
        customLevels: original.customLevels ?? Prisma.DbNull,
        youtubeLiveUrl: original.youtubeLiveUrl,
        version: original.version + 1,
        parentQuizId: original.id,
        questions: {
          create: original.questions.map((item: any, idx: number) => ({
            sortOrder: idx,
            points: item.points,
            question: {
              create: {
                text: item.question.text,
                type: item.question.type,
                category: item.question.category,
                explanation: item.question.explanation,
                explanationLink: item.question.explanationLink,
                explanationVideo: item.question.explanationVideo,
                explanationResources: item.question.explanationResources ?? Prisma.DbNull,
                options: {
                  create: item.question.options.map((opt: any, oIdx: number) => ({
                    text: opt.text,
                    isCorrect: opt.isCorrect,
                    sortOrder: opt.sortOrder ?? oIdx,
                    imageUrl: opt.imageUrl
                  }))
                }
              }
            }
          }))
        }
      }
    });
  },

  async delete(quizId: string) {
    return prisma.$transaction(async (tx) => {
      // Clear parentQuizId references pointing to this quiz
      await tx.quiz.updateMany({
        where: { parentQuizId: quizId },
        data: { parentQuizId: null }
      });

      // Delete quiz (cascades QuizQuestionItem and QuizAttempt)
      return tx.quiz.delete({
        where: { id: quizId }
      });
    });
  }
};

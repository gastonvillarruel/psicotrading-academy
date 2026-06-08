import { Course, Module, Lesson, LessonProgress, Certificate, LessonType } from '@prisma/client';

export type LessonStatus = 'locked' | 'available' | 'completed';

export interface CourseResource {
  title: string;
  url: string;
  description?: string;
}

export interface LessonWithStatus extends Omit<Lesson, 'unlockMinutesBefore'> {
  status: LessonStatus;
  progress?: LessonProgress | null;
  unlockMinutesBefore: number;
  signedVideoUrl?: string | null;
}

export interface ModuleWithProgress extends Module {
  lessons: LessonWithStatus[];
  totalLessons: number;
  completedLessons: number;
  percent: number;
  isUnlocked: boolean;
}

export interface CourseWithProgress extends Course {
  modules: ModuleWithProgress[];
  totalLessons: number;
  completedLessons: number;
  percent: number;
  certificate?: Certificate | null;
  legacyMode: boolean;
}

export interface CampusAccessResult {
  hasAccess: boolean;
  reason?: string;
}

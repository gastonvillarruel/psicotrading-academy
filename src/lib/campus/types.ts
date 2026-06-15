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
  // Datos resueltos de la sesión en vivo según comisión del alumno (null = sin sesión cargada)
  resolvedLiveSession?: {
    startDateTime: string;
    endDateTime?: string | null;
    liveUrl?: string | null;
    recordingUrl?: string | null;
    scheduleOptionName: string;
  } | null;
}

export interface ModuleWithProgress extends Module {
  lessons: LessonWithStatus[];
  totalLessons: number;
  completedLessons: number;
  percent: number;
  isUnlocked: boolean;
}

export interface CampusSettings {
  title?: string;
  subtitle?: string;
  welcomeText?: string;
  currentLessonLabel?: string;
  modulesLabel?: string;
  motivationalQuote?: string;
}

export interface CampusChecklistItem {
  id: string;
  text: string;
  order: number;
  enabled: boolean;
}

export interface CampusMaterialItem {
  id: string;
  title: string;
  type: 'PDF' | 'Excel' | 'Notion' | 'Link' | 'Otro';
  url: string;
  description?: string;
  lessonId?: string | null;
  order: number;
  enabled: boolean;
}

export interface CourseWithProgress extends Omit<Course, 'campusSettings' | 'campusChecklist' | 'campusMaterials'> {
  modules: ModuleWithProgress[];
  totalLessons: number;
  completedLessons: number;
  percent: number;
  certificate?: Certificate | null;
  legacyMode: boolean;
  studentScheduleOptionId?: string | null;
  studentScheduleOptionName?: string | null;
  campusSettings?: CampusSettings | null;
  campusChecklist?: CampusChecklistItem[] | null;
  campusMaterials?: CampusMaterialItem[] | null;
}

export interface CampusAccessResult {
  hasAccess: boolean;
  reason?: string;
}

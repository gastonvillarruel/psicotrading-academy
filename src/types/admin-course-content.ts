import { LessonType, UnlockMode, VideoProvider } from '@prisma/client';

export interface AdminLessonContent {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  type: LessonType;
  videoProvider: VideoProvider;
  videoId: string | null;
  videoUrl: string | null;
  liveUrl: string | null;
  recordingUrl: string | null;
  scheduledAt: string | null;
  unlockMinutesBefore: number | null;
  durationMinutes: number | null;
  videoDurationSecs: number | null;
  sortOrder: number;
  isFree: boolean;
  isPublished: boolean;
  hasProgress: boolean;
  progressCount: number;
}

export interface AdminModuleContent {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  requiredPrevious: boolean;
  hasProgress: boolean;
  lessonCount: number;
  publishedLessonCount: number;
  lessons: AdminLessonContent[];
}

export interface AdminCourseCampusContent {
  courseId: string;
  courseSlug: string;
  unlockMode: UnlockMode;
  campusContentLocked: boolean;
  moduleCount: number;
  lessonCount: number;
  publishedLessonCount: number;
  modules: AdminModuleContent[];
}

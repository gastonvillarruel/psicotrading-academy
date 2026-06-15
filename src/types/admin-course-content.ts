import { LessonType, UnlockMode, VideoProvider } from '@prisma/client';
import { CampusSettings, CampusChecklistItem, CampusMaterialItem } from '@/lib/campus/types';

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
  liveSessions?: AdminLiveSession[];
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

export interface AdminScheduleOption {
  id: string;
  courseId: string;
  name: string;
  description: string | null;
  timezone: string | null;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  _count: {
    enrollments: number;
  };
}

export interface AdminLiveSession {
  id: string;
  lessonId: string;
  scheduleOptionId: string;
  scheduleOptionName: string;
  startDateTime: string;
  endDateTime: string | null;
  liveUrl: string | null;
  recordingUrl: string | null;
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
  scheduleOptions: AdminScheduleOption[];
  campusSettings?: CampusSettings | null;
  campusChecklist?: CampusChecklistItem[] | null;
  campusMaterials?: CampusMaterialItem[] | null;
}

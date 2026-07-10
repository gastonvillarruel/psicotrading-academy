import React from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import EditCourseForm from '@/components/EditCourseForm';
import type { AdminCourseCampusContent } from '@/types/admin-course-content';
import { getCourseEnrollmentsData } from '@/app/actions/admin-enrollments';

interface EditCoursePageProps {
  params: Promise<{ id: string }>;
}

async function getCourseById(id: string) {
  try {
    return await db.course.findUnique({
      where: { id },
      include: {
        startDates: {
          orderBy: { startDate: 'asc' },
        },
        scheduleOptions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: {
              select: { enrollments: true },
            },
          },
        },
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' },
              include: {
                _count: {
                  select: {
                    progress: true,
                  },
                },
                liveSessions: {
                  include: {
                    scheduleOption: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  } catch (error) {
    console.error('Error al obtener curso por ID:', error);
    return null;
  }
}

function serializeCampusContent(course: NonNullable<Awaited<ReturnType<typeof getCourseById>>>): AdminCourseCampusContent {
  const modules = course.modules.map((module) => {
    const lessons = module.lessons.map((lesson) => ({
      id: lesson.id,
      moduleId: lesson.moduleId,
      title: lesson.title,
      description: lesson.description,
      type: lesson.type,
      videoProvider: lesson.videoProvider,
      videoId: lesson.videoId,
      videoUrl: lesson.videoUrl,
      liveUrl: lesson.liveUrl,
      recordingUrl: lesson.recordingUrl,
      scheduledAt: lesson.scheduledAt ? lesson.scheduledAt.toISOString() : null,
      unlockMinutesBefore: lesson.unlockMinutesBefore,
      durationMinutes: lesson.durationMinutes,
      videoDurationSecs: lesson.videoDurationSecs,
      sortOrder: lesson.sortOrder,
      isFree: lesson.isFree,
      isPublished: lesson.isPublished,
      hasProgress: lesson._count.progress > 0,
      progressCount: lesson._count.progress,
      liveSessions: (lesson as any).liveSessions?.map((session: any) => ({
        id: session.id,
        lessonId: session.lessonId,
        scheduleOptionId: session.scheduleOptionId,
        scheduleOptionName: session.scheduleOption?.name || '',
        startDateTime: session.startDateTime.toISOString(),
        endDateTime: session.endDateTime ? session.endDateTime.toISOString() : null,
        liveUrl: session.liveUrl,
        recordingUrl: session.recordingUrl,
      })) ?? [],
    }));

    return {
      id: module.id,
      courseId: module.courseId,
      title: module.title,
      description: module.description,
      sortOrder: module.sortOrder,
      requiredPrevious: module.requiredPrevious,
      hasProgress: lessons.some((lesson) => lesson.hasProgress),
      lessonCount: lessons.length,
      publishedLessonCount: lessons.filter((lesson) => lesson.isPublished).length,
      lessons,
    };
  });

  const scheduleOptions = course.scheduleOptions.map((opt) => ({
    id: opt.id,
    courseId: opt.courseId,
    name: opt.name,
    description: opt.description,
    timezone: opt.timezone,
    capacity: opt.capacity,
    sortOrder: opt.sortOrder,
    isActive: opt.isActive,
    _count: { enrollments: opt._count.enrollments },
  }));

  return {
    courseId: course.id,
    courseSlug: course.slug,
    unlockMode: course.unlockMode,
    campusContentLocked: course.campusContentLocked,
    moduleCount: modules.length,
    lessonCount: modules.reduce((acc, module) => acc + module.lessons.length, 0),
    publishedLessonCount: modules.reduce(
      (acc, module) => acc + module.lessons.filter((lesson) => lesson.isPublished).length,
      0
    ),
    modules,
    scheduleOptions,
    campusSettings: course.campusSettings ? (course.campusSettings as any) : null,
    campusChecklist: course.campusChecklist ? (course.campusChecklist as any) : null,
    campusMaterials: course.campusMaterials ? (course.campusMaterials as any) : null,
  };
}

export default async function AdminEditCoursePage({ params }: EditCoursePageProps) {
  const resolvedParams = await params;
  const course = await getCourseById(resolvedParams.id);

  if (!course) {
    notFound();
  }

  // Serializar campos Decimal para evitar errores de transmisión a componentes cliente
  const serializedCourse = {
    ...course,
    priceUSDT: course.priceUSDT ? Number(course.priceUSDT) : null,
    originalPriceUSDT: course.originalPriceUSDT ? Number(course.originalPriceUSDT) : null,
  };

  const initialCampusContent = serializeCampusContent(course);

  // Obtener inscripciones de alumnos en el servidor
  const enrollmentsRes = await getCourseEnrollmentsData(resolvedParams.id);
  const courseEnrollments = enrollmentsRes.success ? enrollmentsRes.enrollments : [];

  // Calcular estadísticas en el servidor
  const activeCount = courseEnrollments.filter((e: any) => e.status === 'ACTIVE').length;
  const revokedCount = courseEnrollments.filter((e: any) => e.status === 'REVOKED').length;

  const enrollmentsStats = {
    total: courseEnrollments.length,
    active: activeCount,
    revoked: revokedCount,
    commissionsCount: course.scheduleOptions.filter((opt) => opt.isActive).length,
  };

  // Convertir las opciones de comisión para la lista de comisiones
  const serializedScheduleOptions = course.scheduleOptions.map((opt) => ({
    id: opt.id,
    name: opt.name,
    description: opt.description,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/courses" className="text-teal-600 hover:text-teal-700 text-sm font-semibold flex items-center space-x-1">
          <span>← Volver a cursos</span>
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mt-3">Editar Curso</h1>
        <p className="text-gray-500 mt-1">Modificá los detalles del curso: {course.title}</p>
      </div>

      <EditCourseForm
        course={serializedCourse}
        initialCampusContent={initialCampusContent}
        enrollments={courseEnrollments}
        enrollmentsStats={enrollmentsStats}
      />
    </div>
  );
}

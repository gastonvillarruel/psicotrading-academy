import React from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import EditCourseForm from '@/components/EditCourseForm';
import type { AdminCourseCampusContent } from '@/types/admin-course-content';
import { applyGlobalCampusVirtual } from '@/lib/globalCampusVirtual';

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
    descriptionSections: applyGlobalCampusVirtual(course.descriptionSections),
  };

  const initialCampusContent = serializeCampusContent(course);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/admin/courses" className="text-teal-600 hover:text-teal-700 text-sm font-semibold flex items-center space-x-1">
          <span>← Volver a cursos</span>
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mt-3">Editar Curso</h1>
        <p className="text-gray-500 mt-1">Modificá los detalles del curso: {course.title}</p>
      </div>

      <EditCourseForm course={serializedCourse} initialCampusContent={initialCampusContent} />
    </div>
  );
}

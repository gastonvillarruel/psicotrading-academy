import React from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { verifyWorkshopAccessOnServer } from '@/app/actions/workshop-enrollment';
import WorkshopThankYouClient from '@/components/workshop/WorkshopThankYouClient';
import { formatCourseStartDate } from '@/lib/courseStartDates';

interface GraciasPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ justEnrolled?: string }>;
}

export async function generateMetadata({ params }: GraciasPageProps): Promise<Metadata> {
  const { slug } = await params;
  const course = await db.course.findUnique({
    where: { slug },
    select: { title: true },
  });

  return {
    title: course ? `¡Inscripción Confirmada! | ${course.title}` : 'Inscripción Confirmada',
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function WorkshopGraciasPage({ params, searchParams }: GraciasPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const justEnrolled = resolvedSearchParams.justEnrolled === '1' || resolvedSearchParams.justEnrolled === 'true';

  const course = await db.course.findUnique({
    where: { slug },
    include: {
      startDates: {
        where: { isActive: true },
        orderBy: { startDate: 'asc' },
      },
    },
  });

  if (!course) {
    notFound();
  }

  // 1. VALIDACIÓN ESTRICTA EN EL SERVIDOR
  // Un visitante casual o no inscripto no puede ver esta página ni acceder al enlace privado de WhatsApp
  const access = await verifyWorkshopAccessOnServer(course.id);

  if (!access.isEnrolled) {
    redirect(`/campus/${course.slug}`);
  }

  // 2. Resolver enlace del grupo de WhatsApp
  let whatsappUrl = course.whatsappGroupUrl;

  // Fallback si no está en columna directa pero existe en campusMaterials
  if (!whatsappUrl && course.campusMaterials && Array.isArray(course.campusMaterials)) {
    const mat = (course.campusMaterials as any[]).find(
      (m) => m.enabled !== false && (m.title?.toLowerCase().includes('whatsapp') || m.url?.includes('whatsapp.com'))
    );
    if (mat?.url) {
      whatsappUrl = mat.url;
    }
  }

  // Fallback seguro a soporte si ningún grupo estuviera cargado
  if (!whatsappUrl) {
    whatsappUrl = 'https://api.whatsapp.com/send?phone=5491176632244&text=Hola,%20ya%20estoy%20inscripto%20en%20el%20taller%20' + encodeURIComponent(course.title);
  }

  // 3. Formatear fechas y horarios
  let scheduledDateLabel: string | undefined;
  let scheduledTimeLabel: string | undefined;

  if (course.startDates && course.startDates.length > 0) {
    const firstDate = course.startDates[0];
    scheduledDateLabel = formatCourseStartDate(firstDate.startDate);
    if (firstDate.startTime) {
      scheduledTimeLabel = `${firstDate.startTime} hs (Argentina)`;
    }
  } else if (course.scheduledAt) {
    scheduledDateLabel = formatCourseStartDate(course.scheduledAt);
    const d = new Date(course.scheduledAt);
    scheduledTimeLabel = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} hs (Argentina)`;
  }

  // Modalidad: si el tipo es LIVE -> En vivo por Zoom
  const modalityLabel = course.type === 'LIVE' ? 'En vivo por Zoom' : 'Entrenamiento en Video y Campus';

  return (
    <main className="min-h-screen bg-brand-bg flex items-center justify-center py-10 transition-colors duration-200">
      <WorkshopThankYouClient
        courseId={course.id}
        courseTitle={course.title}
        whatsappUrl={whatsappUrl}
        justEnrolled={justEnrolled}
        scheduledDateLabel={scheduledDateLabel}
        scheduledTimeLabel={scheduledTimeLabel}
        modalityLabel={modalityLabel}
        instructorName={course.instructorName || undefined}
      />
    </main>
  );
}

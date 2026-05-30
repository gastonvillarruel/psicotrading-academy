import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import CourseLandingSections from '@/components/CourseLandingSections';

interface CoursePageProps {
  params: Promise<{ slug: string }>;
}

async function getCourseBySlug(slug: string) {
  try {
    return await db.course.findUnique({
      where: { slug },
      include: {
        startDates: {
          orderBy: { startDate: 'asc' },
        },
      },
    });
  } catch (error) {
    console.error('Error al obtener curso por slug:', error);
    return null;
  }
}

export default async function CourseDetailPage({ params }: CoursePageProps) {
  const resolvedParams = await params;
  const course = await getCourseBySlug(resolvedParams.slug);

  if (!course) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session;

  // URLs de Checkout dinámicas según autenticación
  const checkoutCourseUrl = isAuthenticated
    ? `/checkout?courseId=${course.id}`
    : `/login?callbackUrl=/campus/${course.slug}`;

  const checkoutMonthlyUrl = isAuthenticated
    ? `/checkout?plan=MONTHLY`
    : `/login?callbackUrl=/campus/${course.slug}`;

  const checkoutAnnualUrl = isAuthenticated
    ? `/checkout?plan=ANNUAL`
    : `/login?callbackUrl=/campus/${course.slug}`;

  return (
    <main className="min-h-screen bg-brand-bg py-12 transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Volver */}
        <div className="mb-6">
          <Link href="/campus" className="text-brand-secondary hover:text-brand-primary text-sm font-semibold flex items-center space-x-1 transition-colors">
            <span>← Volver al catálogo</span>
          </Link>
        </div>

        <CourseLandingSections
          course={course as any}
          isAuthenticated={isAuthenticated}
          checkoutCourseUrl={checkoutCourseUrl}
          checkoutMonthlyUrl={checkoutMonthlyUrl}
          checkoutAnnualUrl={checkoutAnnualUrl}
        />
      </div>
    </main>
  );
}

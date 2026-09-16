import React from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
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
          include: {
            scheduleOption: true,
          },
        },
      },
    });
  } catch (error) {
    console.error('Error al obtener curso por slug:', error);
    return null;
  }
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const course = await getCourseBySlug(resolvedParams.slug);

  if (!course) {
    return {
      title: 'Curso no encontrado | Psicoemotrading',
    };
  }

  const title = `${course.title} | Psicoemotrading`;
  const description =
    course.shortDescription ||
    'Entrenamiento mental y emocional para traders enfocado en disciplina, método y consistencia.';
  const canonicalUrl = `https://www.psicoemotrading.com/campus/${course.slug}`;
  const imageUrl = course.thumbnail
    ? (course.thumbnail.startsWith('http')
      ? course.thumbnail
      : `https://www.psicoemotrading.com${course.thumbnail}`)
    : 'https://www.psicoemotrading.com/og-image.jpg';

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Psicoemotrading',
      type: 'website',
      images: [
        {
          url: imageUrl,
          alt: course.title,
        },
      ],
      locale: 'es_AR',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function CourseDetailPage({ params }: CoursePageProps) {
  const resolvedParams = await params;
  const course = await getCourseBySlug(resolvedParams.slug);

  if (!course) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === 'ADMIN';
  const isAvailable = course.available !== false;

  if (!isAvailable && !isAdmin) {
    redirect('/');
  }

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

  // Serializar campos Decimal para evitar errores de pasaje a Client Components
  const serializedCourse = {
    ...course,
    priceUSDT: course.priceUSDT ? Number(course.priceUSDT) : null,
    originalPriceUSDT: course.originalPriceUSDT ? Number(course.originalPriceUSDT) : null,
  };

  const courseSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.shortDescription || course.longDescription || course.title,
    provider: {
      "@type": "Organization",
      name: "Psicoemotrading",
      sameAs: "https://www.psicoemotrading.com/",
    },
    url: `https://www.psicoemotrading.com/campus/${course.slug}`,
    image: course.thumbnail
      ? (course.thumbnail.startsWith('http') ? course.thumbnail : `https://www.psicoemotrading.com${course.thumbnail}`)
      : 'https://www.psicoemotrading.com/og-image.jpg',
    offers: {
      "@type": "Offer",
      category: "Paid",
      priceCurrency: "USD",
      price: course.priceUSD ? Number(course.priceUSD) : (course.price || 0),
      availability: isAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `https://www.psicoemotrading.com/campus/${course.slug}`,
    },
  };

  return (
    <main className="min-h-screen bg-brand-bg py-5 transition-all duration-200">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(courseSchema),
        }}
      />
      {/* Volver */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-5">
        <Link href="/" className="text-brand-secondary hover:text-brand-primary text-sm font-semibold flex items-center space-x-1 transition-colors">
          <span>← Volver al catálogo</span>
        </Link>
      </div>

      <CourseLandingSections
        course={serializedCourse as any}
        isAuthenticated={isAuthenticated}
        checkoutCourseUrl={checkoutCourseUrl}
        checkoutMonthlyUrl={checkoutMonthlyUrl}
        checkoutAnnualUrl={checkoutAnnualUrl}
      />
    </main>
  );
}

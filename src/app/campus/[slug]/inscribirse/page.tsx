import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureActiveEnrollment } from '@/lib/campus/access';

interface InscribirsePageProps {
  params: Promise<{ slug: string }>;
}

export default async function WorkshopInscribirsePage({ params }: InscribirsePageProps) {
  const { slug } = await params;

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/campus/${slug}/inscribirse`)}`);
  }

  const course = await db.course.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      available: true,
    },
  });

  if (!course || course.available === false) {
    notFound();
  }

  // Garantizar inscripción sin duplicados
  await ensureActiveEnrollment({
    userId: session.user.id,
    courseId: course.id,
  });

  redirect(`/campus/${course.slug}/gracias?justEnrolled=1`);
}

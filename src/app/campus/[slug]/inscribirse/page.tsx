import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureActiveEnrollment } from '@/lib/campus/access';
import { createWorkshopEnrollmentTicket } from '@/lib/workshop-ticket';

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
  const { enrollment } = await ensureActiveEnrollment({
    userId: session.user.id,
    courseId: course.id,
  });

  // Guardar ticket firmado en cookies para robustez
  const ticket = createWorkshopEnrollmentTicket(enrollment.id, course.id);
  const cookieStore = await cookies();
  cookieStore.set('workshop_enrollment_ticket', ticket, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  });

  redirect(`/campus/${course.slug}/gracias?justEnrolled=1`);
}

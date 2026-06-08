import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function readDatabaseUrl(): string {
  const envPath = path.join(process.cwd(), '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL="?([^"\n\r]+)"?/);

  if (!match?.[1]) {
    throw new Error('DATABASE_URL no esta definida en .env');
  }

  return match[1];
}

async function main() {
  const databaseUrl = readDatabaseUrl();
  process.env.DATABASE_URL = databaseUrl;

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const certificatesApi = (await import('../src/lib/campus/certificates')) as {
    checkAndIssueCertificate: (userId: string, courseId: string) => Promise<any>;
  };
  const progressApi = (await import('../src/lib/campus/progress')) as {
    getCourseProgressStats: (userId: string, courseId: string) => Promise<{ totalLessons: number; completedLessons: number; percent: number }>;
  };
  const checkAndIssueCertificate = certificatesApi.checkAndIssueCertificate;
  const getCourseProgressStats = progressApi.getCourseProgressStats;

  try {
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@psicotrading.com' },
      select: { id: true, email: true },
    });

    if (!admin) {
      throw new Error('No se encontro admin@psicotrading.com');
    }

    const course = await prisma.course.findUnique({
      where: { slug: 'penta-trade' },
      select: { id: true, slug: true, title: true },
    });

    if (!course) {
      throw new Error('No se encontro el curso penta-trade');
    }

    const lessons = await prisma.lesson.findMany({
      where: {
        module: { courseId: course.id },
        isPublished: true,
      },
      include: {
        module: {
          select: {
            title: true,
            sortOrder: true,
          },
        },
      },
      orderBy: [
        { module: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
      ],
    });

    const timeline: Array<{
      module: string;
      lesson: string;
      percent: number;
      certificateId: string | null;
      certificateCode: string | null;
    }> = [];

    for (const lesson of lessons) {
      await prisma.lessonProgress.upsert({
        where: {
          userId_lessonId: {
            userId: admin.id,
            lessonId: lesson.id,
          },
        },
        update: {
          completedAt: new Date(),
        },
        create: {
          userId: admin.id,
          lessonId: lesson.id,
          completedAt: new Date(),
        },
      });

      const stats = await getCourseProgressStats(admin.id, course.id);
      const certificate = await checkAndIssueCertificate(admin.id, course.id);

      timeline.push({
        module: lesson.module.title,
        lesson: lesson.title,
        percent: stats.percent,
        certificateId: certificate?.id ?? null,
        certificateCode: certificate?.certificateCode ?? null,
      });
    }

    const certificateRows = await prisma.certificate.findMany({
      where: {
        userId: admin.id,
        courseId: course.id,
      },
      select: {
        id: true,
        certificateCode: true,
        status: true,
        issuedAt: true,
        snapshotCourse: true,
        snapshotName: true,
      },
    });

    const replayOne = await checkAndIssueCertificate(admin.id, course.id);
    const replayTwo = await checkAndIssueCertificate(admin.id, course.id);
    const finalStats = await getCourseProgressStats(admin.id, course.id);

    console.log(
      JSON.stringify(
        {
          course: course.slug,
          totalLessons: lessons.length,
          finalStats,
          timeline,
          certificateRows,
          replayCertificateIds: [replayOne?.id ?? null, replayTwo?.id ?? null],
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

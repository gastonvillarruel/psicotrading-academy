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
  const pool = new Pool({ connectionString: readDatabaseUrl() });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@psicotrading.com' },
      select: { id: true, email: true },
    });

    if (!admin) {
      throw new Error('No se encontro el usuario admin@psicotrading.com');
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
      },
      select: { id: true },
    });

    const lessonIds = lessons.map((lesson) => lesson.id);

    const deletedProgress = lessonIds.length
      ? await prisma.lessonProgress.deleteMany({
          where: {
            userId: admin.id,
            lessonId: { in: lessonIds },
          },
        })
      : { count: 0 };

    const deletedCertificates = await prisma.certificate.deleteMany({
      where: {
        userId: admin.id,
        courseId: course.id,
      },
    });

    console.log(
      JSON.stringify(
        {
          admin: admin.email,
          course: course.slug,
          deletedLessonProgress: deletedProgress.count,
          deletedCertificates: deletedCertificates.count,
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

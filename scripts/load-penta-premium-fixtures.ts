import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, LessonType, UnlockMode, VideoProvider } from '@prisma/client';

function readDatabaseUrl(): string {
  const envPath = path.join(process.cwd(), '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL="?([^"\n\r]+)"?/);

  if (!match?.[1]) {
    throw new Error('DATABASE_URL no esta definida en .env');
  }

  return match[1];
}

const databaseUrl = readDatabaseUrl();
const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const moduleFixtures = [
  {
    title: 'Introduccion',
    description: 'Base conceptual del sistema Penta Trade y del enfoque short defensivo.',
    lessons: [
      {
        title: 'Bienvenida a Penta Trade',
        description:
          'Bienvenido al programa Penta Trade. En esta clase vas a entender la estructura del curso, la logica del metodo y como estudiar cada modulo para incorporar una ejecucion mas disciplinada.',
      },
      {
        title: 'Que significa operar en short defensivo',
        description:
          'En esta clase se explica por que el sistema prioriza escenarios defensivos, selecciona entradas de alta probabilidad y evita la sobreoperacion en contextos de volatilidad agresiva.',
      },
    ],
  },
  {
    title: 'Protocolo de busqueda',
    description: 'Como identificar el contexto correcto antes de pensar en ejecutar.',
    lessons: [
      {
        title: 'Contexto de alta volatilidad',
        description:
          'Aprende a reconocer cuando el mercado presenta expansion, desplazamiento y velocidad suficiente para que el sistema tenga sentido operativo.',
      },
      {
        title: 'Identificacion del activo candidato',
        description:
          'Criterios para filtrar activos, descartar ruido y quedarte solo con los instrumentos que cumplen las condiciones minimas del protocolo.',
      },
    ],
  },
  {
    title: 'Protocolo de entrada',
    description: 'Las condiciones exactas que deben alinearse antes de ejecutar.',
    lessons: [
      {
        title: 'Las 5 confirmaciones',
        description:
          'Desglose completo de las cinco confirmaciones que validan una entrada dentro del sistema Penta Trade y reducen la impulsividad.',
      },
      {
        title: 'Timing de ejecucion',
        description:
          'Como sincronizar la entrada una vez que el setup aparece, evitando anticipacion, persecucion del precio y errores por ansiedad.',
      },
    ],
  },
  {
    title: 'Protocolo de salida',
    description: 'Gestion del riesgo y cierre profesional de la operacion.',
    lessons: [
      {
        title: 'Gestion del TP y SL',
        description:
          'Reglas practicas para definir take profit y stop loss sin improvisacion y con foco en la preservacion del capital.',
      },
      {
        title: 'Cierre por invalidacion',
        description:
          'Como detectar que la tesis dejo de ser valida y que hacer cuando el mercado cambia antes del objetivo esperado.',
      },
    ],
  },
];

async function main() {
  const course = await prisma.course.findUnique({
    where: { slug: 'penta-trade' },
    select: { id: true, title: true, slug: true },
  });

  if (!course) {
    throw new Error('No se encontro el curso penta-trade');
  }

  await prisma.course.update({
    where: { id: course.id },
    data: {
      unlockMode: UnlockMode.progressive,
    },
  });

  await prisma.module.deleteMany({
    where: { courseId: course.id },
  });

  for (const [moduleIndex, moduleFixture] of moduleFixtures.entries()) {
    const module = await prisma.module.create({
      data: {
        courseId: course.id,
        title: moduleFixture.title,
        description: moduleFixture.description,
        sortOrder: moduleIndex + 1,
        requiredPrevious: moduleIndex !== 0,
      },
    });

    for (const [lessonIndex, lessonFixture] of moduleFixture.lessons.entries()) {
      await prisma.lesson.create({
        data: {
          moduleId: module.id,
          title: lessonFixture.title,
          description: lessonFixture.description,
          type: LessonType.RECORDED,
          videoProvider: VideoProvider.LEGACY,
          videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
          durationMinutes: 12 + lessonIndex * 3,
          sortOrder: lessonIndex + 1,
          isPublished: true,
        },
      });
    }
  }

  console.log(`Fixtures premium cargados para ${course.slug}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

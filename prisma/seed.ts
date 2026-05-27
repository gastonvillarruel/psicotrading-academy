import { PrismaClient, Role, CourseType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Iniciando seed de la base de datos...');

  // Limpiar base de datos para evitar conflictos
  await prisma.subscription.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();

  // 1. Crear usuario administrador
  const adminPassword = 'Admin1234';
  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@psicotrading.com',
      password: hashedAdminPassword,
      name: 'Admin de Psicotrading',
      role: Role.ADMIN,
    },
  });
  console.log(`Usuario administrador creado: ${admin.email}`);

  // 2. Crear cursos iniciales
  const courses = [
    {
      slug: 'introduccion-al-psicotrading',
      title: 'Introducción al Psicotrading: Dominá tus Emociones',
      shortDescription: 'Aprendé los fundamentos de la psicología aplicada al trading y cómo controlar el miedo y la codicia.',
      longDescription: 'Este curso introductorio te brindará las herramientas psicológicas necesarias para enfrentar los mercados financieros con disciplina y objetividad. Analizaremos los sesgos cognitivos más comunes, las trampas mentales de la auto-sabotaje y cómo diseñar una bitácora de trading efectiva para registrar tus estados emocionales.',
      price: 15000.00,
      type: CourseType.RECORDED,
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', // Video de prueba
      thumbnail: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=800&q=80',
    },
    {
      slug: 'gestion-monetaria-y-riesgo',
      title: 'Gestión Monetaria y Control del Riesgo Emocional',
      shortDescription: 'Cómo la matemática y la psicología se unen para proteger tu capital en el largo plazo.',
      longDescription: 'La supervivencia en el trading depende un 20% del análisis técnico y un 80% de tu capacidad de controlar las pérdidas y calcular el tamaño de tus posiciones. En este curso aprenderás a calcular el ratio riesgo-beneficio ideal, a gestionar rachas perdedoras sin entrar en pánico (drawdowns) y a mantener el control bajo presión.',
      price: 25000.00,
      type: CourseType.RECORDED,
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', // Video de prueba
      thumbnail: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80',
    },
    {
      slug: 'taller-en-vivo-psicologia-alto-rendimiento',
      title: 'Taller En Vivo: Psicología de Alto Rendimiento para Traders',
      shortDescription: 'Sesión en vivo e interactiva para optimizar tu mentalidad y operar en tiempo real.',
      longDescription: 'Un taller completamente en vivo diseñado para traders que ya operan pero no logran la consistencia debido a bloqueos mentales o falta de disciplina. Realizaremos simulaciones en vivo, sesiones de preguntas y respuestas, y aprenderás técnicas avanzadas de meditación y enfoque diario aplicadas antes del inicio de la sesión operativa.',
      price: 45000.00,
      type: CourseType.LIVE,
      scheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días en el futuro
      videoUrl: null,
      thumbnail: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80',
    },
  ];

  for (const course of courses) {
    const createdCourse = await prisma.course.create({
      data: course,
    });
    console.log(`Curso creado: ${createdCourse.title} (${createdCourse.type})`);
  }

  console.log('Seed finalizado con éxito.');
}

main()
  .catch((e) => {
    console.error('Error al ejecutar el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

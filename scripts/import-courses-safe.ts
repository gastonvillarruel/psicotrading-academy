import { PrismaClient, CourseType, PaymentMode } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const allowImport = process.env.ALLOW_IMPORT_COURSES === 'true';
const isDryRun = process.env.DRY_RUN !== 'false';
const databaseUrl = process.env.DATABASE_URL || '';

async function main() {
  console.log('=== IMPORTADOR SEGURO DE CURSOS ===');
  
  if (!allowImport) {
    console.error('\n❌ ERROR: Importación bloqueada.');
    console.error('Habilitá la ejecución seteando la variable de entorno ALLOW_IMPORT_COURSES=true.');
    console.error('Ejemplo en Windows PowerShell:');
    console.error('  $env:ALLOW_IMPORT_COURSES="true"; $env:DRY_RUN="true"; npx tsx scripts/import-courses-safe.ts [archivo.json]\n');
    process.exit(1);
  }

  // Leer argumento de archivo o usar fallback a data/courses.import.json
  const fileArg = process.argv[2] || 'data/courses.import.json';
  const filePath = path.resolve(process.cwd(), fileArg);

  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ ERROR: No se encontró el archivo de importación en: ${filePath}`);
    console.error('Por favor, creá el archivo JSON o pasá su ruta como argumento.\n');
    process.exit(1);
  }

  console.log(`Leyendo datos desde: ${filePath}`);
  let coursesData: any[] = [];
  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    coursesData = JSON.parse(rawData);
  } catch (e: any) {
    console.error(`\n❌ ERROR: El archivo JSON tiene un formato inválido: ${e.message}\n`);
    process.exit(1);
  }

  if (!Array.isArray(coursesData)) {
    console.error('\n❌ ERROR: El contenido del JSON debe ser un array de cursos.\n');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const toCreate: any[] = [];
  const toUpdate: any[] = [];
  const withErrors: { item: any; errors: string[] }[] = [];

  console.log('\nValidando cursos...');
  for (const item of coursesData) {
    const errors: string[] = [];

    // Validar campos obligatorios
    if (!item.slug || typeof item.slug !== 'string' || item.slug.trim().length < 3) {
      errors.push('El slug es obligatorio y debe tener al menos 3 caracteres.');
    } else if (!/^[a-z0-9-]+$/.test(item.slug)) {
      errors.push('El slug solo debe contener minúsculas, números y guiones.');
    }
    
    if (!item.title || typeof item.title !== 'string' || item.title.trim().length < 3) {
      errors.push('El título es obligatorio y debe tener al menos 3 caracteres.');
    }
    
    if (!item.shortDescription || typeof item.shortDescription !== 'string' || item.shortDescription.trim().length < 10) {
      errors.push('La descripción corta es obligatoria y debe tener al menos 10 caracteres.');
    }
    
    if (!item.longDescription || typeof item.longDescription !== 'string' || item.longDescription.trim().length < 20) {
      errors.push('La descripción larga es obligatoria y debe tener al menos 20 caracteres.');
    }

    if (item.price === undefined || typeof item.price !== 'number' || item.price < 0) {
      errors.push('El precio debe ser un número positivo.');
    }

    if (!item.type || !['LIVE', 'RECORDED'].includes(item.type)) {
      errors.push('El tipo debe ser "LIVE" o "RECORDED".');
    }

    if (item.paymentMode && !['cash', 'installments'].includes(item.paymentMode)) {
      errors.push('El modo de pago (paymentMode) debe ser "cash" o "installments".');
    }

    if (item.fakeEnrollments !== undefined && item.fakeEnrollments !== null) {
      if (typeof item.fakeEnrollments !== 'number' || item.fakeEnrollments < 0 || !Number.isInteger(item.fakeEnrollments)) {
        errors.push('fakeEnrollments debe ser un número entero no negativo.');
      }
    }

    if (errors.length > 0) {
      withErrors.push({ item, errors });
      continue;
    }

    // Verificar si ya existe en la base de datos
    try {
      const existing = await prisma.course.findUnique({
        where: { slug: item.slug },
      });
      if (existing) {
        toUpdate.push(item);
      } else {
        toCreate.push(item);
      }
    } catch (e: any) {
      errors.push(`Error al consultar la base de datos: ${e.message}`);
      withErrors.push({ item, errors });
    }
  }

  // Mostrar Resumen
  console.log('\n=========================================');
  console.log('            RESUMEN DE IMPORTACIÓN       ');
  console.log(`Modo: ${isDryRun ? '🔍 DRY RUN (Simulación - No escribe en base de datos)' : '💾 ESCRITURA REAL'}`);
  console.log('=========================================');
  console.log(`Cursos a CREAR:      ${toCreate.length}`);
  console.log(`Cursos a ACTUALIZAR:  ${toUpdate.length}`);
  console.log(`Cursos con ERRORES:   ${withErrors.length}`);
  console.log('=========================================\n');

  if (withErrors.length > 0) {
    console.log('❌ Detalle de cursos con errores/campos faltantes:');
    withErrors.forEach(({ item, errors }, idx) => {
      console.log(`\n[${idx + 1}] Curso: "${item.title || 'Sin Título'}" (Slug: ${item.slug || 'Sin Slug'})`);
      errors.forEach(err => console.log(`   - ${err}`));
    });
    console.log('\n-----------------------------------------');
  }

  if (isDryRun) {
    console.log('\n💡 Simulación finalizada. Para ejecutar los cambios en la base de datos, corre el script seteando DRY_RUN=false.');
    console.log('Ejemplo en Windows PowerShell:');
    console.log('  $env:ALLOW_IMPORT_COURSES="true"; $env:DRY_RUN="false"; npx tsx scripts/import-courses-safe.ts [archivo.json]\n');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Ejecución Real
  console.log('Iniciando escritura real de datos...');
  
  // Procesar Creaciones y Actualizaciones (Idempotente)
  const allToProcess = [...toCreate, ...toUpdate];
  let successCount = 0;
  let failCount = 0;

  for (const item of allToProcess) {
    try {
      const { startDates, ...courseData } = item;
      
      // Upsert
      const upserted = await prisma.course.upsert({
        where: { slug: item.slug },
        update: {
          title: courseData.title,
          shortDescription: courseData.shortDescription,
          longDescription: courseData.longDescription,
          price: courseData.price,
          priceARS: courseData.priceARS ?? null,
          priceUSD: courseData.priceUSD ?? null,
          originalPriceARS: courseData.originalPriceARS ?? null,
          originalPriceUSD: courseData.originalPriceUSD ?? null,
          paymentMode: (courseData.paymentMode as PaymentMode) ?? 'cash',
          durationInMonths: courseData.durationInMonths ?? null,
          duration: courseData.duration ?? null,
          fakeEnrollments: courseData.fakeEnrollments ?? null,
          available: courseData.available !== false,
          type: courseData.type as CourseType,
          videoUrl: courseData.videoUrl || null,
          scheduledAt: courseData.scheduledAt ? new Date(courseData.scheduledAt) : null,
          thumbnail: courseData.thumbnail || null,
        },
        create: {
          slug: courseData.slug,
          title: courseData.title,
          shortDescription: courseData.shortDescription,
          longDescription: courseData.longDescription,
          price: courseData.price,
          priceARS: courseData.priceARS ?? null,
          priceUSD: courseData.priceUSD ?? null,
          originalPriceARS: courseData.originalPriceARS ?? null,
          originalPriceUSD: courseData.originalPriceUSD ?? null,
          paymentMode: (courseData.paymentMode as PaymentMode) ?? 'cash',
          durationInMonths: courseData.durationInMonths ?? null,
          duration: courseData.duration ?? null,
          fakeEnrollments: courseData.fakeEnrollments ?? null,
          available: courseData.available !== false,
          type: courseData.type as CourseType,
          videoUrl: courseData.videoUrl || null,
          scheduledAt: courseData.scheduledAt ? new Date(courseData.scheduledAt) : null,
          thumbnail: courseData.thumbnail || null,
        }
      });

      // Si tiene fechas de inicio, procesarlas
      if (startDates && Array.isArray(startDates)) {
        // Eliminar las fechas anteriores para este curso para evitar colisiones
        await prisma.courseStartDate.deleteMany({
          where: { courseId: upserted.id }
        });

        // Crear nuevas fechas
        await prisma.courseStartDate.createMany({
          data: startDates.map((sd: any) => ({
            courseId: upserted.id,
            startDate: new Date(sd.startDate),
            startTime: sd.startTime || null,
            teacherName: sd.teacherName || null,
            isActive: sd.isActive !== false,
          }))
        });
      }

      console.log(`✅ Procesado: ${upserted.title} (Slug: ${upserted.slug})`);
      successCount++;
    } catch (e: any) {
      console.error(`❌ Falló importación de curso "${item.title || 'Sin Título'}": ${e.message}`);
      failCount++;
    }
  }

  console.log('\n=========================================');
  console.log('             RESULTADO FINAL             ');
  console.log('=========================================');
  console.log(`Cursos importados con éxito: ${successCount}`);
  console.log(`Cursos con fallo de escritura: ${failCount}`);
  console.log('=========================================\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal error en importador:', e);
});

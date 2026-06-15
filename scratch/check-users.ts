import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { db } from '../src/lib/db';

async function main() {
  const course = await db.course.findFirst({
    where: { slug: 'guia-de-ejecucion-para-el-trader' },
    include: {
      scheduleOptions: true,
      enrollments: {
        include: {
          user: true,
          scheduleOption: true,
        }
      }
    }
  });

  if (!course) {
    console.log("Curso no encontrado.");
    return;
  }

  console.log("=== CURSO ===");
  console.log(`${course.title} (${course.id})`);

  console.log("\n=== COMISIONES DISPONIBLES ===");
  for (const opt of course.scheduleOptions) {
    console.log(`- ID: ${opt.id} | Nombre: ${opt.name} | Activo: ${opt.isActive}`);
  }

  const namesToSearch = ['Alfonsina', 'Alexander', 'John', 'Gonzo', 'Sergio', 'Gastón'];
  
  console.log("\n=== USUARIOS ENCONTRADOS QUE COINCIDEN CON LA BÚSQUEDA ===");
  const users = await db.user.findMany({
    where: {
      OR: namesToSearch.map(name => ({
        name: { contains: name, mode: 'insensitive' }
      }))
    }
  });

  for (const u of users) {
    const enrollment = course.enrollments.find(e => e.userId === u.id);
    console.log(`- User ID: ${u.id} | Email: ${u.email} | Nombre: ${u.name} | Inscripto: ${enrollment ? 'SÍ' : 'NO'} | Comisión Actual: ${enrollment?.scheduleOption?.name || 'Ninguna'}`);
  }
}

main()
  .catch(err => console.error(err))
  .finally(() => db.$disconnect());

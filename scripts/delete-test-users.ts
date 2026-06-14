import dotenv from 'dotenv';
dotenv.config();
import { db } from '../src/lib/db';

async function main() {
  const emails = [
    'browser-test-4@psicotrading.com',
    'alfonnvillarruel@gmail.com',
    'manual-test@psicotrading.com'
  ];

  for (const email of emails) {
    try {
      const user = await db.user.findUnique({
        where: { email },
      });

      if (user) {
        await db.account.deleteMany({ where: { userId: user.id } });
        await db.session.deleteMany({ where: { userId: user.id } });
        await db.user.delete({ where: { id: user.id } });
        console.log(`✅ Eliminado: ${email}`);
      } else {
        console.log(`ℹ️ No encontrado: ${email}`);
      }
    } catch (err) {
      console.error(`❌ Error con ${email}:`, err);
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await db.$disconnect();
    // Forzar salida para cerrar el pool de conexiones de pg
    process.exit(0);
  });

import 'dotenv/config';
import { db } from '../src/lib/db';

async function main() {
  const users = await db.user.findMany({
    where: {
      OR: [
        { name: { contains: 'Gonzo', mode: 'insensitive' } },
        { email: { contains: 'gonzo', mode: 'insensitive' } }
      ]
    }
  });

  const courses = await db.course.findMany({
    where: {
      title: { contains: 'Penta', mode: 'insensitive' }
    }
  });

  console.log('Users found:', users.map(u => ({ id: u.id, name: u.name, email: u.email })));
  console.log('Courses found:', courses.map(c => ({ id: c.id, title: c.title })));
}

main()
  .catch(e => console.error(e))
  .finally(() => {
     process.exit(0);
  });

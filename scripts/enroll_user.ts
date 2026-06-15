import 'dotenv/config';
import { db } from '../src/lib/db';

async function main() {
  const userId = '9c7a8846-7de3-4446-b4db-48f95cdaf62a'; // El Gonzo
  const courseId = 'd63cec20-5b28-4d46-b5cc-c93f675cc4da'; // Penta Trade

  // Check if enrollment exists
  const existing = await db.enrollment.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId
      }
    }
  });

  if (existing) {
    console.log('User is already enrolled:', existing);
    return;
  }

  // Create enrollment
  const enrollment = await db.enrollment.create({
    data: {
      userId,
      courseId
    }
  });

  console.log('Enrollment created successfully:', enrollment);
}

main()
  .catch(e => console.error(e))
  .finally(() => {
     process.exit(0);
  });

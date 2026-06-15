import { db } from '../src/lib/db';

async function check() {
  const courseId = '7338ac37-ef7f-4f53-870c-cd93f004369a';
  const startDates = await db.courseStartDate.findMany({
    where: { courseId },
    include: { scheduleOption: true }
  });
  console.log("Start Dates in DB:", JSON.stringify(startDates, null, 2));

  const options = await db.courseScheduleOption.findMany({
    where: { courseId }
  });
  console.log("Schedule Options in DB:", JSON.stringify(options, null, 2));
}

check();

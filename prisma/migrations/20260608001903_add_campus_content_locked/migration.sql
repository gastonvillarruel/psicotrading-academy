-- AddColumn campusContentLocked and campusContentLockedAt to Course
ALTER TABLE "Course" ADD COLUMN "campusContentLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "campusContentLockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "recordingUrl" TEXT,
ADD COLUMN     "unlockMinutesBefore" INTEGER DEFAULT 10;

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('LEGACY', 'BUNNY', 'YOUTUBE', 'VIMEO');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "videoDurationSecs" INTEGER,
ADD COLUMN     "videoId" TEXT,
ADD COLUMN     "videoProvider" "VideoProvider" NOT NULL DEFAULT 'LEGACY';

-- LOCAL DEVELOPMENT ONLY. NEVER DEPLOY. Source schema: 599510d.
BEGIN;
DO $local_only$
BEGIN
 IF current_database() <> 'snipers_dev' OR current_user <> 'snipers_local'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
 OR inet_server_port() IS DISTINCT FROM 55432 THEN
   RAISE EXCEPTION 'LOCAL DEVELOPMENT ONLY: destination rejected';
 END IF;
END $local_only$;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STUDENT');

-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('LIVE', 'RECORDED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('cash', 'installments');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('mercadopago', 'paypal', 'nowpayments');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('RECORDED', 'LIVE', 'TEXT', 'RESOURCE');

-- CreateEnum
CREATE TYPE "UnlockMode" AS ENUM ('free', 'progressive');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('ISSUED', 'REVOKED');

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('LEGACY', 'BUNNY', 'YOUTUBE', 'VIMEO');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'IMAGE', 'ORDER', 'MATCH');

-- CreateEnum
CREATE TYPE "QuizAttemptStatus" AS ENUM ('STARTED', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bio" TEXT,
    "country" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "phone" TEXT,
    "timezone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activeSessionId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastLoginUserAgent" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "longDescription" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "type" "CourseType" NOT NULL,
    "videoUrl" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "thumbnail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instructorBio" TEXT,
    "instructorName" TEXT,
    "instructorRole" TEXT,
    "descriptionSections" JSONB,
    "durationInMonths" INTEGER,
    "originalPriceARS" INTEGER,
    "originalPriceUSD" INTEGER,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'cash',
    "priceARS" INTEGER,
    "priceUSD" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "duration" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fakeEnrollments" INTEGER,
    "priceUSDT" DECIMAL(18,6),
    "originalPriceUSDT" DECIMAL(18,6),
    "resources" JSONB,
    "unlockMode" "UnlockMode" NOT NULL DEFAULT 'free',
    "campusContentLocked" BOOLEAN NOT NULL DEFAULT false,
    "campusContentLockedAt" TIMESTAMP(3),
    "campusSettings" JSONB,
    "campusChecklist" JSONB,
    "campusMaterials" JSONB,
    "isLeadCapture" BOOLEAN NOT NULL DEFAULT false,
    "whatsappGroupUrl" TEXT,
    "leadCaptureCtaText" TEXT,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(18,6) NOT NULL,
    "checkoutUrl" TEXT,
    "currency" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "providerPaymentId" TEXT,
    "providerStatus" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scheduleOptionId" TEXT,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseStartDate" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "teacherName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scheduleOptionId" TEXT,

    CONSTRAINT "CourseStartDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "scheduleOptionId" TEXT,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "requiredPrevious" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "LessonType" NOT NULL DEFAULT 'RECORDED',
    "videoUrl" TEXT,
    "liveUrl" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recordingUrl" TEXT,
    "unlockMinutesBefore" INTEGER DEFAULT 10,
    "videoDurationSecs" INTEGER,
    "videoId" TEXT,
    "videoProvider" "VideoProvider" NOT NULL DEFAULT 'LEGACY',

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "watchedSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseScheduleOption" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT,
    "capacity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseScheduleOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonLiveSession" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "scheduleOptionId" TEXT NOT NULL,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3),
    "liveUrl" TEXT,
    "recordingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonLiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "certificateCode" TEXT NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "snapshotName" TEXT NOT NULL,
    "snapshotCourse" TEXT NOT NULL,
    "snapshotHours" INTEGER,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentQuizId" TEXT,
    "customLevels" JSONB,
    "youtubeLiveUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "category" TEXT,
    "explanation" TEXT,
    "explanationLink" TEXT,
    "explanationVideo" TEXT,
    "explanationResources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestionItem" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "QuizQuestionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "userId" TEXT,
    "guestToken" TEXT,
    "status" "QuizAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "name" TEXT,
    "email" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "referer" TEXT,
    "source" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "country" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "questionTextSnapshot" TEXT NOT NULL,
    "selectedOptionTextSnapshot" TEXT,
    "correctOptionTextSnapshot" TEXT,
    "explanationSnapshot" TEXT,

    CONSTRAINT "QuizAttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX "Purchase_scheduleOptionId_idx" ON "Purchase"("scheduleOptionId");

-- CreateIndex
CREATE INDEX "CourseStartDate_courseId_idx" ON "CourseStartDate"("courseId");

-- CreateIndex
CREATE INDEX "CourseStartDate_scheduleOptionId_idx" ON "CourseStartDate"("scheduleOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_purchaseId_key" ON "Enrollment"("purchaseId");

-- CreateIndex
CREATE INDEX "Enrollment_scheduleOptionId_idx" ON "Enrollment"("scheduleOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId", "courseId");

-- CreateIndex
CREATE INDEX "Module_courseId_idx" ON "Module"("courseId");

-- CreateIndex
CREATE INDEX "Module_courseId_sortOrder_idx" ON "Module"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "Lesson_moduleId_idx" ON "Lesson"("moduleId");

-- CreateIndex
CREATE INDEX "Lesson_moduleId_sortOrder_idx" ON "Lesson"("moduleId", "sortOrder");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_idx" ON "LessonProgress"("userId");

-- CreateIndex
CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_completedAt_idx" ON "LessonProgress"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "CourseScheduleOption_courseId_idx" ON "CourseScheduleOption"("courseId");

-- CreateIndex
CREATE INDEX "CourseScheduleOption_courseId_sortOrder_idx" ON "CourseScheduleOption"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "LessonLiveSession_lessonId_idx" ON "LessonLiveSession"("lessonId");

-- CreateIndex
CREATE INDEX "LessonLiveSession_scheduleOptionId_idx" ON "LessonLiveSession"("scheduleOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonLiveSession_lessonId_scheduleOptionId_key" ON "LessonLiveSession"("lessonId", "scheduleOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_certificateCode_key" ON "Certificate"("certificateCode");

-- CreateIndex
CREATE INDEX "Certificate_userId_idx" ON "Certificate"("userId");

-- CreateIndex
CREATE INDEX "Certificate_certificateCode_idx" ON "Certificate"("certificateCode");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_userId_courseId_key" ON "Certificate"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_slug_key" ON "Quiz"("slug");

-- CreateIndex
CREATE INDEX "Quiz_status_isPublic_publishedAt_closedAt_idx" ON "Quiz"("status", "isPublic", "publishedAt", "closedAt");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");

-- CreateIndex
CREATE INDEX "QuizQuestionItem_quizId_idx" ON "QuizQuestionItem"("quizId");

-- CreateIndex
CREATE INDEX "QuizQuestionItem_questionId_idx" ON "QuizQuestionItem"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizQuestionItem_quizId_questionId_key" ON "QuizQuestionItem"("quizId", "questionId");

-- CreateIndex
CREATE INDEX "QuizAttempt_quizId_idx" ON "QuizAttempt"("quizId");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_idx" ON "QuizAttempt"("userId");

-- CreateIndex
CREATE INDEX "QuizAttempt_guestToken_idx" ON "QuizAttempt"("guestToken");

-- CreateIndex
CREATE INDEX "QuizAttemptAnswer_attemptId_idx" ON "QuizAttemptAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "QuizAttemptAnswer_questionId_idx" ON "QuizAttemptAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_scheduleOptionId_fkey" FOREIGN KEY ("scheduleOptionId") REFERENCES "CourseScheduleOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStartDate" ADD CONSTRAINT "CourseStartDate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStartDate" ADD CONSTRAINT "CourseStartDate_scheduleOptionId_fkey" FOREIGN KEY ("scheduleOptionId") REFERENCES "CourseScheduleOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_scheduleOptionId_fkey" FOREIGN KEY ("scheduleOptionId") REFERENCES "CourseScheduleOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseScheduleOption" ADD CONSTRAINT "CourseScheduleOption_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonLiveSession" ADD CONSTRAINT "LessonLiveSession_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonLiveSession" ADD CONSTRAINT "LessonLiveSession_scheduleOptionId_fkey" FOREIGN KEY ("scheduleOptionId") REFERENCES "CourseScheduleOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestionItem" ADD CONSTRAINT "QuizQuestionItem_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestionItem" ADD CONSTRAINT "QuizQuestionItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttemptAnswer" ADD CONSTRAINT "QuizAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttemptAnswer" ADD CONSTRAINT "QuizAttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttemptAnswer" ADD CONSTRAINT "QuizAttemptAnswer_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;

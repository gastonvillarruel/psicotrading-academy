import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('No se encontró el archivo .env');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL="?([^"\n\r]+)"?/);
  if (!match) {
    console.error('No se encontró DATABASE_URL en .env');
    process.exit(1);
  }

  const connectionString = match[1];
  console.log('Conectando a PostgreSQL mediante pg client...');
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Creando tipos y tablas para el módulo de Evaluaciones en PostgreSQL...');

  const sql = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuizStatus') THEN
      CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionType') THEN
      CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'IMAGE', 'ORDER', 'MATCH');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuizAttemptStatus') THEN
      CREATE TYPE "QuizAttemptStatus" AS ENUM ('STARTED', 'FINISHED', 'ABANDONED');
    END IF;
  END $$;

  CREATE TABLE IF NOT EXISTS "Quiz" (
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "Quiz_slug_key" ON "Quiz"("slug");
  CREATE INDEX IF NOT EXISTS "Quiz_status_isPublic_publishedAt_closedAt_idx" ON "Quiz"("status", "isPublic", "publishedAt", "closedAt");

  CREATE TABLE IF NOT EXISTS "Question" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "category" TEXT,
    "explanation" TEXT,
    "explanationLink" TEXT,
    "explanationVideo" TEXT,
    "explanationResources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
  );

  CREATE TABLE IF NOT EXISTS "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE INDEX IF NOT EXISTS "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");

  CREATE TABLE IF NOT EXISTS "QuizQuestionItem" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "QuizQuestionItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuizQuestionItem_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuizQuestionItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "QuizQuestionItem_quizId_questionId_key" ON "QuizQuestionItem"("quizId", "questionId");
  CREATE INDEX IF NOT EXISTS "QuizQuestionItem_quizId_idx" ON "QuizQuestionItem"("quizId");
  CREATE INDEX IF NOT EXISTS "QuizQuestionItem_questionId_idx" ON "QuizQuestionItem"("questionId");

  CREATE TABLE IF NOT EXISTS "QuizAttempt" (
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
    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );
  CREATE INDEX IF NOT EXISTS "QuizAttempt_quizId_idx" ON "QuizAttempt"("quizId");
  CREATE INDEX IF NOT EXISTS "QuizAttempt_userId_idx" ON "QuizAttempt"("userId");
  CREATE INDEX IF NOT EXISTS "QuizAttempt_guestToken_idx" ON "QuizAttempt"("guestToken");

  CREATE TABLE IF NOT EXISTS "QuizAttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "questionTextSnapshot" TEXT NOT NULL,
    "selectedOptionTextSnapshot" TEXT,
    "correctOptionTextSnapshot" TEXT,
    "explanationSnapshot" TEXT,
    CONSTRAINT "QuizAttemptAnswer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuizAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuizAttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuizAttemptAnswer_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );
  CREATE INDEX IF NOT EXISTS "QuizAttemptAnswer_attemptId_idx" ON "QuizAttemptAnswer"("attemptId");
  CREATE INDEX IF NOT EXISTS "QuizAttemptAnswer_questionId_idx" ON "QuizAttemptAnswer"("questionId");
  `;

  await client.query(sql);
  console.log('✅ ¡Tablas del módulo de Evaluaciones sincronizadas exitosamente en la base de datos!');
  await client.end();
}

main().catch((err) => {
  console.error('Error al sincronizar tablas:', err);
  process.exit(1);
});

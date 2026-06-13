-- Migration: 20260613_add_nextauth_models
-- Adds NextAuth PrismaAdapter required models: Account, Session, VerificationToken
-- Extends User with: emailVerified, image, phone, country, timezone, bio, updatedAt
-- Makes password nullable for OAuth users (Google)
-- Marks all existing users as emailVerified so they are not blocked after migration

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. AlterTable User
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "User"
ADD COLUMN "bio" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "emailVerified" TIMESTAMP(3),
ADD COLUMN "image" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "timezone" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
ALTER COLUMN "password" DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Marcar usuarios existentes como verificados
--    Evita que el admin y usuarios actuales queden bloqueados por emailVerified IS NULL
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "User"
SET "emailVerified" = NOW()
WHERE "emailVerified" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Eliminar el DEFAULT de updatedAt (Prisma lo maneja con @updatedAt)
--    Evita drift entre la base y el schema Prisma
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "User"
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CreateTable Account (OAuth providers: Google, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CreateTable Session (NextAuth JWT sessions - strategy: jwt ignora esta tabla,
--    pero PrismaAdapter la requiere en el schema)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CreateTable VerificationToken (tokens de verificación de email)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Foreign Keys
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

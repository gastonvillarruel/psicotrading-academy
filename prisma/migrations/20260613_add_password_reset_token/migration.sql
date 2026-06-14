-- Migration: 20260613_add_password_reset_token
-- Adds PasswordResetToken table for secure password recovery flow.
-- The `token` column stores the SHA-256 hash of the raw token (never plaintext).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CreateTable PasswordResetToken
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "PasswordResetToken" (
    "id"        TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "token"     TEXT NOT NULL,
    "expires"   TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

CREATE TABLE "MemberAccount" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "email" TEXT NOT NULL,
 "displayName" TEXT NOT NULL,
 "passwordHash" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "version" INTEGER NOT NULL DEFAULT 0,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MemberAccount_email_key" ON "MemberAccount"("email");
CREATE TABLE "MemberSession" (
 "tokenHash" TEXT NOT NULL PRIMARY KEY,
 "memberId" TEXT NOT NULL,
 "version" INTEGER NOT NULL,
 "expiresAt" DATETIME NOT NULL,
 CONSTRAINT "MemberSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "MemberAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MemberSession_expiresAt_idx" ON "MemberSession"("expiresAt");
CREATE TABLE "MemberInvite" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "codeHash" TEXT NOT NULL,
 "label" TEXT NOT NULL,
 "email" TEXT,
 "purpose" TEXT NOT NULL DEFAULT 'join',
 "memberId" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" DATETIME NOT NULL,
 "claimedAt" DATETIME,
 "revokedAt" DATETIME,
 CONSTRAINT "MemberInvite_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "MemberAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MemberInvite_codeHash_key" ON "MemberInvite"("codeHash");
CREATE INDEX "MemberInvite_expiresAt_idx" ON "MemberInvite"("expiresAt");

-- CreateTable
CREATE TABLE "SiteAdmin" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'owner',
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "needsSetup" BOOLEAN NOT NULL DEFAULT true,
    "recoveryEmail" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "SiteAdmin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminToken" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "AdminToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "SiteAdmin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteContent" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'home',
    "headline" TEXT NOT NULL DEFAULT 'Good company. Great games.',
    "intro" TEXT NOT NULL DEFAULT 'Pull up a seat. Start with Five-O Poker, and come back for more games as the collection grows.'
);

-- CreateTable
CREATE TABLE "CatalogGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Card game',
    "href" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteAdmin_username_key" ON "SiteAdmin"("username");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminToken_expiresAt_idx" ON "AdminToken"("expiresAt");

INSERT INTO "SiteContent" ("id") VALUES ('home');
INSERT INTO "CatalogGame" ("id", "title", "description", "category", "href", "status", "sortOrder") VALUES ('five-o', 'Five-O Poker', 'Build five poker hands, one card at a time. Win three to take the game. Challenge a friend, find an opponent, or play the computer.', 'CARD GAME / 1–2 PLAYERS', '/lobby', 'live', 0);

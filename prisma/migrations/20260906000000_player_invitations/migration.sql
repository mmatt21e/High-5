CREATE TABLE "GameInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pendingKey" TEXT,
    "matchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GameInvitation_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameInvitation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameInvitation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GameInvitation_pendingKey_key" ON "GameInvitation"("pendingKey");
CREATE UNIQUE INDEX "GameInvitation_matchId_key" ON "GameInvitation"("matchId");
CREATE INDEX "GameInvitation_recipientId_status_createdAt_idx" ON "GameInvitation"("recipientId", "status", "createdAt");
CREATE INDEX "GameInvitation_senderId_status_createdAt_idx" ON "GameInvitation"("senderId", "status", "createdAt");
CREATE INDEX "Match_hostId_updatedAt_idx" ON "Match"("hostId", "updatedAt");
CREATE INDEX "Match_guestId_updatedAt_idx" ON "Match"("guestId", "updatedAt");

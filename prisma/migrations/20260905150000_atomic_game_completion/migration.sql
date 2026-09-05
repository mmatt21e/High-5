-- Preserve current-game seeds and give every completed game a durable,
-- per-match identity. Existing games are numbered by their persisted order.
ALTER TABLE "Match" ADD COLUMN "gameSeed" INTEGER;

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "winnerSeat" INTEGER,
    "isFiveO" BOOLEAN NOT NULL DEFAULT false,
    "resultJson" TEXT NOT NULL,
    "boardJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Game_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Game" (
    "id",
    "matchId",
    "gameNumber",
    "seed",
    "winnerSeat",
    "isFiveO",
    "resultJson",
    "boardJson",
    "createdAt"
)
SELECT
    current."id",
    current."matchId",
    (
        SELECT COUNT(*)
        FROM "Game" AS prior
        WHERE prior."matchId" = current."matchId"
          AND (
              prior."createdAt" < current."createdAt"
              OR (
                  prior."createdAt" = current."createdAt"
                  AND prior."id" <= current."id"
              )
          )
    ),
    current."seed",
    current."winnerSeat",
    current."isFiveO",
    current."resultJson",
    current."boardJson",
    current."createdAt"
FROM "Game" AS current;

DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE UNIQUE INDEX "Game_matchId_gameNumber_key" ON "Game"("matchId", "gameNumber");

PRAGMA foreign_keys=ON;

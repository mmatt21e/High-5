-- This forward-only guard verifies that the immutable atomic-completion
-- migration left no broken references. Deployment also runs the same check
-- before applying any migration so an invalid legacy database is not altered.

-- Matches already in progress before gameSeed persistence was introduced have
-- a complete deck in gameState but no seed. Zero is an explicit legacy nonce:
-- it anchors the completion CAS without pretending the old deck can be
-- reconstructed from a seed.
UPDATE "Match"
SET "gameSeed" = 0
WHERE "gameSeed" IS NULL
  AND "gameState" IS NOT NULL
  AND "status" = 'active';

CREATE TEMP TABLE "_migration_fk_guard" (
    "violations" INTEGER NOT NULL CHECK ("violations" = 0)
);
INSERT INTO "_migration_fk_guard" ("violations")
SELECT COUNT(*) FROM pragma_foreign_key_check;
DROP TABLE "_migration_fk_guard";

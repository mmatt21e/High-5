import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, openSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const prismaDirectory = resolve(repositoryRoot, "prisma");
const prismaCli = resolve(
  repositoryRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);
const crossEnvCli = resolve(
  repositoryRoot,
  "node_modules",
  "cross-env",
  "src",
  "bin",
  "cross-env.js",
);
const currentSchema = resolve(prismaDirectory, "schema.prisma");
const legacySchema = resolve(repositoryRoot, "scripts", "fixtures", "pre-round2.schema.prisma");
const baselineMigration = "20260905000000_initial_sqlite_baseline";
const atomicMigration = "20260905150000_atomic_game_completion";
const acceptedAtomicChecksum =
  "d703b710a6c65ca46a2bc15f993b51a8de25fbc0e39fabb2fcea610599f2ab88";
const integrityMigration = "20260905200000_verify_foreign_key_integrity";
const invitationMigration = "20260906000000_player_invitations";
const computerMigration = "20260907000000_computer_opponents";
const atomicMigrationSql = resolve(
  prismaDirectory,
  "migrations",
  atomicMigration,
  "migration.sql",
);
const deploymentScript = resolve(repositoryRoot, "scripts", "deploy-migrations.mjs");
const token = `${process.pid}-${randomUUID().slice(0, 8)}`;
// Prisma's Windows SQLite connector rejects dot-prefixed database filenames.
const freshDatabase = resolve(prismaDirectory, `mig-fresh-${token}.db`);
const legacyDatabase = resolve(prismaDirectory, `mig-legacy-${token}.db`);
const predecessorDatabase = resolve(prismaDirectory, `mig-round2-${token}.db`);
const orphanDatabase = resolve(prismaDirectory, `mig-orphan-${token}.db`);
const playerDatabase = resolve(prismaDirectory, `mig-player-${token}.db`);

function databaseUrl(databasePath) {
  // Relative SQLite URLs are resolved from the schema directory by Prisma.
  return `file:./${basename(databasePath)}`;
}

function legacyFixtureDatabaseUrl(databasePath) {
  return `file:../../prisma/${basename(databasePath)}`;
}

function absoluteDatabaseUrl(databasePath) {
  return `file:${databasePath.replaceAll("\\", "/")}`;
}

function runPrisma(args, url) {
  // cross-env's cross-spawn path is required for reliable Prisma engine
  // invocation on Windows and is harmless on Unix runners.
  const result = spawnSync(
    process.execPath,
    [crossEnvCli, `DATABASE_URL=${url}`, prismaCli, ...args],
    {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [`prisma ${args.join(" ")} failed`, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function runDeployment(url, { expectFailure = false } = {}) {
  const result = spawnSync(process.execPath, [deploymentScript], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: url },
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });

  if (result.error) throw result.error;
  if (expectFailure) {
    assert(result.status !== 0, "Expected guarded migration deployment to fail");
    return result;
  }
  if (result.status !== 0) {
    throw new Error(
      ["guarded migration deployment failed", result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyReleasedMigrationIsImmutable() {
  const checksum = createHash("sha256").update(readFileSync(atomicMigrationSql)).digest("hex");
  assert(
    checksum === acceptedAtomicChecksum,
    `${atomicMigration} no longer matches its accepted 11b1f48 checksum`,
  );
}

async function inspectDatabase(url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const gameColumns = await client.$queryRawUnsafe('PRAGMA table_info("Game")');
    const matchColumns = await client.$queryRawUnsafe('PRAGMA table_info("Match")');
    const foreignKeyViolations = await client.$queryRawUnsafe("PRAGMA foreign_key_check");
    const gameForeignKeys = await client.$queryRawUnsafe('PRAGMA foreign_key_list("Game")');
    const appliedMigrations = await client.$queryRawUnsafe(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name',
    );

    assert(gameColumns.some(({ name }) => name === "gameNumber"), "Game.gameNumber is missing");
    assert(matchColumns.some(({ name }) => name === "gameSeed"), "Match.gameSeed is missing");
    assert(foreignKeyViolations.length === 0, "SQLite foreign_key_check found violations");
    assert(
      gameForeignKeys.some(
        (foreignKey) => foreignKey.table === "Match" && foreignKey.on_delete === "CASCADE",
      ),
      "Game.matchId does not retain its cascading foreign key",
    );
    assert(
      appliedMigrations.map(({ migration_name }) => migration_name).join(",") ===
        [baselineMigration, atomicMigration, integrityMigration, invitationMigration, computerMigration].join(","),
      "Expected the complete tracked migration history to be applied",
    );
    const userColumns = await client.$queryRawUnsafe('PRAGMA table_info("User")');
    assert(userColumns.some(({ name }) => name === "computerLevel"), "User.computerLevel is missing");
  } finally {
    await client.$disconnect();
  }
}

async function seedLegacyDatabase(url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    await client.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "email", "displayName") VALUES ('host', 'host@example.test', 'Host')`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "email", "displayName") VALUES ('guest', 'guest@example.test', 'Guest')`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Match" (
        "id", "inviteCode", "status", "targetWins", "hostId", "guestId",
        "gameNumber", "gameState", "createdAt", "updatedAt"
      ) VALUES (
        'match-legacy', 'OLD55', 'active', 5, 'host', 'guest',
        2, '{"phase":"playing","legacy":true}',
        '2026-09-05 12:00:00', '2026-09-05 12:00:00'
      )`,
    );
    // Insert in reverse ID order with the same timestamp. The migration's
    // explicit createdAt/id ordering must still assign stable 1-based numbers.
    await client.$executeRawUnsafe(
      `INSERT INTO "Game" (
        "id", "matchId", "seed", "winnerSeat", "resultJson", "boardJson", "createdAt"
      ) VALUES (
        'game-b', 'match-legacy', 202, 1, '{"winner":1}', '[]', '2026-09-05 12:00:00'
      )`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Game" (
        "id", "matchId", "seed", "winnerSeat", "resultJson", "boardJson", "createdAt"
      ) VALUES (
        'game-a', 'match-legacy', 101, 0, '{"winner":0}', '[]', '2026-09-05 12:00:00'
      )`,
    );
  } finally {
    await client.$disconnect();
  }
}

async function seedOrphanedLegacyDatabase(url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    await client.$executeRawUnsafe("PRAGMA foreign_keys=OFF");
    await client.$executeRawUnsafe(
      `INSERT INTO "Game" (
        "id", "matchId", "seed", "resultJson", "boardJson"
      ) VALUES ('orphan-game', 'missing-match', 303, '{}', '[]')`,
    );
  } finally {
    await client.$disconnect();
  }
}

async function verifyOrphanMigrationStoppedBeforeAlter(url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const gameColumns = await client.$queryRawUnsafe('PRAGMA table_info("Game")');
    const matchColumns = await client.$queryRawUnsafe('PRAGMA table_info("Match")');
    const violations = await client.$queryRawUnsafe("PRAGMA foreign_key_check");
    const migrationTables = await client.$queryRawUnsafe(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name = '_prisma_migrations'`,
    );
    assert(!gameColumns.some(({ name }) => name === "gameNumber"), "Failed migration rebuilt Game");
    assert(!matchColumns.some(({ name }) => name === "gameSeed"), "Failed migration altered Match");
    assert(violations.length === 1, "Expected the seeded legacy foreign-key violation");
    assert(migrationTables.length === 0, "Rejected legacy database was incorrectly baselined");
  } finally {
    await client.$disconnect();
  }
}

async function verifyRound2OnlyHistory(url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const applied = await client.$queryRawUnsafe(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
       ORDER BY migration_name`,
    );
    assert(
      applied.length === 1 && applied[0].migration_name === atomicMigration,
      "Round-2 predecessor fixture does not have the exact delta-only history",
    );
  } finally {
    await client.$disconnect();
  }
}

async function verifyLegacyData(url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const games = await client.$queryRawUnsafe(
      'SELECT id, gameNumber, seed FROM "Game" ORDER BY gameNumber',
    );
    const matches = await client.$queryRawUnsafe(
      'SELECT gameSeed FROM "Match" WHERE id = \'match-legacy\'',
    );
    assert(games.length === 2, "Expected two legacy games after migration");
    assert(
      games[0].id === "game-a" &&
        Number(games[0].gameNumber) === 1 &&
        Number(games[0].seed) === 101 &&
        games[1].id === "game-b" &&
        Number(games[1].gameNumber) === 2 &&
        Number(games[1].seed) === 202,
      "Legacy completed games were not deterministically numbered or preserved",
    );
    assert(
      matches.length === 1 && Number(matches[0].gameSeed) === 0,
      "Legacy in-progress Match did not receive its explicit recovery nonce",
    );
  } finally {
    await client.$disconnect();
  }
}

function verifyNoSchemaDrift(databasePath, envUrl) {
  runPrisma(
    [
      "migrate",
      "diff",
      "--from-url",
      absoluteDatabaseUrl(databasePath),
      "--to-schema-datamodel",
      currentSchema,
      "--exit-code",
    ],
    envUrl,
  );
}

function removeGeneratedDatabase(databasePath) {
  assert(dirname(databasePath) === prismaDirectory, "Refusing to remove a database outside prisma/");
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

const freshUrl = databaseUrl(freshDatabase);
const legacyUrl = databaseUrl(legacyDatabase);
const legacyFixtureUrl = legacyFixtureDatabaseUrl(legacyDatabase);
const predecessorUrl = databaseUrl(predecessorDatabase);
const predecessorAbsoluteUrl = absoluteDatabaseUrl(predecessorDatabase);
const predecessorFixtureUrl = legacyFixtureDatabaseUrl(predecessorDatabase);
const orphanUrl = databaseUrl(orphanDatabase);
const orphanFixtureUrl = legacyFixtureDatabaseUrl(orphanDatabase);

try {
  verifyReleasedMigrationIsImmutable();
  // Pre-create the exact files. This also proves the test owns each cleanup
  // target and avoids a Windows SQLite connector failure on file creation.
  closeSync(openSync(freshDatabase, "wx"));
  closeSync(openSync(legacyDatabase, "wx"));
  closeSync(openSync(predecessorDatabase, "wx"));
  closeSync(openSync(orphanDatabase, "wx"));
  closeSync(openSync(playerDatabase, "wx"));
  // Exercise the same schema-relative URL used by the local .env example.
  runDeployment(freshUrl);
  await inspectDatabase(freshUrl);
  verifyNoSchemaDrift(freshDatabase, freshUrl);
  // Starting a second time must recognize the newly completed history too.
  runDeployment(freshUrl);
  await inspectDatabase(freshUrl);

  // Reconstruct the released four-migration database (7bcb385), including
  // invitations. Confirm the additive upgrade leaves every existing row intact.
  const playerUrl = absoluteDatabaseUrl(playerDatabase);
  for (const name of [baselineMigration, atomicMigration, integrityMigration, invitationMigration]) {
    runPrisma(["db", "execute", "--file", resolve(prismaDirectory, "migrations", name, "migration.sql"), "--url", playerUrl], playerUrl);
    runPrisma(["migrate", "resolve", "--applied", name, "--schema", currentSchema], playerUrl);
  }
  const playerClient = new PrismaClient({ datasources: { db: { url: playerUrl } } });
  try {
    await playerClient.$executeRawUnsafe(`INSERT INTO "User" (id, email, displayName) VALUES ('preserved', 'preserved@example.test', 'Existing player'), ('recipient', 'recipient@example.test', 'Recipient')`);
    await playerClient.$executeRawUnsafe(`INSERT INTO "GameInvitation" (id, senderId, recipientId, pendingKey, updatedAt) VALUES ('invite', 'preserved', 'recipient', 'pair', CURRENT_TIMESTAMP)`);
    runDeployment(playerUrl);
    const users = await playerClient.user.findMany({ orderBy: { id: "asc" } });
    assert(users.length === 2 && users.every((user) => user.computerLevel === null), "Upgrade did not preserve human users");
    assert((await playerClient.gameInvitation.findUnique({ where: { id: "invite" } }))?.status === "pending", "Upgrade did not preserve the pending invitation");
    await inspectDatabase(playerUrl);
    verifyNoSchemaDrift(playerDatabase, playerUrl);
    runDeployment(playerUrl);
  } finally { await playerClient.$disconnect(); }

  runPrisma(
    ["db", "push", "--schema", legacySchema, "--skip-generate"],
    legacyFixtureUrl,
  );
  await seedLegacyDatabase(legacyUrl);
  runDeployment(absoluteDatabaseUrl(legacyDatabase));
  await inspectDatabase(legacyUrl);
  await verifyLegacyData(legacyUrl);
  verifyNoSchemaDrift(legacyDatabase, legacyUrl);

  // Reconstruct the exact accepted 11b1f48 lifecycle: the legacy schema was
  // altered by the atomic migration and only that migration was recorded.
  runPrisma(
    ["db", "push", "--schema", legacySchema, "--skip-generate"],
    predecessorFixtureUrl,
  );
  await seedLegacyDatabase(predecessorUrl);
  runPrisma(
    ["db", "execute", "--file", atomicMigrationSql, "--url", predecessorAbsoluteUrl],
    predecessorAbsoluteUrl,
  );
  runPrisma(
    ["migrate", "resolve", "--applied", atomicMigration, "--schema", currentSchema],
    predecessorAbsoluteUrl,
  );
  await verifyRound2OnlyHistory(predecessorUrl);
  runDeployment(predecessorAbsoluteUrl);
  await inspectDatabase(predecessorUrl);
  await verifyLegacyData(predecessorUrl);
  verifyNoSchemaDrift(predecessorDatabase, predecessorUrl);

  runPrisma(
    ["db", "push", "--schema", legacySchema, "--skip-generate"],
    orphanFixtureUrl,
  );
  await seedOrphanedLegacyDatabase(orphanUrl);
  const rejected = runDeployment(absoluteDatabaseUrl(orphanDatabase), { expectFailure: true });
  assert(
    `${rejected.stdout}\n${rejected.stderr}`.includes("foreign_key_check"),
    "Orphan rejection did not identify the foreign-key preflight failure",
  );
  await verifyOrphanMigrationStoppedBeforeAlter(orphanUrl);

  console.log(
    "Migration verification passed for fresh, released player-feature history, legacy db-push, exact 11b1f48 predecessor, and rejected-orphan SQLite databases.",
  );
} finally {
  removeGeneratedDatabase(freshDatabase);
  removeGeneratedDatabase(legacyDatabase);
  removeGeneratedDatabase(predecessorDatabase);
  removeGeneratedDatabase(orphanDatabase);
  removeGeneratedDatabase(playerDatabase);
}

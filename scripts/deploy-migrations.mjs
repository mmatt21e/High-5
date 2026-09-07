import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const prismaDirectory = resolve(repositoryRoot, "prisma");
const currentSchema = resolve(prismaDirectory, "schema.prisma");
const legacySchema = resolve(repositoryRoot, "scripts", "fixtures", "pre-round2.schema.prisma");
const prePlayerSchema = resolve(repositoryRoot, "scripts", "fixtures", "pre-player-features.schema.prisma");
const preComputerSchema = resolve(repositoryRoot, "scripts", "fixtures", "pre-computer.schema.prisma");
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");

const baselineMigration = "20260905000000_initial_sqlite_baseline";
const atomicMigration = "20260905150000_atomic_game_completion";
const integrityMigration = "20260905200000_verify_foreign_key_integrity";
const invitationMigration = "20260906000000_player_invitations";
const previousHistory = [baselineMigration, atomicMigration, integrityMigration];
const computerMigration = "20260907000000_computer_opponents";
const playerHistory = [...previousHistory, invitationMigration];
const completeHistory = [...playerHistory, computerMigration];
const knownHistories = new Map([
  ["", "untracked"],
  [atomicMigration, "round2"],
  [baselineMigration, "legacy-baselined"],
  [[baselineMigration, atomicMigration].join(","), "pre-integrity"],
  [previousHistory.join(","), "pre-invitations"],
  [playerHistory.join(","), "pre-computer"],
  [completeHistory.join(","), "current"],
]);

const { loadEnvConfig } = nextEnv;
loadEnvConfig(repositoryRoot, process.env.NODE_ENV === "development");

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (!configuredDatabaseUrl) {
  throw new Error("DATABASE_URL is required for migration deployment.");
}
if (!configuredDatabaseUrl.startsWith("file:")) {
  throw new Error("Migration deployment supports only the project's SQLite file: DATABASE_URL.");
}

function normalizeSqliteUrl(value) {
  const queryIndex = value.indexOf("?");
  const urlWithoutQuery = queryIndex === -1 ? value : value.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : value.slice(queryIndex);
  const configuredPath = urlWithoutQuery.slice("file:".length);
  assert(configuredPath.length > 0, "DATABASE_URL must name a SQLite database file.");
  assert(configuredPath !== ":memory:", "Migration deployment requires a persistent SQLite file.");
  const absolutePath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(prismaDirectory, configuredPath);
  return `file:${absolutePath.replaceAll("\\", "/")}${query}`;
}

const databaseUrl = normalizeSqliteUrl(configuredDatabaseUrl);

function runPrisma(args, { allowDiff = false } = {}) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !(allowDiff && result.status === 2)) {
    throw new Error(
      [`prisma ${args.join(" ")} failed`, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}

function checksumFor(migrationName) {
  const migrationPath = resolve(
    prismaDirectory,
    "migrations",
    migrationName,
    "migration.sql",
  );
  return createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readState() {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const tableRows = await client.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const tableNames = tableRows.map(({ name }) => name);
    const applicationTables = tableNames.filter(
      (name) => name !== "_prisma_migrations" && !name.startsWith("sqlite_"),
    );
    const foreignKeyViolations = await client.$queryRawUnsafe("PRAGMA foreign_key_check");
    let migrationRows = [];
    if (tableNames.includes("_prisma_migrations")) {
      migrationRows = await client.$queryRawUnsafe(
        `SELECT migration_name, checksum, finished_at, rolled_back_at
         FROM "_prisma_migrations"
         ORDER BY migration_name, started_at`,
      );
    }
    return { applicationTables, foreignKeyViolations, migrationRows };
  } finally {
    await client.$disconnect();
  }
}

function activeMigrationRows(migrationRows) {
  const incomplete = migrationRows.filter(
    ({ finished_at, rolled_back_at }) => finished_at === null && rolled_back_at === null,
  );
  assert(
    incomplete.length === 0,
    "The database contains an unfinished migration. Resolve it explicitly before retrying.",
  );

  const rolledBack = migrationRows.filter(({ rolled_back_at }) => rolled_back_at !== null);
  assert(
    rolledBack.length === 0,
    "The database contains rolled-back migration records. Review them explicitly before retrying.",
  );

  const active = migrationRows.filter(
    ({ finished_at, rolled_back_at }) => finished_at !== null && rolled_back_at === null,
  );
  const names = active.map(({ migration_name }) => migration_name);
  assert(new Set(names).size === names.length, "The database contains duplicate migration records.");
  return active;
}

function assertKnownHistory(activeRows) {
  const names = activeRows.map(({ migration_name }) => migration_name).sort();
  const key = names.join(",");
  const kind = knownHistories.get(key);
  assert(
    kind,
    `Unsupported migration history: ${key || "(none)"}. No database changes were made.`,
  );
  for (const row of activeRows) {
    assert(
      row.checksum === checksumFor(row.migration_name),
      `Checksum mismatch for applied migration ${row.migration_name}. No database changes were made.`,
    );
  }
  return { kind, names };
}

function assertSchemaMatches(schemaPath, label) {
  const result = runPrisma(
    [
      "migrate",
      "diff",
      "--from-url",
      databaseUrl,
      "--to-schema-datamodel",
      schemaPath,
      "--exit-code",
    ],
    { allowDiff: true },
  );
  assert(result.status === 0, `${label} schema does not match the expected structure. No changes made.`);
}

const initial = await readState();
assert(
  initial.foreignKeyViolations.length === 0,
  `SQLite foreign_key_check found ${initial.foreignKeyViolations.length} violation(s). No changes made.`,
);

const initialActive = activeMigrationRows(initial.migrationRows);
const { kind } = assertKnownHistory(initialActive);
const isEmpty = initial.applicationTables.length === 0;

if (kind === "untracked") {
  if (isEmpty) {
    console.log("Migration preflight: empty SQLite database.");
  } else {
    assertSchemaMatches(legacySchema, "Untracked legacy");
    console.log("Migration preflight: verified pre-migration db-push database.");
  }
} else {
  assert(!isEmpty, "Migration history exists but application tables are missing. No changes made.");
  if (kind === "legacy-baselined") {
    assertSchemaMatches(legacySchema, "Baselined legacy");
  } else if (kind === "pre-computer") {
    assertSchemaMatches(preComputerSchema, "Before computer opponents");
  } else if (kind !== "current") {
    assertSchemaMatches(prePlayerSchema, "Before player invitations");
  } else {
    assertSchemaMatches(currentSchema, "Tracked");
  }
  console.log(`Migration preflight: verified ${kind} migration history.`);
}

if ((kind === "untracked" && !isEmpty) || kind === "round2") {
  runPrisma([
    "migrate",
    "resolve",
    "--applied",
    baselineMigration,
    "--schema",
    currentSchema,
  ]);
  console.log(`Recorded verified baseline ${baselineMigration}.`);
}

runPrisma(["migrate", "deploy", "--schema", currentSchema]);

const finalState = await readState();
assert(
  finalState.foreignKeyViolations.length === 0,
  "Migration completed with SQLite foreign-key violations.",
);
const finalActive = activeMigrationRows(finalState.migrationRows);
const finalHistory = assertKnownHistory(finalActive);
assert(
  finalHistory.names.join(",") === completeHistory.join(","),
  `Migration deployment did not reach the complete history: ${finalHistory.names.join(",")}`,
);
assertSchemaMatches(currentSchema, "Deployed");

console.log(`Migration deployment verified: ${completeHistory.length} migrations applied.`);

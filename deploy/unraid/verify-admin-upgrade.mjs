// Read-only evidence for the separate, additive site-admin schema upgrade.
// Requires Node.js 22.16+ with node:sqlite. Never prints database row contents.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const [mode, databasePath, evidencePath] = process.argv.slice(2);
assert(["capture", "verify"].includes(mode) && databasePath && evidencePath, "Usage: capture|verify database evidence.json");
const db = new DatabaseSync(databasePath, { readOnly: true });
const json = value => JSON.stringify(value, (_, item) => typeof item === "bigint" ? `${item}n` : item);
const hash = value => createHash("sha256").update(json(value)).digest("hex");
try {
  assert.deepEqual(db.prepare("PRAGMA integrity_check").all().map(row => Object.values(row)[0]), ["ok"]);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  const tables = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
    const statement = db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`);
    statement.setReadBigInts(true);
    const rows = statement.all().map(row => hash(Object.entries(row))).sort();
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE tbl_name=? ORDER BY type,name").all(name);
    tables[name] = { count: rows.length, schemaHash: hash(schema), rowHashes: rows, contentHash: hash(rows) };
  }
  if (mode === "capture") {
    for (const name of ["SiteAdmin", "AdminSession", "AdminToken", "SiteContent", "CatalogGame"]) assert(!tables[name], "Expected the pre-admin schema");
    fs.writeFileSync(evidencePath, json({ tables }) + "\n", { flag: "wx", mode: 0o600 });
    console.log(json({ captured: true, tableCounts: Object.fromEntries(Object.entries(tables).map(([name, table]) => [name, table.count])) }));
  } else {
    const before = JSON.parse(fs.readFileSync(evidencePath, "utf8")).tables;
    for (const [name, old] of Object.entries(before)) {
      assert(tables[name], `Missing original table: ${name}`);
      assert.equal(tables[name].schemaHash, old.schemaHash, `Changed original schema: ${name}`);
      if (name === "_prisma_migrations") {
        assert.equal(tables[name].count, old.count + 1);
        for (const row of old.rowHashes) assert(tables[name].rowHashes.includes(row), "Changed historical migration record");
      } else assert.equal(tables[name].contentHash, old.contentHash, `Changed original data: ${name}`);
    }
    const added = Object.keys(tables).filter(name => !before[name]).sort();
    assert.deepEqual(added, ["AdminSession", "AdminToken", "CatalogGame", "SiteAdmin", "SiteContent"]);
    for (const name of ["SiteAdmin", "AdminSession", "AdminToken"]) assert.equal(tables[name].count, 0);
    assert.equal(tables.SiteContent.count, 1); assert.equal(tables.CatalogGame.count, 1);
    assert.equal(db.prepare('SELECT href FROM "CatalogGame" WHERE id=?').get("five-o").href, "/lobby");
    const migration = db.prepare('SELECT finished_at,rolled_back_at FROM "_prisma_migrations" WHERE migration_name=?').get("20260911000000_site_admin");
    assert(migration?.finished_at && !migration.rolled_back_at, "Admin migration is not complete");
    console.log(json({ verified: true, originalTablesAndRowsPreserved: true, integrity: "ok", foreignKeyViolations: 0, addedTables: added }));
  }
} finally { db.close(); }

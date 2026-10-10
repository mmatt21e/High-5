import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { ESLint } from "eslint";
import { createHash } from "node:crypto";


const require = createRequire(import.meta.url);
const repository = process.cwd();
const nextRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
const { globSync } = nextRequire("fast-glob");
let fixture;
const fixturePrefix = path.join(realpathSync(tmpdir()), "edge-lint-contract-");
const slash = value => value.replaceAll("\\", "/");

beforeAll(() => {
  fixture = mkdtempSync(fixturePrefix);
  for (const directory of ["apps/one/src/app", "apps/two/pages", "apps/.hidden", "apps/nested/three", "spaces/site one", "numbered/site1", "numbered/site2"])
    mkdirSync(path.join(fixture, directory), { recursive: true });
  writeFileSync(path.join(fixture, "apps/file.txt"), "not a directory");
  writeFileSync(path.join(fixture, "apps/two/pages/index.js"), "export default function Page() { return null; }");
  symlinkSync(path.join(fixture, "spaces"), path.join(fixture, "linked"), process.platform === "win32" ? "junction" : "dir");
});
afterAll(() => {
  if (!realpathSync(fixture).startsWith(fixturePrefix)) throw new Error("Unexpected fixture cleanup path");
  rmSync(fixture, { recursive: true, force: true });
});

// Expected sets captured from fast-glob 3.3.1 before removing it from the tree.
describe("Next root-directory glob compatibility", () => {
  it.each([
    ["apps/one", ["apps/one"]],
    ["./apps/one", ["./apps/one"]],
    ["apps/*", ["apps/nested", "apps/one", "apps/two"]],
    ["./apps/*", ["./apps/nested", "./apps/one", "./apps/two"]],
    ["apps/**", ["apps/nested", "apps/nested/three", "apps/one", "apps/one/src", "apps/one/src/app", "apps/two", "apps/two/pages"]],
    ["apps/{one,two}", ["apps/one", "apps/two"]],
    ["numbered/site{1..2}", ["numbered/site1", "numbered/site2"]],
    ["apps/@(one|two)", ["apps/one", "apps/two"]],
    ["apps/*/src/app", ["apps/one/src/app"]],
    ["spaces/*", ["spaces/site one"]],
    ["linked/*", ["linked/site one"]],
    ["missing", []],
    ["!apps/two", []],
  ])("preserves matches for %s", (pattern, expected) => {
    expect(globSync(pattern, { cwd: fixture, onlyDirectories: true }).sort()).toEqual(expected);
  });
  it("preserves absolute roots and Next's Windows separator conversion", () => {
    const root = slash(path.join(fixture, "apps/one"));
    expect(globSync(root, { onlyDirectories: true })).toEqual([root]);
    const { getRootDirs } = nextRequire("./utils/get-root-dirs.js");
    expect(getRootDirs({ cwd: repository, settings: { next: { rootDir: path.join(fixture, "apps/one") } } })).toEqual([root]);
    expect(getRootDirs({ cwd: fixture, settings: {} })).toEqual([fixture]);
    expect(getRootDirs({ cwd: repository, settings: { next: { rootDir: [root, slash(path.join(fixture, "apps/two"))] } } })).toEqual([root, slash(path.join(fixture, "apps/two"))]);
  });
  it("fails visibly for unsupported upstream contract changes", () => {
    expect(() => globSync("apps/*", { onlyFiles: true })).toThrow(/Unsupported/);
    expect(() => globSync(["apps/*"], { onlyDirectories: true })).toThrow(/Unsupported/);
    expect(() => globSync("apps/*", { onlyDirectories: true, deep: 1 })).toThrow(/Unsupported/);
  });
  it("resolves only the pinned Next plugin to the maintained adapter", () => {
    expect(readFileSync(nextRequire.resolve("fast-glob"), "utf8")).toBe(readFileSync(path.join(repository, "tools/eslint-next-glob/index.mjs"), "utf8"));
    expect(require("@next/eslint-plugin-next/package.json").version).toBe("15.5.27");
    const lock = JSON.parse(readFileSync(path.join(repository, "package-lock.json"), "utf8"));
    expect(Object.keys(lock.packages).filter(key => /node_modules\/(braces|micromatch)$/.test(key))).toEqual([]);
  });
});

function normalize(value) {
  const normalizeString = text => text.startsWith(repository) ? slash(`<ROOT>${text.slice(repository.length)}`) : text.startsWith("<ROOT>") ? slash(text) : text;
  if (typeof value === "string") return normalizeString(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [normalizeString(key), normalize(item)]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return value;
}

it("preserves the complete effective pre-replacement lint configuration", async () => {
  const baseline = JSON.parse(readFileSync(path.join(repository, "scripts/fixtures/eslint-contract.json"), "utf8"));
  const eslint = new ESLint();
  for (const [file, expected] of Object.entries(baseline)) {
    const config = await eslint.calculateConfigForFile(file);
    const actual = { rules: config.rules, settings: config.settings,
      languageOptions: { ecmaVersion: config.languageOptions.ecmaVersion, sourceType: config.languageOptions.sourceType, globals: config.languageOptions.globals, parser: config.languageOptions.parser.meta, parserOptions: config.languageOptions.parserOptions },
      linterOptions: config.linterOptions };
    expect(createHash("sha256").update(JSON.stringify(normalize(actual))).digest("hex"), file).toBe(expected);
  }
}, 30000);

it("still reports Next, React hooks, accessibility and TypeScript violations", async () => {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(`import { useState } from "react";
export default function Broken({ enabled }: { enabled: boolean }) {
 if (enabled) { useState(0); }
 const unused: any = 1;
 return <><img src="/example.png" /><a href="/admin">Admin</a></>;
}`, { filePath: "src/app/admin/contract-fixture.tsx" });
  const rules = new Set(result.messages.map(message => message.ruleId));
  for (const rule of ["react-hooks/rules-of-hooks", "@next/next/no-img-element", "jsx-a11y/alt-text", "@typescript-eslint/no-explicit-any", "@typescript-eslint/no-unused-vars"])
    expect(rules.has(rule), rule).toBe(true);
  const [valid] = await eslint.lintText('import Link from "next/link"; export default function Good() { return <Link href="/admin">Admin</Link>; }', { filePath: "src/app/admin/contract-fixture.tsx" });
  expect(valid.messages).toEqual([]);
});

it("retains Next internal-link enforcement with an explicit root-directory glob", async () => {
  const eslint = new ESLint({ overrideConfig: { settings: { next: { rootDir: `${slash(fixture)}/apps/tw*` } } } });
  const [result] = await eslint.lintText('export default function Broken() { return <a href="/">Home</a>; }', { filePath: "src/app/admin/contract-fixture.tsx" });
  expect(result.messages.some(message => message.ruleId === "@next/next/no-html-link-for-pages")).toBe(true);
});
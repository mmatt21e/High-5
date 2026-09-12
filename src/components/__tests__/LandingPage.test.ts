import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync(
  new URL("../LandingPage.tsx", import.meta.url),
  "utf8",
);
const homeSource = readFileSync(
  new URL("../../app/page.tsx", import.meta.url),
  "utf8",
);

describe("public landing page", () => {
  it("presents the verified Five-O rules and all public entry points", () => {
    expect(landingSource).toContain("Build five hands.");
    expect(landingSource).toContain("Win three.");
    expect(landingSource).toContain("Call Five-O.");
    expect(landingSource).toContain("one discard");
    expect(landingSource).toContain("3 of 5");
    expect(landingSource).toContain("5 games");
    expect(landingSource).toContain('href="/register"');
    expect(landingSource).toContain('href="/login"');
    expect(landingSource).toContain('href="/how-to-play"');
  });

  it("keeps the collection public and the authenticated lobby separate", () => {
    expect(homeSource).toContain("Edge Games");
    expect(homeSource).toContain('"/lobby" : "/login"');
    expect(homeSource).toContain('status: { in: ["live", "coming-soon"] }');
    const gamePage = readFileSync(new URL("../../app/games/five-o/page.tsx", import.meta.url), "utf8");
    expect(gamePage).toContain("<LandingPage />");
    const lobbySource = readFileSync(new URL("../../app/lobby/page.tsx", import.meta.url), "utf8");
    expect(lobbySource).toContain("<Lobby />");
    expect(lobbySource).toContain("<GameFinder />");
    expect(homeSource).not.toContain('redirect("/login")');
  });

  it("uses five complete card columns from the live card component", () => {
    expect((landingSource.match(/state: "card"/g) ?? [])).toHaveLength(20);
    expect(landingSource).toContain("Array.from({ length: 5 }");
    expect(landingSource).toContain("<FannedColumn");
    expect(landingSource).toContain('size="sm"');
  });
});

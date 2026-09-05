import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production deck randomness", () => {
  it("uses the operating system CSPRNG for the nonce and every shuffle draw", () => {
    const source = readFileSync(
      new URL("../gameManager.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain('import { randomInt } from "node:crypto"');
    expect(source).toContain("randomInt(0x80000000)");
    expect(source).toContain("randomIndex: randomInt");
    expect(source).not.toContain("{ seed, firstLead }");
  });
});

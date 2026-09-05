import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "../safeCallbackPath";
import {
  discardPayloadSchema,
  matchJoinPayloadSchema,
  placePayloadSchema,
} from "../realtime/validation";

describe("realtime payload validation", () => {
  it("normalizes a valid invite and rejects malformed payloads", () => {
    expect(matchJoinPayloadSchema.parse({ code: " abcde " })).toEqual({
      code: "ABCDE",
    });
    expect(matchJoinPayloadSchema.parse({ code: " abcdefgh " })).toEqual({
      code: "ABCDEFGH",
    });
    expect(() => matchJoinPayloadSchema.parse(null)).toThrow();
    expect(() => matchJoinPayloadSchema.parse({ code: "O0I11" })).toThrow();
    expect(() => matchJoinPayloadSchema.parse({ code: "ABCDEF" })).toThrow();
  });

  it("requires bounded integer rows and real card identifiers", () => {
    expect(placePayloadSchema.parse({ cardId: "14s", row: 3 })).toEqual({
      cardId: "14s",
      row: 3,
    });
    expect(() => placePayloadSchema.parse({ cardId: "14s", row: 1.5 })).toThrow();
    expect(() => placePayloadSchema.parse({ cardId: "14s", row: 4 })).toThrow();
    expect(() => discardPayloadSchema.parse({ cardId: "2x" })).toThrow();
  });
});

describe("authentication callback safety", () => {
  it("keeps local invite paths and rejects external redirects", () => {
    expect(safeCallbackPath("/play/ABCDE?from=invite")).toBe(
      "/play/ABCDE?from=invite",
    );
    expect(safeCallbackPath("https://evil.example/steal")).toBe("/");
    expect(safeCallbackPath("//evil.example/steal")).toBe("/");
    expect(safeCallbackPath("/\\evil.example/steal")).toBe("/");
  });
});

describe("service worker privacy policy", () => {
  it("does not cache navigations or personalized app routes", () => {
    const source = readFileSync(
      new URL("../../../public/sw.js", import.meta.url),
      "utf8",
    );
    expect(source).toContain('request.mode === "navigate"');
    expect(source).toContain('url.pathname.startsWith("/_next/static/")');
    expect(source).not.toContain('const APP_SHELL = ["/"');
    expect(source).not.toContain("caches.match(\"/\")");
  });
});

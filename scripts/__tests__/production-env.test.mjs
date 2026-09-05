import { describe, expect, it } from "vitest";
import { validateProductionEnv } from "../lib/production-env.mjs";

const vapidPublicKey = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString(
  "base64url",
);
const vapidPrivateKey = Buffer.alloc(32, 2).toString("base64url");
const validEnv = {
  DATABASE_URL: "file:./production.db",
  AUTH_SECRET: "a-real-random-secret-with-more-than-32-characters",
  AUTH_URL: "https://five-o.example.net",
  PORT: "3000",
  NEXT_PUBLIC_GOOGLE_ENABLED: "false",
};

describe("production environment validation", () => {
  it.each([
    ["minimal SQLite configuration", validEnv],
    ["localhost HTTP smoke test", { ...validEnv, AUTH_URL: "http://localhost:3000" }],
    [
      "coherent Google and VAPID configuration",
      {
        ...validEnv,
        NEXT_PUBLIC_GOOGLE_ENABLED: "true",
        AUTH_GOOGLE_ID: "client-id",
        AUTH_GOOGLE_SECRET: "client-secret",
        VAPID_SUBJECT: "mailto:ops@five-o-poker.app",
        VAPID_PUBLIC_KEY: vapidPublicKey,
        VAPID_PRIVATE_KEY: vapidPrivateKey,
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapidPublicKey,
      },
    ],
  ])("accepts %s", (_label, env) => {
    expect(validateProductionEnv(env)).toEqual([]);
  });

  it.each([
    [
      "unsupported database and development secret",
      {
        ...validEnv,
        DATABASE_URL: "postgresql://db.example.net/fiveo",
        AUTH_SECRET: "dev-secret-change-me-please-0000000000000000",
      },
      [
        "DATABASE_URL must be a SQLite file: URL",
        "AUTH_SECRET must not use an example or development placeholder",
      ],
    ],
    [
      "non-persistent SQLite and non-origin auth URL",
      {
        ...validEnv,
        DATABASE_URL: "file::memory:",
        AUTH_URL: "https://five-o.example.net/callback?unsafe=true",
      },
      [
        "DATABASE_URL must point to a persistent SQLite file",
        "AUTH_URL must be an origin without credentials, a path, query, or fragment",
      ],
    ],
    [
      "incomplete Google configuration",
      {
        ...validEnv,
        NEXT_PUBLIC_GOOGLE_ENABLED: "true",
        AUTH_GOOGLE_ID: "client-id",
      },
      [
        "AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be configured together",
        "Google sign-in is enabled but its credentials are missing",
      ],
    ],
    [
      "hidden Google provider configuration",
      {
        ...validEnv,
        AUTH_GOOGLE_ID: "client-id",
        AUTH_GOOGLE_SECRET: "client-secret",
      },
      ["Google credentials are configured but NEXT_PUBLIC_GOOGLE_ENABLED is not true"],
    ],
    [
      "partial and malformed VAPID configuration",
      {
        ...validEnv,
        VAPID_PUBLIC_KEY: "not-a-public-key",
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "different",
      },
      [
        "VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and NEXT_PUBLIC_VAPID_PUBLIC_KEY must be configured together",
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY must match VAPID_PUBLIC_KEY",
        "VAPID_PUBLIC_KEY must be an uncompressed P-256 public key encoded as base64url",
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY must be an uncompressed P-256 public key encoded as base64url",
      ],
    ],
    [
      "public HTTP auth URL",
      { ...validEnv, AUTH_URL: "http://five-o.example.net" },
      ["AUTH_URL must use HTTPS unless it points to localhost"],
    ],
  ])("rejects %s", (_label, env, expectedErrors) => {
    expect(validateProductionEnv(env)).toEqual(expect.arrayContaining(expectedErrors));
  });
});

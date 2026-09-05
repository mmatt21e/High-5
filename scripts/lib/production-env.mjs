const PLACEHOLDER_SECRET_PATTERNS = [
  /change[-_ ]?me/i,
  /dev[-_ ]?secret/i,
  /example/i,
  /placeholder/i,
];

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validAbsoluteUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isBase64UrlBytes(value, expectedBytes, expectedPrefix) {
  if (!hasValue(value) || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return (
    decoded.length === expectedBytes &&
    (expectedPrefix === undefined || decoded[0] === expectedPrefix) &&
    decoded.toString("base64url") === value
  );
}

/**
 * Return every production configuration error without logging secret values.
 * The application intentionally supports SQLite only.
 */
export function validateProductionEnv(env) {
  const errors = [];
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  const authSecret = env.AUTH_SECRET?.trim() ?? "";
  const authUrlValue = env.AUTH_URL?.trim() ?? "";

  if (!databaseUrl) {
    errors.push("DATABASE_URL is required");
  } else if (!databaseUrl.startsWith("file:")) {
    errors.push("DATABASE_URL must be a SQLite file: URL");
  } else if (!databaseUrl.slice("file:".length).trim() || /:memory:/i.test(databaseUrl)) {
    errors.push("DATABASE_URL must point to a persistent SQLite file");
  }

  if (authSecret.length < 32) {
    errors.push("AUTH_SECRET must contain at least 32 characters");
  } else if (PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(authSecret))) {
    errors.push("AUTH_SECRET must not use an example or development placeholder");
  }

  const authUrl = validAbsoluteUrl(authUrlValue);
  if (!authUrl) {
    errors.push("AUTH_URL must be an absolute URL");
  } else {
    const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      authUrl.hostname,
    );
    if (authUrl.protocol !== "https:" && !(localHost && authUrl.protocol === "http:")) {
      errors.push("AUTH_URL must use HTTPS unless it points to localhost");
    }
    if (
      authUrl.username ||
      authUrl.password ||
      authUrl.pathname !== "/" ||
      authUrl.search ||
      authUrl.hash
    ) {
      errors.push("AUTH_URL must be an origin without credentials, a path, query, or fragment");
    }
  }

  if (hasValue(env.PORT)) {
    const port = Number(env.PORT);
    if (!/^\d+$/.test(env.PORT) || !Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push("PORT must be an integer from 1 through 65535");
    }
  }

  const googleEnabled = env.NEXT_PUBLIC_GOOGLE_ENABLED?.trim() ?? "false";
  if (!['true', 'false'].includes(googleEnabled)) {
    errors.push("NEXT_PUBLIC_GOOGLE_ENABLED must be true or false");
  }
  const googleId = hasValue(env.AUTH_GOOGLE_ID);
  const googleSecret = hasValue(env.AUTH_GOOGLE_SECRET);
  if (googleId !== googleSecret) {
    errors.push("AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be configured together");
  }
  if (googleEnabled === "true" && !(googleId && googleSecret)) {
    errors.push("Google sign-in is enabled but its credentials are missing");
  }
  if (googleId && googleSecret && googleEnabled !== "true") {
    errors.push("Google credentials are configured but NEXT_PUBLIC_GOOGLE_ENABLED is not true");
  }

  const pushValues = [
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  ];
  const pushConfigured = pushValues.some(hasValue);
  if (pushConfigured) {
    if (!pushValues.every(hasValue)) {
      errors.push(
        "VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and NEXT_PUBLIC_VAPID_PUBLIC_KEY must be configured together",
      );
    }
    if (
      hasValue(env.VAPID_PUBLIC_KEY) &&
      hasValue(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
      env.VAPID_PUBLIC_KEY !== env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ) {
      errors.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY must match VAPID_PUBLIC_KEY");
    }
    if (hasValue(env.VAPID_PUBLIC_KEY) && !isBase64UrlBytes(env.VAPID_PUBLIC_KEY, 65, 4)) {
      errors.push("VAPID_PUBLIC_KEY must be an uncompressed P-256 public key encoded as base64url");
    }
    if (
      hasValue(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
      !isBase64UrlBytes(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, 65, 4)
    ) {
      errors.push(
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY must be an uncompressed P-256 public key encoded as base64url",
      );
    }
    if (hasValue(env.VAPID_PRIVATE_KEY) && !isBase64UrlBytes(env.VAPID_PRIVATE_KEY, 32)) {
      errors.push("VAPID_PRIVATE_KEY must be a 32-byte base64url value");
    }
    if (hasValue(env.VAPID_SUBJECT)) {
      const subject = env.VAPID_SUBJECT.trim();
      const subjectUrl = validAbsoluteUrl(subject);
      const validMailto =
        subjectUrl?.protocol === "mailto:" && subjectUrl.pathname.includes("@");
      const validHttps = subjectUrl?.protocol === "https:" && hasValue(subjectUrl.hostname);
      if (
        (!validMailto && !validHttps) ||
        /(?:example\.(?:com|net|org)|\.example|\.invalid|\.test)(?:[/:]|$)/i.test(subject)
      ) {
        errors.push("VAPID_SUBJECT must be a real mailto: or HTTPS contact URI");
      }
    }
  }

  return errors;
}

export function assertProductionEnv(env) {
  const errors = validateProductionEnv(env);
  if (errors.length > 0) {
    throw new Error(
      `Invalid production environment:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }
}

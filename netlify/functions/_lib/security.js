"use strict";

const { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");

const COOKIE_NAME = "vinilos_session";
const SESSION_SECONDS = 8 * 60 * 60;

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(`session:${value}`).digest("base64url");
}

function createSessionToken(secret, now = Date.now()) {
  requireSessionSecret(secret);
  const payload = encode(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_SECONDS, jti: randomBytes(16).toString("base64url") }));
  return `${payload}.${sign(payload, secret)}`;
}

function verifySessionToken(token, secret, now = Date.now()) {
  try {
    requireSessionSecret(secret);
    const [payload, signature, extra] = String(token || "").split(".");
    if (!payload || !signature || extra) return false;
    const expected = Buffer.from(sign(payload, secret));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isInteger(parsed.exp) && parsed.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

function requireSessionSecret(secret) {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("SESSION_SECRET debe contener al menos 32 bytes.");
  }
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        const rawValue = part.slice(separator + 1);
        try {
          return [part.slice(0, separator), decodeURIComponent(rawValue)];
        } catch {
          return [part.slice(0, separator), ""];
        }
      })
  );
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function sessionTokenHash(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function verifyPassword(password, encodedHash) {
  try {
    const [algorithm, n, r, p, salt, expectedHash, extra] = String(encodedHash || "").split("$");
    if (algorithm !== "scrypt" || extra) return false;
    const options = { N: Number(n), r: Number(r), p: Number(p) };
    if (options.N !== 16384 || options.r !== 8 || options.p !== 1) return false;
    const actual = scryptSync(String(password || ""), salt, 64, options);
    const expected = Buffer.from(expectedHash, "base64url");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function assertSameOrigin(event) {
  const origin = event.headers?.origin;
  if (!origin || event.headers?.["sec-fetch-site"] === "cross-site") {
    throw Object.assign(new Error("Origen no permitido."), { statusCode: 403 });
  }
  const host = event.headers?.host || event.headers?.["x-forwarded-host"];
  const configured = process.env.SITE_URL;
  const allowed = new Set();
  if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) allowed.add(`http://${host}`);
  if (configured) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      throw Object.assign(new Error("SITE_URL no es una URL válida."), { statusCode: 500 });
    }
  }
  let normalizedOrigin;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    throw Object.assign(new Error("Origen no permitido."), { statusCode: 403 });
  }
  if (!allowed.has(normalizedOrigin)) {
    throw Object.assign(new Error("Origen no permitido."), { statusCode: 403 });
  }
}

module.exports = {
  COOKIE_NAME,
  assertSameOrigin,
  clearSessionCookie,
  createSessionToken,
  parseCookies,
  sessionCookie,
  sessionTokenHash,
  SESSION_SECONDS,
  verifyPassword,
  verifySessionToken,
};

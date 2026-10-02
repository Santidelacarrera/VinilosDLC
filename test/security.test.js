"use strict";

const assert = require("node:assert/strict");
const { randomBytes, scryptSync } = require("node:crypto");
const test = require("node:test");
const {
  createSessionToken,
  assertSameOrigin,
  parseCookies,
  verifyPassword,
  verifySessionToken,
} = require("../netlify/functions/_lib/security");

test("la sesión firmada es válida hasta su expiración", () => {
  const secret = "a".repeat(32);
  const now = Date.UTC(2026, 9, 1);
  const token = createSessionToken(secret, now);
  assert.equal(verifySessionToken(token, secret, now + 1_000), true);
  assert.equal(verifySessionToken(token, secret, now + 9 * 60 * 60 * 1000), false);
});

test("la sesión rechaza firma manipulada y secretos débiles", () => {
  const secret = "b".repeat(32);
  const token = createSessionToken(secret);
  assert.equal(verifySessionToken(`${token.slice(0, -1)}x`, secret), false);
  assert.throws(() => createSessionToken("corta"), /32 bytes/);
});

test("la verificación scrypt no acepta una contraseña distinta", () => {
  const password = "correcta-y-no-publica";
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64url");
  const encoded = `scrypt$16384$8$1$${salt}$${hash}`;
  assert.equal(verifyPassword(password, encoded), true);
  assert.equal(verifyPassword("incorrecta", encoded), false);
  assert.equal(verifyPassword(password, "texto-sin-formato"), false);
});

test("el parser de cookies conserva valores que contienen igual", () => {
  assert.deepEqual(parseCookies("a=1; token=abc%3Ddef"), { a: "1", token: "abc=def" });
  assert.deepEqual(parseCookies("token=%E0%A4%A"), { token: "" });
});

test("la validación CSRF rechaza orígenes y navegación cross-site", () => {
  process.env.SITE_URL = "https://app.example";
  assert.throws(
    () => assertSameOrigin({ headers: { host: "app.example", origin: "https://evil.example" } }),
    /Origen no permitido/
  );
  assert.throws(
    () => assertSameOrigin({ headers: { host: "app.example", "sec-fetch-site": "cross-site" } }),
    /Origen no permitido/
  );
  assert.throws(
    () => assertSameOrigin({ headers: { host: "app.example" } }),
    /Origen no permitido/
  );
  assert.throws(
    () => assertSameOrigin({ headers: { host: "app.example", origin: "no-es-url" } }),
    /Origen no permitido/
  );
  assert.doesNotThrow(() => assertSameOrigin({ headers: { host: "app.example", origin: "https://app.example" } }));
});

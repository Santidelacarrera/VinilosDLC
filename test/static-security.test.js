"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("el cliente no contiene credenciales ni autenticación local", () => {
  const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  assert.doesNotMatch(app, /SUPABASE_(?:ANON|SERVICE)|ADMIN_PASSWORD|localStorage|sessionStorage/);
  assert.doesNotMatch(html, /supabase-js|<script[^>]+https:/i);
});

test("la configuración aplica CSP sin script inline", () => {
  const config = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /script-src 'self'/);
  assert.doesNotMatch(config, /script-src[^\n]*unsafe-inline/);
});

test("Netlify sólo publica la carpeta del sitio", () => {
  const config = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
  assert.match(config, /publish = "public"/);
  assert.match(config, /command = "npm run check"/);
  assert.equal(fs.existsSync(path.join(root, "public", ".env")), false);
});

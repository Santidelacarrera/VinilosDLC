"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
  "public/index.html",
  "public/style.css",
  "public/app.js",
  "netlify.toml",
  "netlify/functions/api.js",
  "netlify/functions/music.js",
  "supabase/migrations/202610010001_secure_albums.sql",
  "supabase/migrations/202610010002_music_archive.sql",
  "public/politica-de-privacidad/index.html",
  "public/politica-de-cookies/index.html",
  "public/terminos-y-condiciones/index.html",
];

for (const relative of requiredFiles) {
  assert.equal(fs.existsSync(path.join(root, relative)), true, `Falta ${relative}`);
}

new vm.Script(fs.readFileSync(path.join(root, "public/app.js"), "utf8"), { filename: "app.js" });
require(path.join(root, "netlify/functions/api.js"));
require(path.join(root, "netlify/functions/music.js"));

const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
for (const asset of ["style.css", "app.js"]) assert.match(html, new RegExp(`["']${asset}["']`));

process.stdout.write("Build estático y funciones verificados.\n");

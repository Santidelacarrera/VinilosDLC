"use strict";

// Uso: node scripts/setup-netlify-env.js
// Requiere `netlify login` y `supabase login` hechos y la carpeta vinculada a ambos.
// Carga las variables de las Functions en Netlify sin imprimir ningún secreto.
// La contraseña de admin se guarda en .env.admin-password (ignorado por git).

const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");

const SUPABASE_REF = "ujswessaedegncxeoeio";
const SITE_ID = "873f416f-7748-4fd1-9a06-f0e83d73c20b";
const SITE_URL = "https://vinilosdelacarreralantadilla.netlify.app";

const run = (args) =>
  execFileSync("npx", args, { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] });

const keys = JSON.parse(run(["supabase", "projects", "api-keys", "--project-ref", SUPABASE_REF, "-o", "json"]));
const service = keys.find((key) => key.name === "service_role" || key.id === "service_role");
if (!service?.api_key) throw new Error("No se encontró la clave service_role.");

const lines = execFileSync("node", ["scripts/generate-secrets.js"], { encoding: "utf8" }).split("\n");
const pick = (name) => lines.find((line) => line.startsWith(`${name}=`)).slice(name.length + 1);

writeFileSync(".env.admin-password", `ADMIN_PASSWORD=${pick("ADMIN_PASSWORD")}\n`, { mode: 0o600 });

const variables = {
  SUPABASE_URL: `https://${SUPABASE_REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: service.api_key,
  ADMIN_PASSWORD_HASH: pick("ADMIN_PASSWORD_HASH"),
  SESSION_SECRET: pick("SESSION_SECRET"),
  SITE_URL,
  MUSICBRAINZ_CONTACT: SITE_URL,
};

for (const [name, value] of Object.entries(variables)) {
  run(["netlify", "env:set", name, JSON.stringify(value), "--secret", "--site", SITE_ID]);
  console.log(`${name}: configurada`);
}
console.log("Listo. Contraseña de admin en .env.admin-password (no la subas a git).");

"use strict";

// Uso: node scripts/setup-netlify-env.js
// Requiere `supabase login` hecho. Genera `.env.netlify` (ignorado por git) con las
// variables de las Functions para importarlas en Netlify:
//   Site configuration > Environment variables > Add a variable > Import from a .env file
// No imprime ningún secreto. La contraseña de admin queda en `.env.admin-password`.
// Borra ambos archivos cuando termines de importar y guardar la contraseña.

const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");

const SUPABASE_REF = "ujswessaedegncxeoeio";
const SITE_URL = "https://vinilosdelacarreralantadilla.netlify.app";

const keys = JSON.parse(
  execFileSync("npx", ["supabase", "projects", "api-keys", "--project-ref", SUPABASE_REF, "-o", "json"], {
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
);
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

writeFileSync(
  ".env.netlify",
  Object.entries(variables).map(([name, value]) => `${name}='${value}'`).join("\n") + "\n",
  { mode: 0o600 }
);
console.log("Listo: .env.netlify (importar en Netlify) y .env.admin-password (tu contraseña).");

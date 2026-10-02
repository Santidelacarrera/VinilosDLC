"use strict";

const { randomBytes, scryptSync } = require("node:crypto");

const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16).toString("base64url");
const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64url");
const sessionSecret = randomBytes(48).toString("base64url");

process.stdout.write(
  [
    "Guardá la contraseña en un gestor de contraseñas; este comando no la persiste.",
    `ADMIN_PASSWORD=${password}`,
    `ADMIN_PASSWORD_HASH=scrypt$16384$8$1$${salt}$${hash}`,
    `SESSION_SECRET=${sessionSecret}`,
    "",
  ].join("\n")
);

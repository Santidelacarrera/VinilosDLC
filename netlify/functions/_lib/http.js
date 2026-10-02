"use strict";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body),
  };
}

function parseJson(event, maxBytes = 5_700_000) {
  const body = event.body || "";
  if (Buffer.byteLength(body, "utf8") > maxBytes) {
    const error = new Error("La solicitud supera el tamaño máximo permitido.");
    error.statusCode = 413;
    throw error;
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("El cuerpo JSON no es válido.");
    error.statusCode = 400;
    throw error;
  }
}

function methodNotAllowed(allowed) {
  return json(405, { error: "Método no permitido." }, { Allow: allowed.join(", ") });
}

module.exports = { json, methodNotAllowed, parseJson };

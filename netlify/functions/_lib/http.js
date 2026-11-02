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

const UNAVAILABLE_PATTERN = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR|socket hang up|network/i;

/**
 * Detecta errores de red o de disponibilidad del proveedor (DNS inexistente, proyecto
 * Supabase pausado, timeout). Se responde 503 en lugar de 500 para que el cliente
 * y los monitores distingan una caída externa de un error de la aplicación.
 */
function isUpstreamUnavailable(error) {
  if (!error || typeof error !== "object") return false;
  if (["AbortError", "TimeoutError"].includes(error.name)) return true;
  const text = [error.message, error.details, error.code, error.cause?.code, error.cause?.message]
    .filter(Boolean).map(String).join(" ");
  return UNAVAILABLE_PATTERN.test(text);
}

function serviceUnavailable(message = "El archivo no está disponible en este momento. Reintentá en unos minutos.") {
  return json(503, { error: message }, { "Retry-After": "60" });
}

module.exports = { isUpstreamUnavailable, json, methodNotAllowed, parseJson, serviceUnavailable };

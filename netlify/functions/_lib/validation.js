"use strict";

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const AUDIO_TYPES = new Map([
  ["audio/mpeg", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/ogg", "ogg"],
  ["audio/flac", "flac"],
]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

function badRequest(message) {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

function cleanString(value, field, max, required = false) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) badRequest(`${field} es obligatorio.`);
  if (result.length > max) badRequest(`${field} supera ${max} caracteres.`);
  return result;
}

function cleanUrl(value, field, options = {}) {
  const result = cleanString(value, field, 2048);
  if (!result) return "";
  let url;
  try {
    url = new URL(result);
  } catch {
    badRequest(`${field} no es una URL válida.`);
  }
  if (url.protocol !== "https:") badRequest(`${field} debe usar HTTPS.`);
  if (url.username || url.password) badRequest(`${field} no puede incluir credenciales.`);
  if (options.requiredHost && url.hostname !== options.requiredHost) {
    badRequest(`${field} debe pertenecer al almacenamiento configurado.`);
  }
  return url.href;
}

function validateCoverRights(input, hasCover = false) {
  const coverRights = input.cover_rights || "UNVERIFIED";
  if (!["UNVERIFIED", "OWN_PHOTO", "LICENSED"].includes(coverRights)) badRequest("Procedencia de portada inválida.");
  const coverRightsNote = cleanString(input.cover_rights_note, "Autorización de portada", 1000);
  if (hasCover && coverRights !== "UNVERIFIED" && coverRightsNote.length < 12) {
    badRequest("Indicá la procedencia o autorización de la portada.");
  }
  return { coverRights, coverRightsNote };
}

function validateAlbum(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) badRequest("Álbum inválido.");
  const year = input.year === null || input.year === "" ? null : Number(input.year);
  const maxYear = new Date().getUTCFullYear() + 1;
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > maxYear)) {
    badRequest(`El año debe estar entre 1900 y ${maxYear}.`);
  }
  const discos = Number(input.discos ?? 1);
  if (!Number.isInteger(discos) || discos < 1 || discos > 10) badRequest("La cantidad de LPs debe estar entre 1 y 10.");
  if (!Array.isArray(input.tracklist) || input.tracklist.length > 200) badRequest("La lista de canciones es inválida.");
  const tracklist = input.tracklist.map((track) => cleanString(track, "Cada canción", 300, true));
  const { coverRights, coverRightsNote } = validateCoverRights(input, Boolean(input.cover));
  const barcode = cleanString(input.barcode, "Código de barras", 14);
  if (barcode && !/^\d{8,14}$/.test(barcode)) badRequest("El código de barras debe tener entre 8 y 14 dígitos.");
  const country = cleanString(input.country, "País", 2).toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) badRequest("El país debe tener dos letras ISO.");

  return {
    title: cleanString(input.title, "Título", 200, true),
    artist: cleanString(input.artist, "Artista", 200, true),
    year,
    discos,
    cover: cleanUrl(input.cover, "Portada"),
    audio_url: "",
    description: cleanString(input.description, "Descripción", 5000),
    tracklist,
    barcode: barcode || null,
    label: cleanString(input.label, "Sello", 200) || null,
    catalog_number: cleanString(input.catalog_number, "Número de catálogo", 100) || null,
    country: country || null,
    format: cleanString(input.format, "Formato", 80) || null,
    cover_rights: coverRights,
    cover_rights_note: coverRightsNote || null,
  };
}

function validMagic(buffer, type) {
  if (type === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (type === "image/png") return buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (type === "image/gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (type === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (type === "audio/wav" || type === "audio/x-wav") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
  if (type === "audio/ogg") return buffer.subarray(0, 4).toString("ascii") === "OggS";
  if (type === "audio/flac") return buffer.subarray(0, 4).toString("ascii") === "fLaC";
  if (type === "audio/mp4" || type === "audio/x-m4a") return buffer.subarray(4, 8).toString("ascii") === "ftyp";
  if (type === "audio/mpeg") {
    return buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  }
  return false;
}

function validateUpload(input) {
  const bucket = input?.bucket;
  const mimeType = String(input?.mimeType || "").toLowerCase().split(";")[0];
  const types = bucket === "portadas" ? IMAGE_TYPES : bucket === "canciones" ? AUDIO_TYPES : null;
  if (!types || !types.has(mimeType)) badRequest("Tipo de archivo no permitido.");
  if (typeof input.dataBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.dataBase64)) {
    badRequest("El archivo no está codificado correctamente.");
  }
  const data = Buffer.from(input.dataBase64, "base64");
  const maxBytes = bucket === "portadas" ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (!data.length || data.length > maxBytes) badRequest(`El archivo supera el máximo de ${maxBytes / 1024 / 1024} MB.`);
  if (!validMagic(data, mimeType)) badRequest("El contenido del archivo no coincide con su tipo declarado.");
  return { bucket, mimeType, data, extension: types.get(mimeType) };
}

function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) badRequest("Identificador inválido.");
  return id;
}

module.exports = {
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  cleanString,
  cleanUrl,
  positiveId,
  validateAlbum,
  validateCoverRights,
  validateUpload,
  validMagic,
};

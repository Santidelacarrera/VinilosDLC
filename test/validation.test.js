"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateAlbum, validateCoverRights, validateUpload, validMagic } = require("../netlify/functions/_lib/validation");

const validAlbum = {
  title: " Abbey Road ",
  artist: "The Beatles",
  year: 1969,
  discos: 1,
  cover: "https://images.example.com/abbey.jpg",
  audio_url: "",
  description: "Descripción",
  tracklist: ["Come Together"],
};

test("normaliza un álbum válido", () => {
  const result = validateAlbum(validAlbum);
  assert.equal(result.title, "Abbey Road");
  assert.deepEqual(result.tracklist, ["Come Together"]);
});

test("rechaza campos, rangos y protocolos inseguros", () => {
  assert.throws(() => validateAlbum({ ...validAlbum, title: "" }), /obligatorio/);
  assert.throws(() => validateAlbum({ ...validAlbum, discos: 11 }), /entre 1 y 10/);
  assert.throws(() => validateAlbum({ ...validAlbum, cover: "http://example.com/a.jpg" }), /HTTPS/);
  assert.throws(() => validateAlbum({ ...validAlbum, tracklist: new Array(201).fill("x") }), /inválida/);
});

test("valida MIME y magic bytes, no sólo la extensión", () => {
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  assert.equal(validMagic(png, "image/png"), true);
  const upload = validateUpload({ bucket: "portadas", mimeType: "image/png", dataBase64: png.toString("base64") });
  assert.equal(upload.extension, "png");
  assert.throws(
    () => validateUpload({ bucket: "portadas", mimeType: "image/jpeg", dataBase64: png.toString("base64") }),
    /no coincide/
  );
  assert.throws(
    () => validateUpload({ bucket: "portadas", mimeType: "image/svg+xml", dataBase64: png.toString("base64") }),
    /no permitido/
  );
});

test("no permite publicar portadas sin procedencia declarada", () => {
  assert.deepEqual(validateCoverRights({ cover_rights: "OWN_PHOTO", cover_rights_note: "Fotografía tomada por el propietario" }, true), {
    coverRights: "OWN_PHOTO", coverRightsNote: "Fotografía tomada por el propietario",
  });
  assert.throws(() => validateCoverRights({ cover_rights: "LICENSED", cover_rights_note: "sin prueba" }, true), /procedencia o autorización/);
  assert.throws(() => validateCoverRights({ cover_rights: "OTHER", cover_rights_note: "nota válida de derechos" }, true), /Procedencia de portada/);
});

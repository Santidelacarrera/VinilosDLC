"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { confidence, coreRelease, searchQuery } = require("../netlify/functions/_lib/musicbrainz");

const releaseId = "11111111-1111-4111-8111-111111111111";

test("normaliza la edición exacta sin inventar pistas ni audio", () => {
  const release = coreRelease({
    id: releaseId,
    title: "Edición de prueba",
    "artist-credit": [{ name: "Artista" }],
    date: "1980-05-02",
    barcode: "12345678",
    media: [{ position: 1, format: "Vinyl", tracks: [
      { number: "A1", title: "Pista uno", length: 180000 },
      { number: "B1", title: "Pista dos", length: 210000 },
    ] }],
  });
  assert.equal(release.musicbrainzId, releaseId);
  assert.equal(release.tracks.length, 2);
  assert.equal(release.tracks[0].positionLabel, "A1");
  assert.equal(release.tracks[1].durationMs, 210000);
  assert.equal(release.year, 1980);
  assert.equal(Object.hasOwn(release.tracks[0], "audioUrl"), false);
});

test("rechaza ediciones demasiado grandes o con pistas sin título en lugar de truncarlas", () => {
  const base = { id: releaseId, title: "Prueba", "artist-credit": [{ name: "A" }] };
  assert.throws(() => coreRelease({ ...base, media: [{ tracks: Array.from({ length: 201 }, (_, index) => ({ title: `Pista ${index}` })) }] }), /excede los límites/);
  assert.throws(() => coreRelease({ ...base, media: [{ tracks: [{}] }] }), /sin título verificable/);
});

test("prioriza barcode, valida entradas y calcula confianza sin autoconfirmar", () => {
  assert.equal(searchQuery({ barcode: "12345678", title: "X", artist: "Y" }).query, "barcode:12345678");
  assert.throws(() => searchQuery({ barcode: "1 OR anything" }), /8 y 14 dígitos/);
  assert.throws(() => searchQuery({ title: "Sólo título" }), /artista y título/);
  assert.equal(confidence({ barcode: "12345678", title: "Edición", artist: "A" }, { barcode: "12345678", title: "Edición", artist: "A" }), "HIGH");
  assert.equal(confidence({ title: "Otro", artist: "B" }, { title: "Edición", artist: "A" }), "LOW");
});

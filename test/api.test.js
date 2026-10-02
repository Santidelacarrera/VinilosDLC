"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { canPlayTrack, handler, parseStoredObject, publicAlbum, routeParts } = require("../netlify/functions/api");

test("resuelve rutas reescritas y rutas directas de Functions", () => {
  assert.deepEqual(routeParts({ path: "/api/tracks/7/playback" }), ["tracks", "7", "playback"]);
  assert.deepEqual(routeParts({ path: "/.netlify/functions/api/albums" }), ["albums"]);
});

test("sólo reconoce objetos del Storage configurado", () => {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  assert.deepEqual(parseStoredObject("https://project.supabase.co/storage/v1/object/public/canciones/a%20b.mp3"), {
    bucket: "canciones",
    path: "a b.mp3",
  });
  assert.equal(parseStoredObject("https://attacker.example/storage/v1/object/public/canciones/a.mp3"), null);
  assert.equal(parseStoredObject("https://project.supabase.co/storage/v1/object/public/otro/a.mp3"), null);
});

test("normaliza filas históricas antes de enviarlas al navegador", () => {
  const album = publicAlbum({
    id: "5",
    title: "A",
    artist: "B",
    year: "<img src=x>",
    discos: "2",
    cover: "javascript:alert(1)",
    audio_url: "https://media.example/a.mp3",
    tracklist: ["x"],
    track_audio: { 0: "javascript:alert(1)", 1: "https://media.example/b.mp3", __proto__: "x" },
    updated_at: "2026-10-01T00:00:00Z",
  });
  assert.equal(album.id, 5);
  assert.equal(album.year, null);
  assert.equal(album.cover, "");
  assert.deepEqual(album.track_audio, {});
});

test("el catálogo no expone audio heredado ni notas privadas", () => {
  const album = publicAlbum({
    id: 1, title: "Test", artist: "A", cover: "https://images.example/cover.jpg",
    cover_rights: "UNVERIFIED", cover_rights_note: "Datos reservados",
    audio_url: "https://media.example/full.mp3", track_audio: { 0: "https://media.example/a.mp3" },
    tracks: [{ id: 7, title: "Pista", disc_number: 1, track_number: 1, playback_type: "FULL_AUDIO", rights_status: "UNVERIFIED" }],
    physical_copies: [{ id: 2, notes: "Dirección privada" }],
  });
  assert.equal(album.cover, "");
  assert.equal(album.audio_url, "");
  assert.equal(album.tracks[0].playbackType, "NO_AUDIO_AVAILABLE");
  assert.equal(album.copies[0].notes, "");
  assert.equal(album.coverRightsNote, null);
});

test("la URL firmada sólo se solicita para pistas con audio autorizado", () => {
  assert.equal(canPlayTrack({ rights_status: "AUTHORIZED", playback_type: "FULL_AUDIO", storage_path: "7/audio.mp3" }), true);
  assert.equal(canPlayTrack({ rights_status: "UNVERIFIED", playback_type: "FULL_AUDIO", storage_path: "7/audio.mp3" }), false);
  assert.equal(canPlayTrack({ rights_status: "REVOKED", playback_type: "FULL_AUDIO", storage_path: "7/audio.mp3" }), false);
  assert.equal(canPlayTrack({ rights_status: "AUTHORIZED", playback_type: "FULL_AUDIO", storage_path: null }), false);
});

test("rechaza mutaciones sin una sesión", async () => {
  delete process.env.SESSION_SECRET;
  const response = await handler({ httpMethod: "POST", path: "/api/albums", headers: {}, body: "{}" });
  assert.equal(response.statusCode, 401);
  const audioResponse = await handler({ httpMethod: "POST", path: "/api/tracks/7/audio", headers: {}, body: "{}" });
  assert.equal(audioResponse.statusCode, 401);
  const oldRoute = await handler({ httpMethod: "PUT", path: "/api/albums/7/track-audio", headers: {}, body: "{}" });
  assert.equal(oldRoute.statusCode, 404);
});

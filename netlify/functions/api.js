"use strict";

const { randomUUID } = require("node:crypto");
const { json, methodNotAllowed, parseJson } = require("./_lib/http");
const { createStoredSession, hasStoredSession, revokeStoredSession } = require("./_lib/auth");
const { clearLoginAttempts, consumeLoginAttempt } = require("./_lib/login-rate");
const {
  assertSameOrigin,
  clearSessionCookie,
  sessionCookie,
  verifyPassword,
} = require("./_lib/security");
const { getSupabase, storageHost } = require("./_lib/supabase");
const { cleanString, positiveId, validateAlbum, validateCoverRights, validateUpload } = require("./_lib/validation");

const ALBUM_FIELDS = "id,title,artist,year,discos,cover,audio_url,description,tracklist,track_audio,updated_at,musicbrainz_id,release_group_id,barcode,label,catalog_number,country,format,metadata_source,cover_rights,cover_rights_note,tracks(id,disc_number,track_number,position_label,title,artist,duration_ms,musicbrainz_recording_id,isrc,playback_type,rights_status,provider),physical_copies(id,media_condition,sleeve_condition,notes)";

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function publicAlbum(row, admin = false) {
  const coverVerified = ["OWN_PHOTO", "LICENSED"].includes(row?.cover_rights) ||
    (row?.cover_rights === "ARCHIVE_REFERENCE" && String(row?.cover || "").startsWith("https://coverartarchive.org/"));
  return {
    id: Number.isSafeInteger(Number(row?.id)) ? Number(row.id) : 0,
    title: String(row?.title || "").slice(0, 200),
    artist: String(row?.artist || "").slice(0, 200),
    year: Number.isInteger(Number(row?.year)) ? Number(row.year) : null,
    discos: Number.isInteger(Number(row?.discos)) ? Number(row.discos) : 1,
    cover: coverVerified ? safeHttpsUrl(row?.cover) : "",
    audio_url: "",
    description: String(row?.description || "").slice(0, 5000),
    tracklist: Array.isArray(row?.tracklist) ? row.tracklist.slice(0, 200).map((value) => String(value).slice(0, 300)) : [],
    track_audio: {},
    tracks: Array.isArray(row?.tracks) ? row.tracks.map((track) => ({
      id: Number(track.id),
      discNumber: Number(track.disc_number),
      trackNumber: Number(track.track_number),
      positionLabel: String(track.position_label || ""),
      title: String(track.title || "").slice(0, 300),
      artist: String(track.artist || "").slice(0, 200),
      durationMs: Number.isInteger(track.duration_ms) ? track.duration_ms : null,
      recordingId: track.musicbrainz_recording_id || null,
      isrc: track.isrc || null,
      playbackType: track.rights_status === "AUTHORIZED" ? track.playback_type : "NO_AUDIO_AVAILABLE",
      provider: track.provider || null,
    })).sort((a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber) : [],
    copies: Array.isArray(row?.physical_copies) ? row.physical_copies.map((copy) => ({
      id: Number(copy.id),
      mediaCondition: copy.media_condition || null,
      sleeveCondition: copy.sleeve_condition || null,
      notes: admin ? String(copy.notes || "").slice(0, 2000) : "",
    })) : [],
    musicbrainzId: row?.musicbrainz_id || null,
    barcode: row?.barcode || null,
    label: row?.label || null,
    catalogNumber: row?.catalog_number || null,
    country: row?.country || null,
    format: row?.format || null,
    metadataSource: row?.metadata_source || null,
    coverRights: row?.cover_rights || "UNVERIFIED",
    coverRightsNote: admin ? row?.cover_rights_note || null : null,
    updated_at: typeof row?.updated_at === "string" ? row.updated_at : "",
  };
}

function routeParts(event) {
  const path = event.path || event.rawPath || "";
  const marker = path.includes("/.netlify/functions/api") ? "/.netlify/functions/api" : "/api";
  return path
    .slice(path.indexOf(marker) + marker.length)
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
}

async function requireAuth(event) {
  if (!(await hasStoredSession(event))) {
    throw Object.assign(new Error("Sesión no válida o vencida."), { statusCode: 401 });
  }
}

async function requireMutation(event) {
  await requireAuth(event);
  assertSameOrigin(event);
}

async function albumsResponse(event) {
  const admin = await hasStoredSession(event);
  const { data, error } = await getSupabase().from("albums").select(ALBUM_FIELDS).order("id", { ascending: true });
  if (error) throw error;
  return json(200, { albums: (data || []).map((row) => publicAlbum(row, admin)) });
}

async function createAlbum(event) {
  await requireMutation(event);
  const album = validateAlbum(parseJson(event).album);
  const { data: possible, error: possibleError } = await getSupabase().from("albums")
    .select("id,title,artist,barcode,catalog_number").ilike("title", album.title).ilike("artist", album.artist).limit(10);
  if (possibleError) throw possibleError;
  if ((possible || []).some((item) => (item.barcode || "") === (album.barcode || "") &&
    (item.catalog_number || "") === (album.catalog_number || ""))) {
    return json(409, { error: "Esta edición posiblemente ya está en la colección. Revisá la ficha existente." });
  }
  const { data, error } = await getSupabase().from("albums").insert(album).select(ALBUM_FIELDS).single();
  if (error) throw error;
  const { data: refreshed, error: refreshError } = await getSupabase().from("albums").select(ALBUM_FIELDS).eq("id", data.id).single();
  if (refreshError) throw refreshError;
  return json(201, { album: publicAlbum(refreshed) });
}

async function updateAlbum(event, id) {
  await requireMutation(event);
  const { data: existing, error: existingError } = await getSupabase()
    .from("albums")
    .select("cover,audio_url,metadata_source,tracklist")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return json(404, { error: "Álbum no encontrado." });
  const body = parseJson(event);
  const album = validateAlbum(body.album);
  if (existing.metadata_source === "MusicBrainz" && JSON.stringify(album.tracklist) !== JSON.stringify(existing.tracklist)) {
    return json(400, { error: "Corregí las pistas importadas desde la ficha de cada canción." });
  }
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  if (!expectedUpdatedAt) throw Object.assign(new Error("Falta la versión del registro."), { statusCode: 400 });
  const nextUpdatedAt = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("albums")
    .update({ ...album, updated_at: nextUpdatedAt })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(ALBUM_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) return json(409, { error: "El álbum cambió en otra operación. Actualizá el catálogo y reintentá." });
  await removeStoredObjects([
    existing.cover && existing.cover !== album.cover ? existing.cover : "",
    existing.audio_url && existing.audio_url !== album.audio_url ? existing.audio_url : "",
  ]);
  return json(200, { album: publicAlbum(data) });
}

function parseStoredObject(publicUrl) {
  if (!publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    if (url.hostname !== storageHost()) return null;
    const match = url.pathname.match(/^\/storage\/v1\/object\/public\/(portadas|canciones)\/(.+)$/);
    return match ? { bucket: match[1], path: decodeURIComponent(match[2]) } : null;
  } catch {
    return null;
  }
}

async function removeStoredObjects(urls) {
  const grouped = new Map();
  for (const value of new Set(urls.filter(Boolean))) {
    const object = parseStoredObject(value);
    if (!object) continue;
    if (!grouped.has(object.bucket)) grouped.set(object.bucket, []);
    grouped.get(object.bucket).push(object.path);
  }
  for (const [bucket, paths] of grouped) {
    const { error } = await getSupabase().storage.from(bucket).remove(paths);
    if (error) console.error("No se pudo limpiar un objeto de Storage", { bucket, count: paths.length });
  }
}

async function deleteAlbum(event, id) {
  await requireMutation(event);
  const { data: existing, error: readError } = await getSupabase()
    .from("albums")
    .select("cover,audio_url,track_audio,tracks(storage_path)")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) return json(404, { error: "Álbum no encontrado." });
  const { error } = await getSupabase().from("albums").delete().eq("id", id);
  if (error) throw error;
  await removeStoredObjects([existing.cover, existing.audio_url, ...Object.values(existing.track_audio || {})]);
  const paths = (existing.tracks || []).map((track) => track.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await getSupabase().storage.from("canciones").remove(paths);
    if (storageError) console.error("No se pudieron limpiar audios privados", { count: paths.length });
  }
  return { statusCode: 204, headers: { "Cache-Control": "no-store" }, body: "" };
}

async function upload(event) {
  await requireMutation(event);
  const payload = parseJson(event);
  const { coverRights } = validateCoverRights(payload, true);
  if (coverRights === "UNVERIFIED") return json(400, { error: "Una portada sin procedencia verificada no puede subirse a un bucket público." });
  const file = validateUpload(payload);
  if (file.bucket !== "portadas") return json(400, { error: "El audio se carga desde una canción con su autorización." });
  const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${file.extension}`;
  const { error } = await getSupabase().storage.from(file.bucket).upload(path, file.data, {
    cacheControl: "31536000",
    contentType: file.mimeType,
    upsert: false,
  });
  if (error) throw error;
  const { data } = getSupabase().storage.from(file.bucket).getPublicUrl(path);
  return json(201, { url: data.publicUrl });
}

function canPlayTrack(track) {
  return track?.rights_status === "AUTHORIZED" && track.playback_type === "FULL_AUDIO" && Boolean(track.storage_path);
}

async function trackPlayback(id) {
  const { data, error } = await getSupabase().from("tracks")
    .select("id,storage_path,rights_status,playback_type")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return json(404, { error: "Canción no encontrada." });
  if (!canPlayTrack(data)) {
    return json(403, { error: "Esta canción no tiene audio autorizado disponible." });
  }
  const { data: signed, error: signError } = await getSupabase().storage.from("canciones").createSignedUrl(data.storage_path, 300);
  if (signError) throw signError;
  return json(200, { url: signed.signedUrl, expiresIn: 300, playbackType: "FULL_AUDIO" });
}

async function uploadTrackAudio(event, id) {
  await requireMutation(event);
  const payload = parseJson(event);
  const evidence = cleanString(payload.rightsEvidence, "Autorización de audio", 1000, true);
  if (evidence.length < 20) return json(400, { error: "Describí quién autoriza la reproducción pública de este audio." });
  const file = validateUpload({ ...payload, bucket: "canciones" });
  const { data: track, error: readError } = await getSupabase().from("tracks").select("id,storage_path").eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (!track) return json(404, { error: "Canción no encontrada." });
  const path = `${id}/${randomUUID()}.${file.extension}`;
  const { error: uploadError } = await getSupabase().storage.from("canciones").upload(path, file.data, {
    contentType: file.mimeType,
    cacheControl: "300",
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { error } = await getSupabase().from("tracks").update({
    storage_path: path,
    rights_status: "AUTHORIZED",
    playback_type: "FULL_AUDIO",
    rights_evidence: evidence,
    provider: "Propietario de la colección",
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) {
    await getSupabase().storage.from("canciones").remove([path]);
    throw error;
  }
  if (track.storage_path) await getSupabase().storage.from("canciones").remove([track.storage_path]);
  return json(200, { uploaded: true });
}

async function revokeTrackAudio(event, id) {
  await requireMutation(event);
  const { data: track, error: readError } = await getSupabase().from("tracks").select("id,storage_path").eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (!track) return json(404, { error: "Canción no encontrada." });
  const { error } = await getSupabase().from("tracks").update({
    storage_path: null, rights_status: "REVOKED", playback_type: "NO_AUDIO_AVAILABLE",
    rights_evidence: null, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
  if (track.storage_path) await getSupabase().storage.from("canciones").remove([track.storage_path]);
  return json(200, { revoked: true });
}

async function updateTrackMetadata(event, id) {
  await requireMutation(event);
  const body = parseJson(event, 10_000);
  const title = cleanString(body.title, "Título de pista", 300, true);
  const artist = cleanString(body.artist, "Artista de pista", 200) || null;
  const { data, error } = await getSupabase().from("tracks").update({
    title, artist, metadata_source: "Corrección manual", updated_at: new Date().toISOString(),
  }).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return json(404, { error: "Canción no encontrada." });
  return json(200, { updated: true });
}

function copyFields(body) {
  const allowed = new Set(["M", "NM", "VG+", "VG", "G+", "G", "F", "P"]);
  const mediaCondition = body.mediaCondition || null;
  const sleeveCondition = body.sleeveCondition || null;
  if ((mediaCondition && !allowed.has(mediaCondition)) || (sleeveCondition && !allowed.has(sleeveCondition))) {
    throw Object.assign(new Error("Estado de conservación inválido."), { statusCode: 400 });
  }
  return { media_condition: mediaCondition, sleeve_condition: sleeveCondition, notes: cleanString(body.notes, "Notas", 2000) || null };
}

async function createCopy(event, albumId) {
  await requireMutation(event);
  const { data: album, error: readError } = await getSupabase().from("albums").select("id").eq("id", albumId).maybeSingle();
  if (readError) throw readError;
  if (!album) return json(404, { error: "Edición no encontrada." });
  const fields = copyFields(parseJson(event, 10_000));
  const { data, error } = await getSupabase().from("physical_copies").insert({ album_id: albumId, ...fields }).select("id").single();
  if (error) throw error;
  return json(201, { copyId: data.id });
}

async function updateCopy(event, copyId) {
  await requireMutation(event);
  const fields = copyFields(parseJson(event, 10_000));
  const { data, error } = await getSupabase().from("physical_copies").update(fields).eq("id", copyId).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return json(404, { error: "Copia no encontrada." });
  return json(200, { updated: true });
}

async function login(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  assertSameOrigin(event);
  if (!(await consumeLoginAttempt(event))) {
    return json(429, { error: "Demasiados intentos. Esperá 15 minutos antes de reintentar." }, { "Retry-After": "900" });
  }
  const password = parseJson(event, 10_000).password;
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;
  if (!configuredHash) throw new Error("Falta configurar ADMIN_PASSWORD_HASH.");
  if (!verifyPassword(password, configuredHash)) return json(401, { error: "Credenciales inválidas." });
  await clearLoginAttempts(event);
  const token = await createStoredSession();
  return json(200, { authenticated: true }, { "Set-Cookie": sessionCookie(token) });
}

async function handler(event) {
  try {
    const [resource, idValue, action] = routeParts(event);
    const method = event.httpMethod;

    if (resource === "login") return await login(event);
    if (resource === "logout") {
      if (method !== "POST") return methodNotAllowed(["POST"]);
      assertSameOrigin(event);
      await revokeStoredSession(event);
      return json(200, { authenticated: false }, { "Set-Cookie": clearSessionCookie() });
    }
    if (resource === "session") {
      if (method !== "GET") return methodNotAllowed(["GET"]);
      return json(200, { authenticated: await hasStoredSession(event) });
    }
    if (resource === "upload") {
      if (method !== "POST") return methodNotAllowed(["POST"]);
      return await upload(event);
    }
    if (resource === "tracks") {
      const id = positiveId(idValue);
      if (action === "playback" && method === "GET") return await trackPlayback(id);
      if (action === "audio" && method === "POST") return await uploadTrackAudio(event, id);
      if (action === "audio" && method === "DELETE") return await revokeTrackAudio(event, id);
      if (!action && method === "PUT") return await updateTrackMetadata(event, id);
      return methodNotAllowed(["GET", "POST", "DELETE", "PUT"]);
    }
    if (resource === "copies") {
      const copyId = positiveId(idValue);
      if (method === "PUT") return await updateCopy(event, copyId);
      return methodNotAllowed(["PUT"]);
    }
    if (resource !== "albums") return json(404, { error: "Ruta no encontrada." });

    if (!idValue) {
      if (method === "GET") return await albumsResponse(event);
      if (method === "POST") return await createAlbum(event);
      return methodNotAllowed(["GET", "POST"]);
    }

    const id = positiveId(idValue);
    if (action === "copies") {
      if (method !== "POST") return methodNotAllowed(["POST"]);
      return await createCopy(event, id);
    }
    if (action) return json(404, { error: "Ruta no encontrada." });
    if (method === "PUT") return await updateAlbum(event, id);
    if (method === "DELETE") return await deleteAlbum(event, id);
    return methodNotAllowed(["PUT", "DELETE"]);
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (statusCode >= 500) console.error("Error de API", { name: error.name, message: error.message });
    return json(statusCode, {
      error: statusCode >= 500 ? "Error interno del servidor." : error.message,
    });
  }
}

module.exports = { canPlayTrack, handler, parseStoredObject, publicAlbum, routeParts, safeHttpsUrl };

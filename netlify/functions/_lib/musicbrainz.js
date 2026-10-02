"use strict";

const { getSupabase } = require("./supabase");

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function artistCredit(parts) {
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => typeof part === "string" ? part : String(part?.name || "") + String(part?.joinphrase || "")).join("").trim();
}

function coreRelease(source) {
  if (!source || !MBID.test(source.id || "")) throw new Error("Edición inválida del proveedor.");
  const media = Array.isArray(source.media) ? source.media : [];
  if (media.length > 10 || media.some((medium) => !Array.isArray(medium.tracks) || medium.tracks.length > 200) ||
    media.reduce((count, medium) => count + medium.tracks.length, 0) > 200) {
    throw Object.assign(new Error("La edición excede los límites del archivo; registrala manualmente."), { statusCode: 422 });
  }
  const tracks = media.flatMap((medium, mediumIndex) => {
    const discNumber = Number.isInteger(Number(medium.position)) ? Number(medium.position) : mediumIndex + 1;
    return medium.tracks.map((track, index) => ({
      discNumber,
      trackNumber: index + 1,
      positionLabel: String(track.number || "").slice(0, 12),
      title: String(track.title || track.recording?.title || "").trim().slice(0, 300),
      artist: artistCredit(track["artist-credit"] || track.recording?.["artist-credit"]).slice(0, 200) || null,
      durationMs: Number.isInteger(Number(track.length)) && Number(track.length) >= 0 ? Number(track.length) : null,
      recordingId: MBID.test(track.recording?.id || "") ? track.recording.id : null,
      isrc: Array.isArray(track.recording?.isrcs) ? String(track.recording.isrcs[0] || "").slice(0, 12) || null : null,
    }));
  });
  if (tracks.some((track) => !track.title)) {
    throw Object.assign(new Error("La edición contiene pistas sin título verificable."), { statusCode: 422 });
  }

  const labelInfo = Array.isArray(source["label-info"]) ? source["label-info"][0] : null;
  const year = /^\d{4}/.test(source.date || "") ? Number(source.date.slice(0, 4)) : null;
  return {
    musicbrainzId: source.id,
    releaseGroupId: MBID.test(source["release-group"]?.id || "") ? source["release-group"].id : null,
    title: String(source.title || "").trim().slice(0, 200),
    artist: artistCredit(source["artist-credit"]).slice(0, 200),
    year,
    barcode: /^\d{8,14}$/.test(source.barcode || "") ? source.barcode : null,
    label: String(labelInfo?.label?.name || "").slice(0, 200) || null,
    catalogNumber: String(labelInfo?.["catalog-number"] || "").slice(0, 100) || null,
    country: /^[A-Z]{2}$/.test(source.country || "") ? source.country : null,
    format: String(media[0]?.format || "").slice(0, 80) || null,
    discCount: media.length || 1,
    tracks,
    sourceUrl: `https://musicbrainz.org/release/${source.id}`,
  };
}

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

function confidence(release, query) {
  let score = 0;
  if (query.barcode && release.barcode === query.barcode) score += 70;
  if (query.title && normalized(release.title) === normalized(query.title)) score += 15;
  if (query.artist && normalized(release.artist) === normalized(query.artist)) score += 15;
  if (query.catalogNumber && normalized(release.catalogNumber) === normalized(query.catalogNumber)) score += 20;
  if (query.year && release.year === Number(query.year)) score += 5;
  return score >= 80 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW";
}

function searchQuery(input) {
  const barcode = String(input.barcode || "").trim();
  const title = String(input.title || "").trim().slice(0, 100);
  const artist = String(input.artist || "").trim().slice(0, 100);
  const catalogNumber = String(input.catalogNumber || "").trim().slice(0, 50);
  if (barcode && !/^\d{8,14}$/.test(barcode)) throw Object.assign(new Error("El código de barras debe tener entre 8 y 14 dígitos."), { statusCode: 400 });
  if (!barcode && (!title || !artist)) throw Object.assign(new Error("Ingresá un código de barras o artista y título."), { statusCode: 400 });
  const escaped = (value) => value.replace(/[\\+\-&|!(){}\[\]^"~*?:/]/g, " ").replace(/\s+/g, " ").trim();
  const query = barcode ? `barcode:${barcode}` : `release:"${escaped(title)}" AND artist:"${escaped(artist)}"`;
  return { query: catalogNumber ? `${query} AND catno:"${escaped(catalogNumber)}"` : query, barcode, title, artist, catalogNumber };
}

async function callMusicBrainz(path) {
  const contact = process.env.MUSICBRAINZ_CONTACT || process.env.SITE_URL;
  if (!contact || !/^https:\/\/[^\s]+$/.test(contact)) {
    throw Object.assign(new Error("Falta configurar MUSICBRAINZ_CONTACT con una URL HTTPS de contacto."), { statusCode: 503 });
  }
  const { data: reserved, error: reserveError } = await getSupabase().rpc("reserve_musicbrainz_call");
  if (reserveError) throw reserveError;
  if (!reserved) throw Object.assign(new Error("MusicBrainz permite una consulta por segundo. Reintentá en un momento."), { statusCode: 429 });
  const response = await fetch(`https://musicbrainz.org/ws/2/${path}`, {
    headers: { Accept: "application/json", "User-Agent": `VinilosDeLaCarrera/1.0 (${contact})` },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 404) throw Object.assign(new Error("La edición no existe en MusicBrainz."), { statusCode: 404 });
  if (!response.ok) throw Object.assign(new Error("MusicBrainz no respondió. Reintentá más tarde."), { statusCode: 502 });
  return response.json();
}

async function lookupRelease(id, forceRefresh = false) {
  if (!MBID.test(id)) throw Object.assign(new Error("Identificador de edición inválido."), { statusCode: 400 });
  if (!forceRefresh) {
    const { data, error } = await getSupabase().from("music_metadata_cache").select("payload")
      .eq("release_id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw error;
    if (data) return data.payload;
  }
  const response = await callMusicBrainz(`release/${id}?inc=artist-credits+labels+recordings+release-groups+isrcs&fmt=json`);
  const release = coreRelease(response);
  const { error } = await getSupabase().from("music_metadata_cache").upsert({
    release_id: id,
    payload: release,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    refreshed_at: new Date().toISOString(),
  });
  if (error) throw error;
  return release;
}

module.exports = { MBID, artistCredit, callMusicBrainz, confidence, coreRelease, lookupRelease, searchQuery };

"use strict";

const { json, methodNotAllowed, parseJson } = require("./_lib/http");
const { hasStoredSession } = require("./_lib/auth");
const { assertSameOrigin } = require("./_lib/security");
const { getSupabase } = require("./_lib/supabase");
const { callMusicBrainz, confidence, lookupRelease, searchQuery } = require("./_lib/musicbrainz");

async function handler(event) {
  try {
    if (!(await hasStoredSession(event))) return json(401, { error: "Iniciá sesión para consultar metadatos." });
    const mode = event.queryStringParameters?.mode;
    if (mode === "search") {
      if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
      const query = searchQuery(event.queryStringParameters || {});
      const response = await callMusicBrainz(`release?query=${encodeURIComponent(query.query)}&limit=8&fmt=json`);
      const candidates = (Array.isArray(response.releases) ? response.releases : []).slice(0, 8).map((item) => {
        const labelInfo = Array.isArray(item["label-info"]) ? item["label-info"][0] : null;
        const release = {
          id: item.id,
          title: String(item.title || "").slice(0, 200),
          artist: Array.isArray(item["artist-credit"]) ? item["artist-credit"].map((part) => typeof part === "string" ? part : `${part.name || ""}${part.joinphrase || ""}`).join("") : "",
          year: /^\d{4}/.test(item.date || "") ? Number(item.date.slice(0, 4)) : null,
          barcode: item.barcode || null,
          label: labelInfo?.label?.name || null,
          catalogNumber: labelInfo?.["catalog-number"] || null,
          country: item.country || null,
        };
        return { ...release, confidence: confidence(release, query) };
      });
      return json(200, { candidates, source: "MusicBrainz" });
    }
    if (mode === "release") {
      if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
      const release = await lookupRelease(String(event.queryStringParameters?.id || ""), event.queryStringParameters?.refresh === "1");
      return json(200, { release });
    }
    if (mode === "import") {
      if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
      assertSameOrigin(event);
      const body = parseJson(event, 10_000);
      if (body.confirm !== true) return json(400, { error: "Confirmá la edición antes de importarla." });
      const release = await lookupRelease(String(body.id || ""));
      if (!release.tracks.length) return json(422, { error: "La edición no tiene una lista de canciones verificable." });
      const { data: existing, error: readError } = await getSupabase().from("albums").select("id")
        .eq("musicbrainz_id", release.musicbrainzId).maybeSingle();
      if (readError) throw readError;
      if (existing) return json(409, { error: "Esta edición ya está en la colección.", albumId: existing.id });
      const duplicateQuery = getSupabase().from("albums")
        .select("id,title,artist,barcode,catalog_number,musicbrainz_id").limit(10);
      const { data: possible, error: possibleError } = release.barcode
        ? await duplicateQuery.eq("barcode", release.barcode)
        : await duplicateQuery.ilike("title", release.title).ilike("artist", release.artist);
      if (possibleError) throw possibleError;
      const likely = (possible || []).filter((item) =>
        item.musicbrainz_id !== release.musicbrainzId &&
        (!release.catalogNumber || !item.catalog_number || item.catalog_number === release.catalogNumber));
      if (likely.length && body.confirmPossibleDuplicate !== true) {
        return json(409, {
          error: "Hay una posible edición duplicada. Compará sello, catálogo y código antes de continuar.",
          possibleDuplicates: likely.map((item) => ({ id: item.id, title: item.title, artist: item.artist, catalogNumber: item.catalog_number })),
        });
      }
      const { data: id, error } = await getSupabase().rpc("import_musicbrainz_release", { p_release: release });
      if (error) {
        if (error.code === "23505") return json(409, { error: "Esta edición ya está en la colección." });
        throw error;
      }
      return json(201, { albumId: id });
    }
    return json(404, { error: "Ruta no encontrada." });
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error.name === "TimeoutError" ? 504 : 500);
    if (statusCode >= 500) console.error("Music metadata request failed", { name: error.name, message: error.message });
    return json(statusCode, { error: statusCode >= 500 ? "No se pudo consultar la fuente musical. Reintentá más tarde." : error.message });
  }
}

module.exports = { handler };

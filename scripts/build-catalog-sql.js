"use strict";

// Uso: node scripts/build-catalog-sql.js <salida.sql>
// Busca cada disco en MusicBrainz (1 consulta/seg, User-Agent con contacto) y genera SQL que
// llama a public.import_musicbrainz_release(). Solo metadatos y listas de canciones: sin audio
// ni portadas. Aplicar con: npx supabase db query --linked -f <salida.sql>

const { writeFileSync } = require("node:fs");
const seen = new Set();
const { coreRelease, confidence } = require("../netlify/functions/_lib/musicbrainz");

const CONTACT = "https://vinilosdelacarreralantadilla.netlify.app";
const ALBUMS = [
  ["Sui Generis", "Adiós Sui Generis"],
  ["Sui Generis", "Adiós Sui Generis"],
  ["Barry White", "The Singles Collection"],
  ["Bob Dylan", "Bob Dylan's Greatest Hits Vol. 3"],
  ["David Bowie", "Live Rio"],
  ["Dire Straits", "Private Investigations"],
  ["Myriam Hernández", "Grandes éxitos"],
  ["Lucybell", "Mil caminos"],
  ["Pearl Jam", "Live at the Orlando Arena"],
  ["Simon & Garfunkel", "Greatest Hits"],
  ["Simply Red", "Greatest Hits"],
  ["Stevie Wonder", "Live at Las Vegas"],
  ["Bee Gees", "Grandes canciones"],
  ["Santana", "The Many Faces of Santana"],
  ["Stevie Wonder", "The Many Faces of Stevie Wonder"],
  ["Amy Winehouse", "Back to Black"],
  ["Duran Duran", "Notorious"],
  ["Madonna", "Like a Prayer"],
  ["Prince", "Sign o' the Times"],
  ["The Beatles", "Let It Be"],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function mb(path) {
  await sleep(1150);
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`https://musicbrainz.org/ws/2/${path}`, {
      headers: { Accept: "application/json", "User-Agent": `VinilosDeLaCarrera/1.0 (${CONTACT})` },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return response.json();
    if (response.status !== 503) throw new Error(`MusicBrainz ${response.status}`);
    await sleep(3000);
  }
  throw new Error("MusicBrainz no disponible");
}

const clean = (value) => value.replace(/[\\+\-&|!(){}\[\]^"~*?:/]/g, " ").replace(/\s+/g, " ").trim();

async function find([artist, title]) {
  const found = await mb(`release?query=${encodeURIComponent(`release:(${clean(title)}) AND artist:"${clean(artist)}" AND status:official`)}&limit=25&fmt=json`);
  const candidates = (found.releases || []).filter((item) => item.score >= 70 && !seen.has(item.id));
  const rank = (item) => {
    const count = (item.media || []).reduce((sum, medium) => sum + (medium["track-count"] || 0), 0);
    const format = (item.media || []).map((medium) => medium.format || "").join(" ");
    return [(count >= 6 ? 0 : 2) + (/vinyl/i.test(format) ? 0 : 1), item.date || "9999"];
  };
  candidates.sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || String(x[1]).localeCompare(String(y[1])); });
  for (const candidate of candidates.slice(0, 3)) {
    const full = await mb(`release/${candidate.id}?inc=artist-credits+labels+recordings+release-groups+isrcs&fmt=json`);
    try {
      const release = coreRelease(full);
      if (release.tracks.length >= 6) return release;
    } catch { /* probar el siguiente candidato */ }
  }
  return null;
}

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error("Indicá el archivo de salida.");
  const parts = ["-- Generado por scripts/build-catalog-sql.js (metadatos de MusicBrainz, sin audio ni portadas)"];
  const missing = [];
  for (const entry of ALBUMS) {
    const release = await find(entry).catch((error) => { console.error(`${entry[0]} - ${entry[1]}: ${error.message}`); return null; });
    if (!release || seen.has(release.musicbrainzId)) { missing.push(entry.join(" - ")); continue; }
    seen.add(release.musicbrainzId);
    console.log(`OK  ${release.artist} - ${release.title} (${release.year || "?"}, ${release.tracks.length} pistas, ${release.format || "?"})`);
    const { sourceUrl, ...payload } = release;
    const json = JSON.stringify(payload).replace(/\$/g, "\\u0024");
    parts.push(`do $import$ begin perform public.import_musicbrainz_release($j$${json}$j$::jsonb); exception when unique_violation then null; end $import$;`);
  }
  writeFileSync(out, parts.join("\n") + "\n");
  console.log(`\nGenerado ${out}. Sin coincidencia (${missing.length}):\n${missing.join("\n")}`);
})().catch((error) => { console.error(error.message); process.exit(1); });

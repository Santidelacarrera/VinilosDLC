"use strict";

// Uso: node scripts/build-catalog-sql.js <salida.sql>
// Busca cada disco en MusicBrainz (1 consulta/seg, User-Agent con contacto) y genera SQL que
// llama a public.import_musicbrainz_release(). Solo metadatos y listas de canciones: sin audio
// ni portadas. Aplicar con: npx supabase db query --linked -f <salida.sql>

const { writeFileSync } = require("node:fs");
const { coreRelease, confidence } = require("../netlify/functions/_lib/musicbrainz");

const CONTACT = "https://vinilosdelacarreralantadilla.netlify.app";
const ALBUMS = [
  ["Sui Generis", "Adiós Sui Generis, Vol. 1"],
  ["Sui Generis", "Adiós Sui Generis, Vol. 2"],
  ["Alice in Chains", "Alice in Chains"],
  ["Amy Winehouse", "Back to Black"],
  ["Barry White", "20th Century Records: The Singles"],
  ["Bob Dylan", "Bob Dylan's Greatest Hits, Volume III"],
  ["Bob Dylan", "Bob Dylan's Greatest Hits"],
  ["Phil Collins", "...But Seriously"],
  ["Cat Stevens", "Teaser and the Firecat"],
  ["Charly García", "Parte de la religión"],
  ["Chris Cornell", "Euphoria Morning"],
  ["Creedence Clearwater Revival", "Creedence Clearwater Revival"],
  ["Pink Floyd", "The Dark Side of the Moon"],
  ["David Bowie", "Live Rio 1990"],
  ["Dire Straits", "Private Investigations: The Best of Dire Straits & Mark Knopfler"],
  ["Duran Duran", "Notorious"],
  ["Eric Clapton", "Journeyman"],
  ["George Michael", "Faith"],
  ["Fito Páez", "El amor después del amor"],
  ["Myriam Hernández", "Grandes éxitos"],
  ["Journey", "Greatest Hits"],
  ["Journey", "Greatest Hits 2"],
  ["Iron Maiden", "Iron Maiden"],
  ["Iron Maiden", "The Number of the Beast"],
  ["Los Bunkers", "MTV Unplugged"],
  ["Los Prisioneros", "Corazones"],
  ["Lucybell", "Mil caminos"],
  ["Madonna", "Like a Prayer"],
  ["Metallica", "Metallica"],
  ["Michael Jackson", "Thriller"],
  ["Nirvana", "Nevermind"],
  ["Rod Stewart", "Out of Order"],
  ["Pet Shop Boys", "Nonetheless"],
  ["Pixies", "Doolittle"],
  ["Ramones", "Ramones"],
  ["Prince", "Sign o' the Times"],
  ["Gilberto Gil", "Gilberto Gil"],
  ["Pearl Jam", "Live at the Orlando Arena"],
  ["Rock 'n' Roll Discovered", "Rock 'n' Roll Discovered"],
  ["Joaquín Sabina", "Enemigos íntimos"],
  ["Simon & Garfunkel", "Simon and Garfunkel's Greatest Hits"],
  ["Simply Red", "All Star"],
  ["Soda Stereo", "Nada personal"],
  ["Soundgarden", "Superunknown"],
  ["Stevie Wonder", "Live at Las Vegas"],
  ["Stone Temple Pilots", "Live 2018"],
  ["Soda Stereo", "Sueño Stereo"],
  ["The Beatles", "Abbey Road"],
  ["The Beatles", "The Beatles at the Hollywood Bowl"],
  ["The Beatles", "Let It Be"],
  ["The Beatles", "Rubber Soul"],
  ["Bee Gees", "Grandes canciones"],
  ["R.E.M.", "In Time: The Best of R.E.M. 1988–2003"],
  ["The Cure", "Greatest Hits"],
  ["Santana", "The Many Faces of Santana"],
  ["Stevie Wonder", "The Many Faces of Stevie Wonder"],
  ["Genesis", "Turn It On Again: The Hits"],
  ["U2", "Zooropa"],
  ["Los Fabulosos Cadillacs", "Vasos vacíos"],
  ["Depeche Mode", "Violator"],
  ["Marvin Gaye", "What's Going On"],
  ["ZZ Top", "Eliminator"],
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
  const found = await mb(`release?query=${encodeURIComponent(`release:"${clean(title)}" AND artist:"${clean(artist)}" AND status:official`)}&limit=25&fmt=json`);
  const candidates = (found.releases || []).filter((item) => item.score >= 85);
  const rank = (item) => {
    const format = (item.media || []).map((medium) => medium.format || "").join(" ");
    return [/vinyl/i.test(format) ? 0 : 1, item.date || "9999"];
  };
  candidates.sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || String(x[1]).localeCompare(String(y[1])); });
  for (const candidate of candidates.slice(0, 3)) {
    const full = await mb(`release/${candidate.id}?inc=artist-credits+labels+recordings+release-groups+isrcs&fmt=json`);
    try {
      const release = coreRelease(full);
      if (release.tracks.length) return release;
    } catch { /* probar el siguiente candidato */ }
  }
  return null;
}

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error("Indicá el archivo de salida.");
  const parts = ["-- Generado por scripts/build-catalog-sql.js (metadatos de MusicBrainz, sin audio ni portadas)"];
  const missing = [];
  const seen = new Set();
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

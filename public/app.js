/* Vinilos de la Carrera: archivo público, catalogación protegida y audio autorizado. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = { albums: [], authenticated: false, selectedId: null, editingId: null, editingVersion: null, release: null, queue: [], history: [], current: null };
  const audio = $("audio-element");
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const text = (id, value) => { $(id).textContent = value; };
  const formatTime = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "0:00";

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) state.authenticated = false;
      const error = new Error(data?.error || "No se completó la solicitud. Intentá nuevamente.");
      error.status = response.status;
      error.details = data;
      throw error;
    }
    return data;
  }

  async function loadAlbums() {
    text("sync-status", "Actualizando el archivo…");
    try {
      const result = await request("/api/albums");
      state.albums = Array.isArray(result.albums) ? result.albums : [];
      text("sync-status", state.albums.length ? "" : "La colección todavía no tiene ediciones registradas.");
      renderAll();
    } catch {
      text("sync-status", "No pudimos cargar la colección. Revisá la conexión y usá «Actualizar archivo» para reintentar.");
    }
  }

  function tracksOf(album) {
    return Array.isArray(album.tracks) && album.tracks.length
      ? album.tracks
      : (album.tracklist || []).map((title, index) => ({ id: null, discNumber: 1, trackNumber: index + 1, title, artist: album.artist, playbackType: "NO_AUDIO_AVAILABLE" }));
  }

  function coverMarkup(album, className = "record-cover") {
    return album.cover
      ? `<img class="${className}" src="${escape(album.cover)}" alt="Portada de ${escape(album.title)}" loading="lazy">`
      : `<div class="${className} cover-placeholder" aria-label="Portada no disponible"><span aria-hidden="true">◉</span><small>PORTADA NO VERIFICADA</small></div>`;
  }

  function card(album, index) {
    const cardElement = document.createElement("article");
    cardElement.className = `record-card ${index === 0 ? "lead-record" : ""}`;
    cardElement.innerHTML = `<button type="button" class="record-open" aria-label="Abrir ficha de ${escape(album.title)} de ${escape(album.artist)}">${coverMarkup(album)}<span class="record-meta"><span class="record-index">${String(index + 1).padStart(2, "0")} / ARCHIVO</span><strong>${escape(album.title)}</strong><span>${escape(album.artist)}</span><small>${album.year || "Año no documentado"}${album.format ? ` · ${escape(album.format)}` : ""}</small></span></button>`;
    cardElement.querySelector("button").addEventListener("click", () => openAlbum(album.id));
    const image = cardElement.querySelector("img");
    image?.addEventListener("error", () => image.replaceWith(placeholder(album.title)), { once: true });
    return cardElement;
  }

  function placeholder(title) {
    const element = document.createElement("div");
    element.className = "record-cover cover-placeholder";
    element.setAttribute("aria-label", `Portada no disponible para ${title}`);
    element.innerHTML = '<span aria-hidden="true">◉</span><small>PORTADA NO DISPONIBLE</small>';
    return element;
  }

  function filteredAlbums() {
    const query = $("search-input").value.trim().toLocaleLowerCase("es");
    const artist = $("artist-filter").value;
    const decade = $("decade-filter").value;
    return state.albums.filter((album) => {
      if (artist && album.artist !== artist) return false;
      if (decade && String(Math.floor(album.year / 10) * 10) !== decade) return false;
      const fields = [album.title, album.artist, album.year, album.label, album.catalogNumber, album.barcode,
        ...tracksOf(album).map((track) => track.title)];
      return !query || fields.some((field) => String(field || "").toLocaleLowerCase("es").includes(query));
    });
  }

  function renderFilters() {
    const currentArtist = $("artist-filter").value;
    const currentDecade = $("decade-filter").value;
    const artists = [...new Set(state.albums.map((album) => album.artist).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    const decades = [...new Set(state.albums.map((album) => album.year ? String(Math.floor(album.year / 10) * 10) : null).filter(Boolean))].sort().reverse();
    $("artist-filter").innerHTML = '<option value="">Todos los artistas</option>' + artists.map((artist) => `<option value="${escape(artist)}">${escape(artist)}</option>`).join("");
    $("decade-filter").innerHTML = '<option value="">Todas las décadas</option>' + decades.map((decade) => `<option value="${decade}">${decade}s</option>`).join("");
    $("artist-filter").value = currentArtist;
    $("decade-filter").value = currentDecade;
  }

  function renderCatalog() {
    const filtered = filteredAlbums();
    const grid = $("catalog-grid");
    grid.replaceChildren(...filtered.map(card));
    $("empty-catalog").hidden = filtered.length > 0 || state.albums.length === 0;
  }

  function renderArtists() {
    const counts = new Map();
    for (const album of state.albums) counts.set(album.artist, (counts.get(album.artist) || 0) + 1);
    const list = $("artists-list");
    list.innerHTML = "";
    for (const [artist, count] of [...counts].sort((a, b) => a[0].localeCompare(b[0], "es"))) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "artist-entry";
      button.innerHTML = `<span>${escape(artist)}</span><small>${count} edición${count === 1 ? "" : "es"} en el archivo</small><span aria-hidden="true">↗</span>`;
      button.addEventListener("click", () => {
        $("artist-filter").value = artist;
        showView("collection");
        renderCatalog();
        $("collection-title").scrollIntoView();
      });
      list.append(button);
    }
    if (!counts.size) list.innerHTML = '<p class="empty-inline">Todavía no hay artistas registrados.</p>';
  }

  function renderAdmin() {
    const list = $("admin-list");
    list.innerHTML = "";
    for (const album of state.albums) {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `<span><strong>${escape(album.title)}</strong><small>${escape(album.artist)} · ${escape(album.catalogNumber || "Sin número de catálogo")}</small></span><span class="admin-row-actions"><button type="button" data-action="edit">Editar</button><button type="button" data-action="delete">Eliminar</button></span>`;
      row.querySelector('[data-action="edit"]').addEventListener("click", () => editAlbum(album));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteAlbum(album));
      list.append(row);
    }
    if (!state.albums.length) list.innerHTML = '<p class="empty-inline">No hay vinilos para administrar.</p>';
  }

  function renderAll() {
    text("stat-albums", state.albums.length);
    text("stat-artists", new Set(state.albums.map((album) => album.artist).filter(Boolean)).size);
    text("stat-tracks", state.albums.reduce((sum, album) => sum + tracksOf(album).length, 0));
    renderFilters(); renderCatalog(); renderArtists(); renderAdmin();
    if (state.selectedId && $("album-dialog").open) {
      const refreshed = state.albums.find((album) => album.id === state.selectedId);
      if (refreshed) renderAlbum(refreshed);
      else $("album-dialog").close();
    }
  }

  function showView(view) {
    if (view === "admin" && !state.authenticated) { $("login-dialog").showModal(); return; }
    for (const name of ["collection", "artists", "admin"]) {
      $(`${name}-view`).hidden = name !== view;
      const button = $(`show-${name}`);
      button.classList.toggle("current", name === view);
      if (name === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    if (view === "admin") renderAdmin();
  }

  function renderAlbum(album) {
    const tracks = tracksOf(album);
    const metadata = [album.year, album.label, album.catalogNumber, album.country, album.format].filter(Boolean).map(escape).join(" · ");
    const copies = album.copies || [];
    $("album-detail").innerHTML = `<div class="detail-grid"><div class="detail-art">${coverMarkup(album, "detail-cover")}<p class="source-credit">${album.cover ? "Imagen con procedencia declarada por el administrador." : "La imagen de esta edición aún no tiene derechos verificados."}</p></div><div class="detail-body"><p class="eyebrow">FICHA DE EDICIÓN ${album.musicbrainzId ? "/ MUSICBRAINZ" : "/ REGISTRO MANUAL"}</p><h2 id="dialog-title">${escape(album.title)}</h2><p class="detail-artist">${escape(album.artist)}</p><p class="detail-meta">${metadata || "No hay datos de edición adicionales."}</p>${album.description ? `<p class="detail-description">${escape(album.description)}</p>` : ""}${album.musicbrainzId ? `<p><a href="https://musicbrainz.org/release/${escape(album.musicbrainzId)}" target="_blank" rel="noopener noreferrer">Ver edición en MusicBrainz ↗</a></p>` : ""}<div class="track-heading"><h3>Surcos / canciones</h3><span>${tracks.length} pistas</span></div><ol class="detail-tracklist">${tracks.length ? tracks.map((track) => `<li data-track-id="${track.id || ""}"><span class="track-position">${escape(track.positionLabel || `${track.discNumber}.${track.trackNumber}`)}</span><span class="track-name"><strong>${escape(track.title)}</strong>${track.artist && track.artist !== album.artist ? `<small>${escape(track.artist)}</small>` : ""}</span><span class="track-duration">${track.durationMs ? formatTime(track.durationMs / 1000) : "—"}</span>${track.playbackType === "FULL_AUDIO" && track.id ? '<button type="button" data-action="play">Reproducir</button><button type="button" data-action="queue">+ Cola</button>' : '<span class="audio-unavailable">Audio no disponible</span>'}${state.authenticated && track.id ? '<button type="button" data-action="upload">Cargar audio autorizado</button><button type="button" data-action="edit-track">Corregir pista</button>' : ""}${state.authenticated && track.playbackType === "FULL_AUDIO" ? '<button type="button" data-action="revoke">Retirar audio</button>' : ""}</li>`).join("") : '<li class="empty-track">No hay canciones documentadas para esta edición.</li>'}</ol><div class="copy-block"><h3>Copias de la colección</h3>${copies.length ? copies.map((copy, index) => `<p>Copia ${index + 1}: ${copy.mediaCondition ? `vinilo ${escape(copy.mediaCondition)}` : "estado del vinilo no documentado"}; ${copy.sleeveCondition ? `funda ${escape(copy.sleeveCondition)}` : "estado de funda no documentado"}${copy.notes && state.authenticated ? ` · ${escape(copy.notes)}` : ""}${state.authenticated ? ` <button type="button" data-copy-id="${copy.id}">Editar estado</button>` : ""}</p>`).join("") : "<p>Sin datos de ejemplar físico.</p>"}${state.authenticated ? '<button type="button" id="add-copy" class="text-button">Añadir copia física</button><div id="copy-editor"></div>' : ""}</div></div></div>`;
    const playable = tracks.filter((track) => track.id && track.playbackType === "FULL_AUDIO");
    if (playable.length) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.textContent = `Reproducir pistas autorizadas (${playable.length})`;
      button.addEventListener("click", () => {
        state.queue = playable.slice(1).map((track) => ({ albumId: album.id, trackId: track.id, title: track.title, artist: track.artist || album.artist }));
        renderQueue();
        playTrack(album, playable[0]);
      });
      $("album-detail").querySelector(".track-heading").append(button);
    }
    $("album-detail").querySelectorAll("li[data-track-id]").forEach((row) => {
      const track = tracks.find((item) => String(item.id) === row.dataset.trackId);
      if (!track) return;
      row.querySelector('[data-action="play"]')?.addEventListener("click", () => playTrack(album, track));
      row.querySelector('[data-action="queue"]')?.addEventListener("click", () => enqueue(album, track));
      row.querySelector('[data-action="upload"]')?.addEventListener("click", () => audioUploadForm(album, track, row));
      row.querySelector('[data-action="edit-track"]')?.addEventListener("click", () => editTrack(track, row));
      row.querySelector('[data-action="revoke"]')?.addEventListener("click", async () => {
        if (!window.confirm(`¿Retirar el audio de «${track.title}»?`)) return;
        try { await request(`/api/tracks/${track.id}/audio`, { method: "DELETE" }); await loadAlbums(); }
        catch (error) { text("sync-status", error.message); }
      });
    });
    $("album-detail").querySelectorAll("[data-copy-id]").forEach((button) => {
      button.addEventListener("click", () => editCopy(album, copies.find((copy) => String(copy.id) === button.dataset.copyId)));
    });
    $("add-copy")?.addEventListener("click", () => editCopy(album, null));
  }

  function editTrack(track, row) {
    if (row.querySelector(".track-edit-form")) return;
    const form = document.createElement("form"); form.className = "track-edit-form";
    form.innerHTML = `<label>Título verificado<input name="title" maxlength="300" required></label><label>Artista de la pista<input name="artist" maxlength="200"></label><button type="submit" class="action-button">Guardar corrección</button><p role="status"></p>`;
    row.append(form);
    form.elements.title.value = track.title;
    form.elements.artist.value = track.artist || "";
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); const button = form.querySelector("button"); button.disabled = true;
      try { await request(`/api/tracks/${track.id}`, { method: "PUT", body: JSON.stringify({ title: form.elements.title.value, artist: form.elements.artist.value }) }); await loadAlbums(); }
      catch (error) { form.querySelector("p").textContent = error.message; button.disabled = false; }
    });
    form.elements.title.focus();
  }

  function editCopy(album, copy) {
    const editor = $("copy-editor");
    const options = ['', 'M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'];
    editor.innerHTML = `<form class="copy-form"><h4>${copy ? "Editar copia" : "Añadir copia"}</h4><label>Estado del vinilo<select name="media">${options.map((value) => `<option value="${value}">${value || "No documentado"}</option>`).join("")}</select></label><label>Estado de la funda<select name="sleeve">${options.map((value) => `<option value="${value}">${value || "No documentado"}</option>`).join("")}</select></label><label>Notas personales (no se muestran públicamente)<textarea name="notes" maxlength="2000" rows="3"></textarea></label><button type="submit" class="action-button">Guardar copia</button><p role="status"></p></form>`;
    const form = editor.querySelector("form");
    form.elements.media.value = copy?.mediaCondition || "";
    form.elements.sleeve.value = copy?.sleeveCondition || "";
    form.elements.notes.value = copy?.notes || "";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button"); button.disabled = true;
      try {
        await request(copy ? `/api/copies/${copy.id}` : `/api/albums/${album.id}/copies`, {
          method: copy ? "PUT" : "POST",
          body: JSON.stringify({ mediaCondition: form.elements.media.value, sleeveCondition: form.elements.sleeve.value, notes: form.elements.notes.value }),
        });
        await loadAlbums();
      } catch (error) { form.querySelector("p").textContent = error.message; button.disabled = false; }
    });
    form.elements.media.focus();
  }

  function openAlbum(id) {
    const album = state.albums.find((item) => item.id === id);
    if (!album) return;
    state.selectedId = id;
    renderAlbum(album);
    $("album-dialog").showModal();
  }

  function audioUploadForm(album, track, row) {
    if (row.querySelector(".track-upload-form")) return;
    const form = document.createElement("form");
    form.className = "track-upload-form";
    form.innerHTML = `<label>Archivo autorizado para ${escape(track.title)} <small>máximo 4 MB</small><input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/flac" required></label><label>Quién autorizó la difusión pública y bajo qué permiso<input type="text" minlength="20" maxlength="1000" required></label><button type="submit" class="action-button">Publicar audio autorizado</button><p role="status"></p>`;
    row.append(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = form.querySelector('input[type="file"]').files[0];
      const evidence = form.querySelector('input[type="text"]').value.trim();
      if (!file || file.size > 4 * 1024 * 1024) { form.querySelector("p").textContent = "Elegí un archivo de hasta 4 MB."; return; }
      const button = form.querySelector("button");
      button.disabled = true;
      form.querySelector("p").textContent = "Subiendo audio…";
      try {
        const dataBase64 = await fileBase64(file);
        await request(`/api/tracks/${track.id}/audio`, { method: "POST", body: JSON.stringify({ mimeType: file.type, dataBase64, rightsEvidence: evidence }) });
        await loadAlbums();
      } catch (error) { form.querySelector("p").textContent = error.message; button.disabled = false; }
    });
    form.querySelector('input[type="file"]').focus();
  }

  function fileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
      reader.readAsDataURL(file);
    });
  }

  async function playTrack(album, track, recordHistory = true) {
    if (!track.id || track.playbackType !== "FULL_AUDIO") return;
    const key = `${album.id}:${track.id}`;
    if (state.current?.key === key) { audio.paused ? audio.play().catch(playerError) : audio.pause(); return; }
    try {
      const result = await request(`/api/tracks/${track.id}/playback`);
      audio.pause();
      audio.src = result.url;
      state.current = { key, albumId: album.id, trackId: track.id, title: track.title, artist: track.artist || album.artist, album: album.title };
      $("player").hidden = false;
      text("player-title", track.title);
      text("player-meta", `${track.artist || album.artist} · ${album.title}`);
      document.querySelector(".player-mark").innerHTML = album.cover
        ? `<img src="${escape(album.cover)}" alt="" loading="lazy">`
        : "◉";
      if (recordHistory) state.history.push(state.current);
      await audio.play();
      renderQueue();
    } catch (error) { playerError(error); }
  }

  function playerError(error) {
    text("sync-status", `No se pudo reproducir la pista. ${error?.message || "Intentá nuevamente."}`);
  }

  function enqueue(album, track) {
    if (!track.id || track.playbackType !== "FULL_AUDIO") return;
    state.queue.push({ albumId: album.id, trackId: track.id, title: track.title, artist: track.artist || album.artist });
    renderQueue();
    if (!state.current) nextTrack();
  }

  function renderQueue() {
    text("queue-count", state.queue.length);
    const list = $("queue-list");
    list.innerHTML = "";
    state.queue.forEach((item, index) => {
      const row = document.createElement("li");
      row.innerHTML = `<span>${escape(item.title)} <small>${escape(item.artist)}</small></span><span class="queue-actions"><button type="button" data-action="up" aria-label="Mover ${escape(item.title)} arriba">↑</button><button type="button" data-action="down" aria-label="Mover ${escape(item.title)} abajo">↓</button><button type="button" data-action="remove" aria-label="Quitar ${escape(item.title)} de la cola">×</button></span>`;
      row.querySelector('[data-action="up"]').disabled = index === 0;
      row.querySelector('[data-action="down"]').disabled = index === state.queue.length - 1;
      row.querySelector('[data-action="up"]').addEventListener("click", () => { [state.queue[index - 1], state.queue[index]] = [state.queue[index], state.queue[index - 1]]; renderQueue(); });
      row.querySelector('[data-action="down"]').addEventListener("click", () => { [state.queue[index + 1], state.queue[index]] = [state.queue[index], state.queue[index + 1]]; renderQueue(); });
      row.querySelector('[data-action="remove"]').addEventListener("click", () => { state.queue.splice(index, 1); renderQueue(); });
      list.append(row);
    });
    if (!state.queue.length) list.innerHTML = '<li class="empty-inline">La cola está vacía.</li>';
  }

  async function nextTrack() {
    const item = state.queue.shift();
    renderQueue();
    if (!item) { audio.pause(); return; }
    const album = state.albums.find((candidate) => candidate.id === item.albumId);
    const track = album && tracksOf(album).find((candidate) => candidate.id === item.trackId);
    if (album && track) await playTrack(album, track);
  }

  async function previousTrack() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const previous = state.history.length > 1 ? state.history[state.history.length - 2] : null;
    if (!previous) { audio.currentTime = 0; return; }
    state.history.pop();
    const album = state.albums.find((candidate) => candidate.id === previous.albumId);
    const track = album && tracksOf(album).find((candidate) => candidate.id === previous.trackId);
    if (album && track) await playTrack(album, track, false);
  }

  function editAlbum(album) {
    state.editingId = album.id;
    state.editingVersion = album.updated_at;
    const fields = { title: album.title, artist: album.artist, year: album.year || "", discos: album.discos, label: album.label || "", catalog: album.catalogNumber || "", barcode: album.barcode || "", format: album.format || "", cover: album.cover || "", desc: album.description || "", tracks: (album.tracklist || []).join("\n"), "cover-rights": album.coverRights, "cover-note": album.coverRightsNote || "" };
    for (const [key, value] of Object.entries(fields)) $(`f-${key}`).value = value;
    $("f-tracks").disabled = Boolean(album.musicbrainzId);
    $("f-cover-file").value = "";
    text("form-title", `Editar · ${album.title}`);
    $("cancel-edit-btn").hidden = false;
    $("f-title").focus();
  }

  function resetForm() {
    state.editingId = null;
    state.editingVersion = null;
    $("album-form").reset();
    $("f-tracks").disabled = false;
    text("form-title", "Registrar vinilo manualmente");
    text("form-status", "");
    $("cancel-edit-btn").hidden = true;
  }

  async function deleteAlbum(album) {
    if (!window.confirm(`¿Eliminar «${album.title}» y sus pistas del archivo? Esta acción no se puede deshacer.`)) return;
    try { await request(`/api/albums/${album.id}`, { method: "DELETE" }); await loadAlbums(); }
    catch (error) { text("form-status", error.message); }
  }

  async function saveAlbum(event) {
    event.preventDefault();
    const form = $("album-form");
    if (!form.reportValidity()) return;
    const button = $("submit-btn");
    button.disabled = true;
    text("form-status", "Guardando vinilo…");
    try {
      const coverFile = $("f-cover-file").files[0];
      let cover = $("f-cover").value.trim();
      if (coverFile) {
        if (coverFile.size > 4 * 1024 * 1024) throw new Error("La portada supera los 4 MB.");
        const coverRights = $("f-cover-rights").value;
        const coverRightsNote = $("f-cover-note").value.trim();
        if (coverRights === "UNVERIFIED" || coverRightsNote.length < 12) throw new Error("Indicá la procedencia verificable de la portada antes de subirla.");
        const result = await request("/api/upload", { method: "POST", body: JSON.stringify({
          bucket: "portadas", mimeType: coverFile.type, dataBase64: await fileBase64(coverFile),
          cover_rights: coverRights, cover_rights_note: coverRightsNote,
        }) });
        cover = result.url;
      }
      const album = {
        title: $("f-title").value.trim(), artist: $("f-artist").value.trim(),
        year: $("f-year").value ? Number($("f-year").value) : null,
        discos: Number($("f-discos").value || 1),
        label: $("f-label").value.trim(), catalog_number: $("f-catalog").value.trim(),
        barcode: $("f-barcode").value.trim(), format: $("f-format").value.trim(),
        cover, cover_rights: $("f-cover-rights").value,
        cover_rights_note: $("f-cover-note").value.trim(),
        description: $("f-desc").value.trim(),
        tracklist: $("f-tracks").value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      };
      const id = state.editingId;
      await request(id ? `/api/albums/${id}` : "/api/albums", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(id ? { album, expectedUpdatedAt: state.editingVersion } : { album }),
      });
      resetForm();
      await loadAlbums();
      text("form-status", id ? "Vinilo actualizado." : "Vinilo agregado al archivo.");
    } catch (error) { text("form-status", error.message); }
    finally { button.disabled = false; }
  }

  async function searchRelease(event) {
    event.preventDefault();
    const params = new URLSearchParams({ mode: "search", barcode: $("identify-barcode").value.trim(),
      title: $("identify-title").value.trim(), artist: $("identify-artist").value.trim(),
      catalogNumber: $("identify-catalog").value.trim() });
    const button = $("identify-submit"); button.disabled = true;
    text("identify-status", "Consultando ediciones…");
    $("candidate-list").replaceChildren();
    $("release-preview").hidden = true;
    try {
      const result = await request(`/.netlify/functions/music?${params}`);
      text("identify-status", result.candidates.length ? `${result.candidates.length} coincidencia(s). Elegí la edición física correcta.` : "No hay coincidencias. Revisá el código o registrá la edición manualmente.");
      for (const candidate of result.candidates) {
        const buttonCandidate = document.createElement("button");
        buttonCandidate.type = "button"; buttonCandidate.className = "candidate";
        buttonCandidate.innerHTML = `<strong>${escape(candidate.title)}</strong><span>${escape(candidate.artist)} · ${candidate.year || "año no documentado"}</span><small>${escape(candidate.label || "sello no documentado")} · ${escape(candidate.catalogNumber || "sin catálogo")} · coincidencia ${candidate.confidence === "HIGH" ? "alta" : candidate.confidence === "MEDIUM" ? "media" : "baja"}</small>`;
        buttonCandidate.addEventListener("click", () => selectRelease(candidate.id));
        $("candidate-list").append(buttonCandidate);
      }
    } catch (error) { text("identify-status", error.message); }
    finally { button.disabled = false; }
  }

  async function selectRelease(id) {
    text("identify-status", "Cargando pistas de la edición…");
    try {
      const result = await request(`/.netlify/functions/music?mode=release&id=${encodeURIComponent(id)}`);
      state.release = result.release;
      const release = result.release;
      const preview = $("release-preview");
      preview.hidden = false;
      preview.innerHTML = `<p class="eyebrow">Revisar antes de importar</p><h4>${escape(release.title)}</h4><p>${escape(release.artist)} · ${release.year || "año no documentado"} · ${release.tracks.length} pistas</p><p>Sello: ${escape(release.label || "no documentado")} · Catálogo: ${escape(release.catalogNumber || "no documentado")} · Código: ${escape(release.barcode || "no documentado")}</p><ol>${release.tracks.map((track) => `<li>${escape(track.positionLabel || `${track.discNumber}.${track.trackNumber}`)} ${escape(track.title)}</li>`).join("")}</ol><p class="source-credit">Fuente: <a href="${escape(release.sourceUrl)}" target="_blank" rel="noopener noreferrer">MusicBrainz ↗</a>. El audio queda desactivado hasta registrar autorización.</p><button type="button" class="action-button" id="confirm-import">Confirmar edición e importar pistas</button>`;
      $("confirm-import").addEventListener("click", importRelease);
      text("identify-status", "Comprobá que la edición y el orden de pistas correspondan a tu copia.");
      preview.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (error) { text("identify-status", error.message); }
  }

  async function importRelease() {
    if (!state.release) return;
    const button = $("confirm-import"); button.disabled = true;
    text("identify-status", "Importando edición…");
    try {
      const doImport = (confirmPossibleDuplicate) => request("/.netlify/functions/music?mode=import", {
        method: "POST", body: JSON.stringify({ id: state.release.musicbrainzId, confirm: true, confirmPossibleDuplicate }),
      });
      let result;
      try { result = await doImport(false); }
      catch (error) {
        if (!error.details?.possibleDuplicates?.length) throw error;
        const matches = error.details.possibleDuplicates.map((item) => `${item.title} — ${item.artist} (${item.catalogNumber || "sin catálogo"})`).join("\n");
        if (!window.confirm(`Posibles duplicados:\n${matches}\n\n¿Confirmás que tu edición es distinta?`)) {
          text("identify-status", "Importación cancelada para revisar posibles duplicados.");
          button.disabled = false;
          return;
        }
        result = await doImport(true);
      }
      $("release-preview").hidden = true;
      state.release = null;
      await loadAlbums();
      text("identify-status", "Edición importada. Sus canciones aparecen sin audio hasta acreditar derechos.");
      openAlbum(result.albumId);
    } catch (error) { text("identify-status", error.message); button.disabled = false; }
  }

  $("show-collection").addEventListener("click", () => showView("collection"));
  $("show-artists").addEventListener("click", () => showView("artists"));
  $("show-admin").addEventListener("click", () => showView("admin"));
  $("filter-form").addEventListener("submit", (event) => event.preventDefault());
  for (const id of ["search-input", "artist-filter", "decade-filter"]) $(id).addEventListener(id === "search-input" ? "input" : "change", renderCatalog);
  $("refresh-btn").addEventListener("click", loadAlbums);
  $("dialog-close").addEventListener("click", () => $("album-dialog").close());
  $("login-close").addEventListener("click", () => $("login-dialog").close());
  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("login-form").querySelector("button"); button.disabled = true;
    try {
      await request("/api/login", { method: "POST", body: JSON.stringify({ password: $("login-password").value }) });
      state.authenticated = true; $("login-password").value = ""; $("login-dialog").close();
      showView("admin");
      await loadAlbums();
    } catch (error) { text("login-error", error.message); }
    finally { button.disabled = false; }
  });
  $("logout-btn").addEventListener("click", async () => {
    try { await request("/api/logout", { method: "POST", body: "{}" }); } catch { /* visible state still closes */ }
    state.authenticated = false; resetForm(); showView("collection"); await loadAlbums();
  });
  $("identify-form").addEventListener("submit", searchRelease);
  $("album-form").addEventListener("submit", saveAlbum);
  $("cancel-edit-btn").addEventListener("click", resetForm);
  $("player-play").addEventListener("click", () => { if (audio.paused) audio.play().catch(playerError); else audio.pause(); });
  $("player-next").addEventListener("click", nextTrack);
  $("player-prev").addEventListener("click", previousTrack);
  $("player-mute").addEventListener("click", () => { audio.muted = !audio.muted; text("player-mute", audio.muted ? "×" : "♫"); });
  $("player-volume").addEventListener("input", (event) => { audio.volume = Number(event.target.value) / 100; audio.muted = false; });
  $("player-seek").addEventListener("input", (event) => { if (Number.isFinite(audio.duration)) audio.currentTime = Number(event.target.value) / 100 * audio.duration; });
  $("queue-toggle").addEventListener("click", () => { $("queue-panel").hidden = !$("queue-panel").hidden; $("queue-toggle").setAttribute("aria-expanded", String(!$("queue-panel").hidden)); });
  $("queue-clear").addEventListener("click", () => { state.queue = []; renderQueue(); });
  audio.addEventListener("timeupdate", () => { text("player-time", formatTime(audio.currentTime)); text("player-duration", formatTime(audio.duration)); $("player-seek").value = Number.isFinite(audio.duration) && audio.duration > 0 ? String(audio.currentTime / audio.duration * 100) : "0"; });
  audio.addEventListener("play", () => { text("player-play", "Ⅱ"); $("player-play").setAttribute("aria-label", "Pausar reproducción"); });
  audio.addEventListener("pause", () => { text("player-play", "▶"); $("player-play").setAttribute("aria-label", "Reanudar reproducción"); });
  audio.addEventListener("ended", nextTrack);
  audio.addEventListener("error", () => playerError(new Error("El archivo de audio dejó de estar disponible.")));
  audio.volume = 0.8;
  document.addEventListener("keydown", (event) => {
    if (event.key === " " && event.target === document.body && !$("player").hidden) {
      event.preventDefault(); $("player-play").click();
    }
  });
  renderQueue();
  request("/api/session").then((result) => { state.authenticated = Boolean(result.authenticated); }).catch(() => {});
  loadAlbums();
})();

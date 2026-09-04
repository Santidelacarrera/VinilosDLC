/* =========================================================
   VINILOS DE LA CARRERA — app.js
   Catálogo + CRUD respaldados en Supabase (tabla "albums" +
   buckets de Storage "portadas" y "canciones"), para que los
   cambios se vean iguales en cualquier dispositivo. Incluye
   reproductor de muestra (30-60 seg) por disco.
   ========================================================= */

(function () {
  "use strict";

  /* -------------------------------------------------------
     0. CONFIGURACIÓN DE SUPABASE
     ------------------------------------------------------- */
  const SUPABASE_URL = "https://zmtgddsakwclsngqimmt.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptdGdkZHNha3djbHNuZ3FpbW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzE3MzEsImV4cCI6MjA5OTU0NzczMX0.GbaKeQlPmR4XjajWcauQuxfBSIgVdv3E3uyzWTgpJLo";
  const COVER_BUCKET = "portadas";
  const AUDIO_BUCKET = "canciones";
  const PREVIEW_MAX_MS = 60000; // tope de seguridad: 60 segundos

  // Contraseña para poder entrar a "Gestionar". Es una protección simple
  // (vive en el código del navegador, no es seguridad real) pero alcanza
  // para que un visitante casual no edite el catálogo por error.
  // Para cambiarla, editá este valor y volvé a subir el archivo.
  const ADMIN_PASSWORD = "vinilos2026";
  const AUTH_STORAGE_KEY = "vinilos_admin_auth";

  const sb = window.supabase && window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const FALLBACK_COVER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%231a1613'/%3E%3Ccircle cx='200' cy='200' r='120' fill='none' stroke='%233a3128' stroke-width='2'/%3E%3Ccircle cx='200' cy='200' r='18' fill='%23d3a94c'/%3E%3C/svg%3E";

  const PLAY_ICON = `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8 5v14l11-7Z"/></svg>`;
  const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M7 5h4v14H7Zm6 0h4v14h-4Z"/></svg>`;
  const LOADING_ICON = `<svg class="spin-icon" viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z"/></svg>`;
  const PLAY_ICON_SM = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M8 5v14l11-7Z"/></svg>`;
  const PAUSE_ICON_SM = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 5h4v14H7Zm6 0h4v14h-4Z"/></svg>`;
  const LOADING_ICON_SM = `<svg class="spin-icon" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z"/></svg>`;

  /* -------------------------------------------------------
     1. ESTADO
     ------------------------------------------------------- */
  let albums = [];
  let editingId = null;

  let coverFile = null;
  let coverExistingUrl = "";
  let coverCleared = false;

  let audioFile = null;
  let audioExistingUrl = "";
  let audioCleared = false;

  let currentAudio = null;
  let currentKey = null; // identificador de lo que suena: "custom-<id>" o "<id>#<índice de canción>"
  let loadingKey = null;
  let previewTimer = null;

  // Reproducción "de corrido" (todo el álbum en orden, avanzando solo)
  let sequentialSession = 0; // 0 = apagado; otro valor = token de la tanda activa
  let sequentialAlbum = null;
  let sequentialIndex = -1;

  // caché en memoria de búsquedas a iTunes (artista+tema -> url de preview o null)
  const itunesPreviewCache = {};

  let pendingAuthCallback = null;

  /* -------------------------------------------------------
     2. REFERENCIAS DOM
     ------------------------------------------------------- */
  const els = {
    btnViewCatalog: document.getElementById("btn-view-catalog"),
    btnViewAdmin: document.getElementById("btn-view-admin"),
    viewCatalog: document.getElementById("view-catalog"),
    viewAdmin: document.getElementById("view-admin"),

    searchInput: document.getElementById("search-input"),
    catalogGrid: document.getElementById("catalog-grid"),
    catalogCount: document.getElementById("catalog-count"),
    emptyCatalog: document.getElementById("empty-catalog"),
    refreshBtn: document.getElementById("refresh-btn"),
    syncStatus: document.getElementById("sync-status"),

    form: document.getElementById("album-form"),
    formTitle: document.getElementById("form-title"),
    fId: document.getElementById("f-id"),
    fTitle: document.getElementById("f-title"),
    fArtist: document.getElementById("f-artist"),
    fYear: document.getElementById("f-year"),
    fDiscos: document.getElementById("f-discos"),

    fCover: document.getElementById("f-cover"),
    fCoverFile: document.getElementById("f-cover-file"),
    coverPreviewImg: document.getElementById("cover-preview-img"),
    coverPreviewEmpty: document.getElementById("cover-preview-empty"),
    clearCoverBtn: document.getElementById("clear-cover-btn"),

    fAudioFile: document.getElementById("f-audio-file"),
    audioPreviewLabel: document.getElementById("audio-preview-label"),
    audioPreviewPlayer: document.getElementById("f-audio-preview-player"),
    clearAudioBtn: document.getElementById("clear-audio-btn"),

    aiIdentifyBtn: document.getElementById("ai-identify-btn"),
    aiIdentifyLabel: document.getElementById("ai-identify-label"),
    aiBulkBtn: document.getElementById("ai-bulk-btn"),
    aiBulkProgress: document.getElementById("ai-bulk-progress"),

    fDesc: document.getElementById("f-desc"),
    fTracks: document.getElementById("f-tracks"),
    trackAudioSection: document.getElementById("track-audio-section"),
    trackAudioList: document.getElementById("track-audio-list"),
    submitBtn: document.getElementById("submit-btn"),
    cancelEditBtn: document.getElementById("cancel-edit-btn"),

    adminTableBody: document.getElementById("admin-table-body"),
    adminCount: document.getElementById("admin-count"),

    modalOverlay: document.getElementById("modal-overlay"),
    modalCloseBtn: document.getElementById("modal-close-btn"),
    modalCover: document.getElementById("modal-cover"),
    modalMeta: document.getElementById("modal-meta"),
    modalTitle: document.getElementById("modal-title"),
    modalDesc: document.getElementById("modal-desc"),
    modalTrackCount: document.getElementById("modal-track-count"),
    modalTracklist: document.getElementById("modal-tracklist"),
    modalDownloadBtn: document.getElementById("modal-download-btn"),
    modalVinylPlayBtn: document.getElementById("modal-vinyl-play-btn"),
    modalAudioBtn: document.getElementById("modal-audio-btn"),
    modalAudioIcon: document.getElementById("modal-audio-icon"),
    modalAudioLabel: document.getElementById("modal-audio-label"),

    toast: document.getElementById("toast"),

    loginOverlay: document.getElementById("login-overlay"),
    loginForm: document.getElementById("login-form"),
    loginPassword: document.getElementById("login-password"),
    loginError: document.getElementById("login-error"),
    loginCloseBtn: document.getElementById("login-close-btn"),
    logoutBtn: document.getElementById("logout-btn"),
  };

  /* -------------------------------------------------------
     3. CARGA / GUARDADO EN SUPABASE
     ------------------------------------------------------- */
  async function fetchAlbums() {
    const { data, error } = await sb
      .from("albums")
      .select("*")
      .order("id", { ascending: true });
    if (error) throw error;
    albums = data || [];
  }

  async function init() {
    if (!sb) {
      showSyncStatus(
        "No se pudo cargar la librería de Supabase (revisá tu conexión a internet y recargá la página).",
        true
      );
      renderCatalog();
      renderAdminTable();
      return;
    }
    showSyncStatus("Cargando discoteca…", false);
    try {
      await fetchAlbums();
      hideSyncStatus();
    } catch (err) {
      console.error(err);
      showSyncStatus(
        "No se pudo conectar con la base de datos. Revisá tu conexión a internet.",
        true
      );
    }
    renderCatalog();
    renderAdminTable();
    resetForm();
  }

  function showSyncStatus(msg, isError) {
    els.syncStatus.textContent = msg;
    els.syncStatus.classList.remove("hidden");
    els.syncStatus.classList.toggle("error", !!isError);
  }
  function hideSyncStatus() {
    els.syncStatus.classList.add("hidden");
  }

  els.refreshBtn.addEventListener("click", async () => {
    if (!sb) { showToast("No hay conexión con Supabase."); return; }
    els.refreshBtn.classList.add("spinning");
    try {
      await fetchAlbums();
      renderCatalog();
      renderAdminTable();
      showToast("Catálogo actualizado.");
    } catch (err) {
      showToast("No se pudo actualizar. Revisá tu conexión.");
    }
    els.refreshBtn.classList.remove("spinning");
  });

  /* -------------------------------------------------------
     4. SUBIDA DE ARCHIVOS A SUPABASE STORAGE
     ------------------------------------------------------- */
  function buildStoragePath(file, prefix) {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now()}-${rand}.${ext || "bin"}`;
  }

  async function uploadToBucket(file, bucket, prefix) {
    const path = buildStoragePath(file, prefix);
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  /* -------------------------------------------------------
     5. VISTAS (Escuchar / Gestionar)
     ------------------------------------------------------- */
  function switchView(view) {
    const isCatalog = view === "catalog";
    els.viewCatalog.classList.toggle("active", isCatalog);
    els.viewAdmin.classList.toggle("active", !isCatalog);
    els.btnViewCatalog.classList.toggle("active", isCatalog);
    els.btnViewAdmin.classList.toggle("active", !isCatalog);
    els.btnViewCatalog.setAttribute("aria-selected", String(isCatalog));
    els.btnViewAdmin.setAttribute("aria-selected", String(!isCatalog));
    if (!isCatalog) renderAdminTable();
  }
  els.btnViewCatalog.addEventListener("click", () => switchView("catalog"));
  els.btnViewAdmin.addEventListener("click", () => {
    requireAuth(() => switchView("admin"));
  });

  /* -------------------------------------------------------
     5b. LOGIN SIMPLE PARA "GESTIONAR"
     ------------------------------------------------------- */
  function isAuthed() {
    return localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  }

  function requireAuth(onSuccess) {
    if (isAuthed()) {
      onSuccess();
      return;
    }
    pendingAuthCallback = onSuccess;
    els.loginPassword.value = "";
    els.loginError.classList.add("hidden");
    els.loginOverlay.classList.add("open");
    els.loginOverlay.setAttribute("aria-hidden", "false");
    setTimeout(() => els.loginPassword.focus(), 50);
  }

  function closeLoginModal() {
    els.loginOverlay.classList.remove("open");
    els.loginOverlay.setAttribute("aria-hidden", "true");
    pendingAuthCallback = null;
  }

  els.loginCloseBtn.addEventListener("click", closeLoginModal);
  els.loginOverlay.addEventListener("click", (e) => {
    if (e.target === els.loginOverlay) closeLoginModal();
  });

  els.loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (els.loginPassword.value === ADMIN_PASSWORD) {
      localStorage.setItem(AUTH_STORAGE_KEY, "true");
      const cb = pendingAuthCallback;
      closeLoginModal();
      if (cb) cb();
    } else {
      els.loginError.classList.remove("hidden");
      els.loginPassword.value = "";
      els.loginPassword.focus();
    }
  });

  els.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    switchView("catalog");
    showToast("Sesión cerrada.");
  });

  /* -------------------------------------------------------
     6. RENDER: CATALOGO (Modo espectador)
     ------------------------------------------------------- */
  function renderCatalog() {
    const query = els.searchInput.value.trim().toLowerCase();

    const filtered = albums.filter((a) => {
      if (!query) return true;
      const haystack = `${a.title} ${a.artist} ${a.year || ""}`.toLowerCase();
      return haystack.includes(query);
    });

    els.catalogCount.textContent = albums.length;
    els.catalogGrid.innerHTML = "";
    els.emptyCatalog.classList.toggle("hidden", filtered.length !== 0);

    const frag = document.createDocumentFragment();
    filtered.forEach((a) => frag.appendChild(buildAlbumCard(a)));
    els.catalogGrid.appendChild(frag);
  }

  function buildAlbumCard(album) {
    const card = document.createElement("article");
    card.className = "album-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Ver canciones de ${album.title}, ${album.artist}`);

    const discoLabel = album.discos > 1 ? `${album.discos} LPs` : "1 LP";
    const quickKey = quickPreviewKey(album);
    const playBtnHtml = quickKey
      ? `<button type="button" class="download-btn card-play-btn" data-key="${quickKey}" title="Escuchar" aria-label="Escuchar canción de ${escapeAttr(album.title)}">${PLAY_ICON}</button>`
      : "";

    card.innerHTML = `
      <div class="card-art">
        <div class="card-vinyl" aria-hidden="true"></div>
        <span class="card-discs-badge">${discoLabel}</span>
        <div class="card-icon-row">
          <button type="button" class="download-btn card-download-btn" title="Descargar portada" aria-label="Descargar portada de ${escapeAttr(album.title)}">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M5 20h14v-2H5Zm7-16-5.5 5.5 1.41 1.41L11 7.83V16h2V7.83l3.09 3.08 1.41-1.41Z"/></svg>
          </button>
          ${playBtnHtml}
        </div>
        <img loading="lazy" src="${escapeAttr(album.cover) || FALLBACK_COVER}" alt="Portada de ${escapeAttr(album.title)}"
             onerror="this.onerror=null;this.src='${FALLBACK_COVER}';">
      </div>
      <div class="card-body">
        <p class="card-artist">${escapeHtml(album.artist || "Artista desconocido")}</p>
        <h3 class="card-title">${escapeHtml(album.title || "Sin título")}</h3>
        <p class="card-year">${album.year ? album.year : "Año no especificado"}</p>
      </div>
    `;

    const open = () => openModal(album);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    card.querySelector(".card-download-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      downloadCoverImage(album.cover, album.title);
    });

    const playBtn = card.querySelector(".card-play-btn");
    if (playBtn) {
      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        quickPreviewAlbum(album);
      });
    }

    return card;
  }

  els.searchInput.addEventListener("input", renderCatalog);

  /* -------------------------------------------------------
     6b. DESCARGA DE PORTADAS
     ------------------------------------------------------- */
  function slugify(str) {
    return (
      (str || "portada")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "portada"
    );
  }

  async function downloadCoverImage(url, title) {
    if (!url) {
      showToast("Este disco no tiene una portada para descargar.");
      return;
    }
    const filename = `${slugify(title)}.jpg`;

    if (url.startsWith("data:")) {
      triggerDownload(url, filename);
      return;
    }
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("respuesta no OK");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    } catch (err) {
      window.open(url, "_blank", "noopener");
      showToast("Se abrió la imagen en otra pestaña: hacé clic derecho → Guardar imagen como…");
    }
  }

  function triggerDownload(href, filename) {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* -------------------------------------------------------
     6c. REPRODUCTOR POR CANCIÓN (30-60 segundos c/u)
     Cada tema de la lista tiene su propio botón. Buscamos la
     canción puntual en iTunes (gratis, sin API key) usando
     "artista + nombre exacto del tema", así cada botón suena
     distinto (antes buscaba solo "la más popular del álbum"
     y por eso dos discos del mismo artista sonaban igual).
     Si el disco tiene un audio propio subido a mano, ese
     queda disponible aparte como "grabación propia".
     ------------------------------------------------------- */
  function albumHasPreviewSource(album) {
    return Boolean(album.audio_url) || (Array.isArray(album.tracklist) && album.tracklist.length > 0);
  }

  function quickPreviewKey(album) {
    if (album.audio_url) return `custom-${album.id}`;
    if (Array.isArray(album.tracklist) && album.tracklist[0]) return `${album.id}#0`;
    return null;
  }

  // Reproduce la primera canción del disco (o el audio propio si hay uno
  // subido a mano) — es lo que dispara el botón chico de las tarjetas.
  function quickPreviewAlbum(album) {
    const key = quickPreviewKey(album);
    if (!key) {
      showToast("Este disco todavía no tiene canciones cargadas.");
      return;
    }
    if (album.audio_url) {
      requestPlayback(key, album.audio_url);
    } else {
      const track = album.tracklist[0];
      requestPlayback(key, () => findSongPreview(album.artist, track));
    }
  }

  // Reproduce un tema puntual de la lista (botones dentro del modal).
  function playTrack(album, index) {
    const track = album.tracklist[index];
    if (!track) return;
    const key = `${album.id}#${index}`;
    const customUrl = album.track_audio && album.track_audio[String(index)];
    if (customUrl) {
      // El usuario ya subió esta canción completa: se reproduce entera,
      // sin el tope de 1 minuto de las vistas previas buscadas.
      requestPlayback(key, customUrl, true);
    } else {
      requestPlayback(key, () => findSongPreview(album.artist, track));
    }
  }

  function playCustomRecording(album) {
    if (!album.audio_url) return;
    requestPlayback(`custom-${album.id}`, album.audio_url, true);
  }

  // source puede ser una URL directa (string) o una función async que
  // resuelve la URL (búsqueda en iTunes). noCap=true evita el corte a
  // los 60 segundos (se usa para audio propio subido a mano, ya sea de
  // todo el álbum o de una canción puntual).
  function requestPlayback(key, source, noCap) {
    sequentialSession = 0; // un click individual cancela el modo "de corrido"
    if (currentKey === key) {
      stopPreview();
      return;
    }
    if (loadingKey === key) return; // ya está buscando esa, evitar doble click

    // Creamos el <audio> y probamos reproducirlo AHORA MISMO, dentro del
    // mismo clic del usuario. Los navegadores (sobre todo en celular) solo
    // permiten reproducir audio si el play() ocurre en el instante del toque;
    // si esperamos a que termine la búsqueda en iTunes antes de intentarlo,
    // lo bloquean. Con este "priming" reservamos el permiso ahora y
    // reutilizamos el mismo elemento una vez que sabemos qué URL poner.
    const primedAudio = new Audio();
    try {
      primedAudio.play().catch(() => {});
    } catch (err) {
      /* algunos navegadores tiran error sincrónico sin src: lo ignoramos */
    }

    startPlayback(key, source, primedAudio, noCap);
  }

  async function startPlayback(key, source, primedAudio, noCap) {
    stopPreviewKeepSequential();
    const audio = primedAudio || new Audio();

    if (typeof source === "string") {
      playUrl(audio, source, key, noCap);
      return;
    }

    loadingKey = key;
    syncPlayUI();

    try {
      const url = await source();
      if (loadingKey !== key) {
        audio.pause();
        return; // el usuario canceló / cambió mientras buscaba
      }
      loadingKey = null;
      if (!url) {
        if (sequentialSession) {
          advanceSequential(); // en modo "de corrido": saltamos a la siguiente sola
          return;
        }
        showToast("No se encontró esa canción para escuchar.");
        syncPlayUI();
        return;
      }
      playUrl(audio, url, key, noCap);
    } catch (err) {
      loadingKey = null;
      if (sequentialSession) {
        advanceSequential();
        return;
      }
      showToast("No se pudo buscar la canción (revisá tu conexión).");
      syncPlayUI();
    }
  }

  function playUrl(audio, url, key, noCap) {
    audio.src = url;
    currentAudio = audio;
    currentKey = key;
    syncPlayUI();

    audio.play().catch((err) => {
      console.error("No se pudo reproducir:", err);
      if (sequentialSession) {
        advanceSequential();
        return;
      }
      showToast("No se pudo reproducir. Probá tocar de nuevo.");
      stopPreview();
    });

    if (!noCap) {
      previewTimer = setTimeout(() => {
        if (currentKey === key) {
          if (sequentialSession) advanceSequential();
          else stopPreview();
        }
      }, PREVIEW_MAX_MS);
    }

    audio.addEventListener("ended", () => {
      if (currentKey === key) {
        if (sequentialSession) advanceSequential();
        else stopPreview();
      }
    });
  }

  /* -------------------------------------------------------
     6e. REPRODUCIR EL ÁLBUM "DE CORRIDO" (botón central del vinilo)
     Reproduce cada canción de la lista en orden, avanzando sola a la
     siguiente cuando termina, se corta a 1 minuto, o no se encuentra.
     ------------------------------------------------------- */
  function isSequentialPlaying(album) {
    return Boolean(sequentialSession) && sequentialAlbum && album && sequentialAlbum.id === album.id;
  }

  function toggleSequentialPlay(album) {
    if (isSequentialPlaying(album)) {
      stopPreview();
      return;
    }
    if (!Array.isArray(album.tracklist) || !album.tracklist.length) {
      showToast("Este disco no tiene canciones cargadas.");
      return;
    }
    stopPreview(); // corta cualquier otra cosa que estuviera sonando
    sequentialSession = Date.now();
    sequentialAlbum = album;
    sequentialIndex = -1;
    advanceSequential();
  }

  async function advanceSequential() {
    const session = sequentialSession;
    if (!session || !sequentialAlbum) return;

    sequentialIndex++;
    const tracks = Array.isArray(sequentialAlbum.tracklist) ? sequentialAlbum.tracklist : [];

    if (sequentialIndex >= tracks.length) {
      showToast("Terminó el álbum.");
      stopPreview();
      return;
    }

    const album = sequentialAlbum;
    const track = tracks[sequentialIndex];
    const key = `${album.id}#${sequentialIndex}`;
    const customUrl = album.track_audio && album.track_audio[String(sequentialIndex)];

    if (customUrl) {
      // Esta canción puntual ya tiene un archivo completo subido a mano:
      // se reproduce entera (sin tope de 1 minuto) y listo, sin buscar.
      playUrl(new Audio(), customUrl, key, true);
      return;
    }

    loadingKey = key;
    currentKey = null;
    syncPlayUI();

    try {
      const url = await findSongPreview(album.artist, track);
      if (sequentialSession !== session) return; // se canceló mientras buscaba
      loadingKey = null;
      if (!url) {
        advanceSequential(); // esta no se encontró: probamos la siguiente
        return;
      }
      playUrl(new Audio(), url, key);
    } catch (err) {
      if (sequentialSession !== session) return;
      loadingKey = null;
      advanceSequential();
    }
  }

  // Como stopPreview() normal corta también el modo secuencial (lo cual
  // queremos cuando el usuario para todo a mano), pero durante los pasos
  // internos de armado de la siguiente pista no hay que tocar esa bandera.
  function stopPreviewKeepSequential() {
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    currentKey = null;
  }

  // La API de búsqueda de iTunes no siempre manda los encabezados CORS
  // necesarios (es un problema conocido de Apple, no de esta app): a veces
  // el pedido directo desde el navegador falla en silencio según el
  // dispositivo, navegador o red desde la que se entra. Si el pedido
  // directo falla, reintentamos la misma búsqueda a través de un proxy
  // público que sí agrega esos encabezados, para que funcione de forma
  // más pareja en notebook, celular, tablet, etc.
  async function fetchJsonWithCorsFallback(url) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (err) {
      /* seguimos con el proxy de respaldo */
    }
    try {
      const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const res2 = await fetch(proxied);
      if (res2.ok) return await res2.json();
    } catch (err) {
      /* no hay más para intentar con este término */
    }
    return null;
  }

  // Busca una canción puntual en el catálogo público de iTunes. Prueba
  // "artista + tema" y, si no hay resultado, solo "tema". Entre los
  // primeros resultados, prioriza el que tenga el nombre de artista más
  // parecido al nuestro (para no traer versiones de tributo/covers).
  async function findSongPreview(artist, trackTitle) {
    const cacheKey = `${artist || ""}|${trackTitle || ""}`.toLowerCase();
    if (cacheKey in itunesPreviewCache) return itunesPreviewCache[cacheKey];

    const attempts = [];
    if (artist && trackTitle) attempts.push(`${artist} ${trackTitle}`);
    if (trackTitle) attempts.push(trackTitle);

    const artistFirstWord = (artist || "").toLowerCase().split(/\s+/)[0] || "";

    for (const term of attempts) {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=5`;
      const data = await fetchJsonWithCorsFallback(url);
      if (!data) continue;

      const results = (data.results || []).filter((r) => r.previewUrl);
      if (!results.length) continue;

      const bestMatch =
        results.find(
          (r) => artistFirstWord && (r.artistName || "").toLowerCase().includes(artistFirstWord)
        ) || results[0];

      itunesPreviewCache[cacheKey] = bestMatch.previewUrl;
      return bestMatch.previewUrl;
    }
    itunesPreviewCache[cacheKey] = null;
    return null;
  }

  function stopPreview() {
    sequentialSession = 0;
    sequentialAlbum = null;
    sequentialIndex = -1;
    stopPreviewKeepSequential();
    loadingKey = null;
    syncPlayUI();
  }

  function syncPlayUI() {
    document.querySelectorAll(".card-play-btn").forEach((btn) => {
      const key = btn.dataset.key;
      const isPlaying = key === currentKey;
      const isLoading = key === loadingKey;
      btn.classList.toggle("playing", isPlaying);
      btn.classList.toggle("loading", isLoading);
      btn.innerHTML = isLoading ? LOADING_ICON : isPlaying ? PAUSE_ICON : PLAY_ICON;
    });

    if (els.modalAudioBtn) {
      const key = els.modalAudioBtn.dataset.key || "";
      const isPlaying = key === currentKey;
      const isLoading = key === loadingKey;
      els.modalAudioBtn.classList.toggle("playing", isPlaying);
      els.modalAudioBtn.classList.toggle("loading", isLoading);
      els.modalAudioIcon.innerHTML = isLoading ? LOADING_ICON_SM : isPlaying ? PAUSE_ICON_SM : PLAY_ICON_SM;
      els.modalAudioLabel.textContent = isLoading ? "Buscando…" : isPlaying ? "Pausar" : "Escuchar grabación propia";
    }

    if (els.modalVinylPlayBtn) {
      const albumId = Number(els.modalVinylPlayBtn.dataset.albumId);
      const isSeq = Boolean(sequentialSession) && sequentialAlbum && sequentialAlbum.id === albumId;
      const isLoading = isSeq && loadingKey === `${albumId}#${sequentialIndex}`;
      els.modalVinylPlayBtn.classList.toggle("playing", isSeq && !isLoading);
      els.modalVinylPlayBtn.classList.toggle("loading", isLoading);
      els.modalVinylPlayBtn.innerHTML = isLoading
        ? `<svg class="spin-icon" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z"/></svg>`
        : isSeq
        ? `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M7 5h4v14H7Zm6 0h4v14h-4Z"/></svg>`
        : `<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M8 5v14l11-7Z"/></svg>`;
      els.modalVinylPlayBtn.title = isSeq ? "Pausar" : "Escuchar el álbum de corrido";
      els.modalVinylPlayBtn.setAttribute("aria-label", isSeq ? "Pausar" : "Escuchar el álbum de corrido");
    }

    document.querySelectorAll(".track-play-btn").forEach((btn) => {
      const key = btn.dataset.key;
      const isPlaying = key === currentKey;
      const isLoading = key === loadingKey;
      btn.classList.toggle("playing", isPlaying);
      btn.classList.toggle("loading", isLoading);
      btn.innerHTML = isLoading ? LOADING_ICON : isPlaying ? PAUSE_ICON : PLAY_ICON;
    });
  }

  /* -------------------------------------------------------
     7. MODAL DE DETALLE / TRACKLIST
     ------------------------------------------------------- */
  function openModal(album) {
    els.modalCover.src = album.cover || FALLBACK_COVER;
    els.modalCover.alt = `Portada de ${album.title}`;
    els.modalMeta.textContent = `${(album.artist || "").toUpperCase()} · ${album.year || "S/A"} · ${album.discos > 1 ? album.discos + " LPS" : "1 LP"}`;
    els.modalTitle.textContent = album.title || "Sin título";
    els.modalDesc.textContent = album.description || "Este disco todavía no tiene una descripción cargada.";

    const tracks = Array.isArray(album.tracklist) ? album.tracklist.filter(Boolean) : [];
    const trackAudio = album.track_audio || {};
    els.modalTrackCount.textContent = `${tracks.length} pista${tracks.length === 1 ? "" : "s"}`;
    els.modalTracklist.innerHTML = tracks.length
      ? tracks
          .map(
            (t, i) => `
        <li class="track-row">
          <button type="button" class="track-play-btn" data-key="${album.id}#${i}" title="Escuchar" aria-label="Escuchar ${escapeAttr(t)}">${PLAY_ICON}</button>
          <span class="track-num">${String(i + 1).padStart(2, "0")}</span>
          <span class="track-title">${escapeHtml(t)}</span>
          ${trackAudio[String(i)] ? '<span class="track-full-tag" title="Canción completa subida">completa</span>' : ""}
        </li>`
          )
          .join("")
      : `<li style="color:var(--muted); padding: 10px 4px;">Sin lista de canciones cargada.</li>`;

    els.modalTracklist.querySelectorAll(".track-play-btn").forEach((btn, i) => {
      btn.addEventListener("click", () => playTrack(album, i));
    });

    if (album.audio_url) {
      els.modalAudioBtn.classList.remove("hidden");
      els.modalAudioBtn.dataset.key = `custom-${album.id}`;
      els.modalAudioBtn.onclick = () => playCustomRecording(album);
    } else {
      els.modalAudioBtn.classList.add("hidden");
      els.modalAudioBtn.removeAttribute("data-key");
      els.modalAudioBtn.onclick = null;
    }
    syncPlayUI();

    els.modalOverlay.classList.add("open");
    els.modalOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    els.modalCloseBtn.focus();

    els.modalDownloadBtn.onclick = () => downloadCoverImage(album.cover, album.title);

    els.modalVinylPlayBtn.dataset.albumId = album.id;
    els.modalVinylPlayBtn.onclick = () => toggleSequentialPlay(album);
    syncPlayUI();
  }

  function closeModal() {
    els.modalOverlay.classList.remove("open");
    els.modalOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    stopPreview();
  }

  els.modalCloseBtn.addEventListener("click", closeModal);
  els.modalOverlay.addEventListener("click", (e) => {
    if (e.target === els.modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.modalOverlay.classList.contains("open")) closeModal();
  });

  /* -------------------------------------------------------
     8. RENDER: TABLA ADMIN
     ------------------------------------------------------- */
  function renderAdminTable() {
    els.adminCount.textContent = `${albums.length} disco${albums.length === 1 ? "" : "s"}`;
    els.adminTableBody.innerHTML = "";

    if (!albums.length) {
      els.adminTableBody.innerHTML = `<tr class="admin-empty-row"><td colspan="6">Todavía no hay discos cargados. Agrega el primero desde el formulario.</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    albums.forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><img class="admin-thumb" src="${escapeAttr(a.cover) || FALLBACK_COVER}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_COVER}';"></td>
        <td class="title-cell">${escapeHtml(a.title)}${a.audio_url ? ' <span class="audio-tag" title="Tiene canción de muestra">♪</span>' : ""}</td>
        <td>${escapeHtml(a.artist)}</td>
        <td>${a.year || "—"}</td>
        <td>${a.discos || 1}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-action="ai" data-id="${a.id}" aria-label="Re-analizar ${escapeAttr(a.title)} con IA" title="Re-analizar con IA" ${a.cover ? "" : "disabled"}>
              <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Zm7 11 .9 2.6L22 16.5l-2.1.9L19 20l-.9-2.6-2.1-.9 2.1-.9L19 13ZM5 13l.9 2.6L8 16.5l-2.1.9L5 20l-.9-2.6L2 16.5l2.1-.9L5 13Z"/></svg>
            </button>
            <button class="icon-btn" data-action="edit" data-id="${a.id}" aria-label="Editar ${escapeAttr(a.title)}" title="Editar">
              <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75Z"/></svg>
            </button>
            <button class="icon-btn danger" data-action="delete" data-id="${a.id}" aria-label="Eliminar ${escapeAttr(a.title)}" title="Eliminar">
              <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M6 7h12l-1 14H7ZM9 4h6l1 2H8Z"/></svg>
            </button>
          </div>
        </td>
      `;
      frag.appendChild(tr);
    });
    els.adminTableBody.appendChild(frag);
  }

  els.adminTableBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === "edit") startEdit(id);
    if (btn.dataset.action === "delete") deleteAlbum(id);
    if (btn.dataset.action === "ai") reanalyzeAlbumWithAI(id, btn);
  });

  /* -------------------------------------------------------
     9. CRUD: CREAR / EDITAR / ELIMINAR (Supabase)
     ------------------------------------------------------- */
  function resetForm() {
    editingId = null;
    els.form.reset();
    els.fId.value = "";
    els.fDiscos.value = 1;
    els.formTitle.textContent = "Agregar nuevo disco";
    els.submitBtn.disabled = false;
    els.submitBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6Z"/></svg>
      Guardar disco`;
    els.cancelEditBtn.hidden = true;
    clearCoverUpload();
    clearAudioUpload();
    els.trackAudioSection.hidden = true;
    els.trackAudioList.innerHTML = "";
  }

  function clearCoverUpload() {
    coverFile = null;
    coverExistingUrl = "";
    coverCleared = false;
    els.fCoverFile.value = "";
    els.fCover.value = "";
    els.coverPreviewImg.classList.add("hidden");
    els.coverPreviewImg.src = "";
    els.coverPreviewEmpty.classList.remove("hidden");
  }

  function setCoverPreview(src) {
    if (!src) {
      els.coverPreviewImg.classList.add("hidden");
      els.coverPreviewImg.src = "";
      els.coverPreviewEmpty.classList.remove("hidden");
      return;
    }
    els.coverPreviewImg.src = src;
    els.coverPreviewImg.classList.remove("hidden");
    els.coverPreviewEmpty.classList.add("hidden");
  }

  function clearAudioUpload() {
    audioFile = null;
    audioExistingUrl = "";
    audioCleared = false;
    els.fAudioFile.value = "";
    els.audioPreviewLabel.textContent = "Sin audio cargado";
    els.audioPreviewPlayer.classList.add("hidden");
    els.audioPreviewPlayer.pause();
    els.audioPreviewPlayer.src = "";
  }

  function setAudioPreview(label, src) {
    els.audioPreviewLabel.textContent = label;
    if (src) {
      els.audioPreviewPlayer.src = src;
      els.audioPreviewPlayer.classList.remove("hidden");
    } else {
      els.audioPreviewPlayer.classList.add("hidden");
      els.audioPreviewPlayer.src = "";
    }
  }

  els.fCoverFile.addEventListener("change", () => {
    const file = els.fCoverFile.files && els.fCoverFile.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Elegí un archivo de imagen válido.");
      return;
    }
    coverFile = file;
    coverCleared = false;
    els.fCover.value = "";
    setCoverPreview(URL.createObjectURL(file));
  });

  els.clearCoverBtn.addEventListener("click", () => {
    clearCoverUpload();
    coverCleared = true;
  });

  els.fCover.addEventListener("input", () => {
    if (els.fCover.value.trim()) {
      coverFile = null;
      coverCleared = false;
      els.fCoverFile.value = "";
      setCoverPreview(els.fCover.value.trim());
    } else if (!coverFile) {
      setCoverPreview(coverExistingUrl || "");
    }
  });

  /* -------------------------------------------------------
     9b. IDENTIFICACIÓN AUTOMÁTICA CON IA (Gemini, vía Netlify Function)
     ------------------------------------------------------- */
  const AI_ENDPOINT = "/.netlify/functions/identify-album";

  async function identifyAlbumWithAI(source) {
    const res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(source),
    });
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error("Respuesta inválida del servidor.");
    }
    if (!res.ok) throw new Error(data.error || "No se pudo identificar el disco.");
    return data; // { title, artist, year, tracklist }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const base64 = String(result).split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function setAiButtonLoading(isLoading, label) {
    els.aiIdentifyBtn.disabled = isLoading;
    els.aiIdentifyLabel.textContent = label || (isLoading ? "Analizando…" : "Identificar con IA");
    els.aiIdentifyBtn.classList.toggle("loading", isLoading);
  }

  els.aiIdentifyBtn.addEventListener("click", async () => {
    let source = null;
    if (coverFile) {
      try {
        const base64 = await fileToBase64(coverFile);
        source = { imageBase64: base64, imageMimeType: coverFile.type || "image/jpeg" };
      } catch (err) {
        showToast("No se pudo leer la imagen elegida.");
        return;
      }
    } else if (els.fCover.value.trim()) {
      source = { imageUrl: els.fCover.value.trim() };
    } else if (coverExistingUrl) {
      source = { imageUrl: coverExistingUrl };
    }

    if (!source) {
      showToast("Primero subí una foto de la portada o pegá una URL de imagen.");
      return;
    }

    setAiButtonLoading(true);
    try {
      const result = await identifyAlbumWithAI(source);
      if (!result.title && !result.artist && (!result.tracklist || !result.tracklist.length)) {
        showToast("La IA no pudo identificar este disco con confianza. Completá los datos a mano.");
        return;
      }
      if (result.title) els.fTitle.value = result.title;
      if (result.artist) els.fArtist.value = result.artist;
      if (result.year) els.fYear.value = result.year;
      if (result.tracklist && result.tracklist.length) {
        els.fTracks.value = result.tracklist.join("\n");
      }
      showToast(`Identificado: "${result.title || "?"}" — revisá los datos antes de guardar.`);
    } catch (err) {
      console.error(err);
      showToast("No se pudo identificar el disco: " + (err.message || "error desconocido."));
    } finally {
      setAiButtonLoading(false);
    }
  });

  // Re-analiza un disco ya cargado, a partir de su portada actual, y
  // guarda directo en Supabase lo que la IA devuelva (sin pasar por el
  // formulario). Se usa desde el botón ✨ de cada fila de la tabla.
  async function reanalyzeAlbumWithAI(id, btnEl) {
    const album = albums.find((a) => a.id === id);
    if (!album || !album.cover) {
      showToast("Este disco no tiene portada para analizar.");
      return;
    }
    const originalHtml = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = LOADING_ICON;
    try {
      const result = await identifyAlbumWithAI({ imageUrl: album.cover });
      const payload = {};
      if (result.title) payload.title = result.title;
      if (result.artist) payload.artist = result.artist;
      if (result.year) payload.year = result.year;
      if (result.tracklist && result.tracklist.length) payload.tracklist = result.tracklist;

      if (!Object.keys(payload).length) {
        showToast(`No se pudo identificar "${album.title}" con confianza.`);
        return;
      }

      const { error } = await sb.from("albums").update(payload).eq("id", id);
      if (error) throw error;
      await fetchAlbums();
      renderAdminTable();
      renderCatalog();
      showToast(`"${payload.title || album.title}" actualizado con IA.`);
    } catch (err) {
      console.error(err);
      showToast(`No se pudo re-analizar "${album.title}": ` + (err.message || ""));
    } finally {
      btnEl.disabled = false;
      btnEl.innerHTML = originalHtml;
    }
  }

  // Re-analiza TODOS los discos que tengan portada, uno por uno (con una
  // pequeña pausa entre cada uno para no saturar la API de Gemini).
  els.aiBulkBtn.addEventListener("click", async () => {
    const targets = albums.filter((a) => a.cover);
    if (!targets.length) {
      showToast("No hay discos con portada para analizar.");
      return;
    }
    const ok = window.confirm(
      `Esto va a analizar ${targets.length} disco(s) con IA, uno por uno. Puede tardar varios minutos y usa tu cuota de la API de Gemini. ¿Continuar?`
    );
    if (!ok) return;

    els.aiBulkBtn.disabled = true;
    els.aiBulkProgress.classList.remove("hidden");
    let done = 0;
    let okCount = 0;
    let failCount = 0;

    for (const album of targets) {
      done++;
      els.aiBulkProgress.textContent = `Analizando con IA… ${done} de ${targets.length} (${album.title})`;
      try {
        const result = await identifyAlbumWithAI({ imageUrl: album.cover });
        const payload = {};
        if (result.title) payload.title = result.title;
        if (result.artist) payload.artist = result.artist;
        if (result.year) payload.year = result.year;
        if (result.tracklist && result.tracklist.length) payload.tracklist = result.tracklist;

        if (Object.keys(payload).length) {
          const { error } = await sb.from("albums").update(payload).eq("id", album.id);
          if (error) throw error;
          okCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error("Falló re-análisis de", album.title, err);
        failCount++;
      }
      // pequeña pausa entre pedidos para no saturar la API
      await new Promise((r) => setTimeout(r, 400));
    }

    await fetchAlbums();
    renderAdminTable();
    renderCatalog();
    els.aiBulkProgress.classList.add("hidden");
    els.aiBulkBtn.disabled = false;
    showToast(`Listo: ${okCount} actualizados, ${failCount} sin cambios.`);
  });

  els.fAudioFile.addEventListener("change", () => {
    const file = els.fAudioFile.files && els.fAudioFile.files[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      showToast("Elegí un archivo de audio válido.");
      return;
    }
    audioFile = file;
    audioCleared = false;
    setAudioPreview(file.name, URL.createObjectURL(file));
  });

  els.clearAudioBtn.addEventListener("click", () => {
    clearAudioUpload();
    audioCleared = true;
  });

  function startEdit(id) {
    const album = albums.find((a) => a.id === id);
    if (!album) return;
    editingId = id;
    els.fId.value = album.id;
    els.fTitle.value = album.title || "";
    els.fArtist.value = album.artist || "";
    els.fYear.value = album.year || "";
    els.fDiscos.value = album.discos || 1;

    coverFile = null;
    coverCleared = false;
    coverExistingUrl = album.cover || "";
    els.fCoverFile.value = "";
    els.fCover.value = "";
    setCoverPreview(coverExistingUrl);

    audioFile = null;
    audioCleared = false;
    audioExistingUrl = album.audio_url || "";
    els.fAudioFile.value = "";
    setAudioPreview(audioExistingUrl ? "Audio ya cargado" : "Sin audio cargado", audioExistingUrl);

    els.fDesc.value = album.description || "";
    els.fTracks.value = Array.isArray(album.tracklist) ? album.tracklist.join("\n") : "";
    els.formTitle.textContent = `Editando: ${album.title}`;
    els.submitBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4Z"/></svg>
      Actualizar disco`;
    els.cancelEditBtn.hidden = false;
    renderTrackAudioSection(album);
    els.fTitle.scrollIntoView({ behavior: "smooth", block: "start" });
    els.fTitle.focus();
  }

  /* -------------------------------------------------------
     9c. AUDIO COMPLETO POR CANCIÓN (subida manual por tema)
     ------------------------------------------------------- */
  function renderTrackAudioSection(album) {
    const tracks = Array.isArray(album.tracklist) ? album.tracklist.filter(Boolean) : [];
    if (!tracks.length) {
      els.trackAudioSection.hidden = true;
      els.trackAudioList.innerHTML = "";
      return;
    }

    els.trackAudioSection.hidden = false;
    const trackAudio = album.track_audio || {};

    els.trackAudioList.innerHTML = tracks
      .map((t, i) => {
        const hasAudio = Boolean(trackAudio[String(i)]);
        return `
        <div class="track-audio-row" data-index="${i}">
          <span class="track-audio-num">${String(i + 1).padStart(2, "0")}</span>
          <span class="track-audio-title">${escapeHtml(t)}</span>
          <span class="track-audio-status ${hasAudio ? "has-audio" : ""}" data-role="status">
            ${hasAudio ? "✓ Cargada" : "Sin audio"}
          </span>
          <label class="btn btn-ghost btn-file" data-role="upload-label">
            Subir
            <input type="file" accept="audio/*" hidden data-role="upload-input">
          </label>
          <button type="button" class="icon-btn danger" data-role="remove-btn" title="Quitar audio" ${hasAudio ? "" : "hidden"}>
            <svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M6 7h12l-1 14H7ZM9 4h6l1 2H8Z"/></svg>
          </button>
        </div>`;
      })
      .join("");

    els.trackAudioList.querySelectorAll(".track-audio-row").forEach((row) => {
      const index = Number(row.dataset.index);
      const input = row.querySelector('[data-role="upload-input"]');
      const removeBtn = row.querySelector('[data-role="remove-btn"]');

      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (!file.type.startsWith("audio/")) {
          showToast("Elegí un archivo de audio válido.");
          return;
        }
        await saveTrackAudio(album.id, index, file, row);
      });

      removeBtn.addEventListener("click", async () => {
        await removeTrackAudio(album.id, index, row);
      });
    });
  }

  async function saveTrackAudio(albumId, index, file, row) {
    const label = row.querySelector('[data-role="upload-label"]');
    const status = row.querySelector('[data-role="status"]');
    const originalLabel = label.textContent;
    label.textContent = "Subiendo…";
    try {
      const url = await uploadToBucket(file, AUDIO_BUCKET, `track-${albumId}-${index}`);
      const album = albums.find((a) => a.id === albumId);
      const updatedTrackAudio = { ...(album && album.track_audio ? album.track_audio : {}) };
      updatedTrackAudio[String(index)] = url;

      const { error } = await sb.from("albums").update({ track_audio: updatedTrackAudio }).eq("id", albumId);
      if (error) throw error;

      await fetchAlbums();
      const refreshed = albums.find((a) => a.id === albumId);
      if (refreshed) renderTrackAudioSection(refreshed);
      renderAdminTable();
      renderCatalog();
      showToast("Canción cargada completa.");
    } catch (err) {
      console.error(err);
      showToast("No se pudo subir el audio de esta canción.");
      label.textContent = originalLabel;
    }
  }

  async function removeTrackAudio(albumId, index, row) {
    try {
      const album = albums.find((a) => a.id === albumId);
      const updatedTrackAudio = { ...(album && album.track_audio ? album.track_audio : {}) };
      delete updatedTrackAudio[String(index)];

      const { error } = await sb.from("albums").update({ track_audio: updatedTrackAudio }).eq("id", albumId);
      if (error) throw error;

      await fetchAlbums();
      const refreshed = albums.find((a) => a.id === albumId);
      if (refreshed) renderTrackAudioSection(refreshed);
      renderAdminTable();
      renderCatalog();
      showToast("Audio quitado.");
    } catch (err) {
      console.error(err);
      showToast("No se pudo quitar el audio.");
    }
  }

  async function deleteAlbum(id) {
    const album = albums.find((a) => a.id === id);
    if (!album) return;
    const ok = window.confirm(`¿Eliminar "${album.title}" de la colección? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      const { error } = await sb.from("albums").delete().eq("id", id);
      if (error) throw error;
      await fetchAlbums();
      renderAdminTable();
      renderCatalog();
      showToast(`"${album.title}" eliminado.`);
      if (editingId === id) resetForm();
    } catch (err) {
      console.error(err);
      showToast("No se pudo eliminar. Revisá tu conexión.");
    }
  }

  els.cancelEditBtn.addEventListener("click", resetForm);

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) { showToast("No hay conexión con Supabase."); return; }

    const title = els.fTitle.value.trim();
    const artist = els.fArtist.value.trim();
    if (!title || !artist) {
      showToast("Título y artista son obligatorios.");
      return;
    }

    const tracklist = els.fTracks.value
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    els.submitBtn.disabled = true;
    const originalBtnHtml = els.submitBtn.innerHTML;
    els.submitBtn.innerHTML = `<svg class="spin-icon" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z"/></svg> Guardando…`;

    try {
      let coverUrl = coverExistingUrl;
      if (coverFile) {
        coverUrl = await uploadToBucket(coverFile, COVER_BUCKET, slugify(title));
      } else if (els.fCover.value.trim()) {
        coverUrl = els.fCover.value.trim();
      } else if (coverCleared) {
        coverUrl = "";
      }

      let audioUrl = audioExistingUrl;
      if (audioFile) {
        audioUrl = await uploadToBucket(audioFile, AUDIO_BUCKET, slugify(title));
      } else if (audioCleared) {
        audioUrl = "";
      }

      const payload = {
        title,
        artist,
        year: els.fYear.value ? Number(els.fYear.value) : null,
        discos: els.fDiscos.value ? Number(els.fDiscos.value) : 1,
        cover: coverUrl,
        audio_url: audioUrl,
        description: els.fDesc.value.trim(),
        tracklist,
      };

      if (editingId) {
        const { error } = await sb.from("albums").update(payload).eq("id", editingId);
        if (error) throw error;
        showToast(`"${title}" actualizado correctamente.`);
      } else {
        const { error } = await sb.from("albums").insert(payload);
        if (error) throw error;
        showToast(`"${title}" agregado a la colección.`);
      }

      await fetchAlbums();
      resetForm();
      renderAdminTable();
      renderCatalog();
    } catch (err) {
      console.error(err);
      showToast("No se pudo guardar: " + (err.message || "revisá tu conexión con Supabase."));
      els.submitBtn.disabled = false;
      els.submitBtn.innerHTML = originalBtnHtml;
    }
  });

  /* -------------------------------------------------------
     10. UTILIDADES
     ------------------------------------------------------- */
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }

  let toastTimer = null;
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3200);
  }

  /* -------------------------------------------------------
     11. INIT
     ------------------------------------------------------- */
  init();
})();

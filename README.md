# Vinilos de la Carrera

Archivo digital de una **colección personal de vinilos**, no una tienda. Permite consultar ediciones y copias físicas, importar datos verificables de MusicBrainz y reproducir únicamente archivos para los que el propietario haya registrado una autorización de difusión. No incluye compras, precios de venta, reseñas ficticias ni estadísticas inventadas.

> **PREPRODUCCIÓN NO APROBADA.** Este README describe el código local, **no** la versión que sirve actualmente `vinilosdelacarrera.netlify.app`. Esa versión anterior expone archivos heredados y no debe considerarse apta para producción. El único proyecto Supabase autorizado ahora es `ujswessaedegncxeoeio`; su esquema, RLS y Storage aún no se han podido inspeccionar. No aplicar migraciones ni desplegar hasta completar el preflight descrito en [AUDITORIA_PREPRODUCCION.md](AUDITORIA_PREPRODUCCION.md).

## Arquitectura y stack

| Capa | Implementación |
|---|---|
| Sitio público | HTML, CSS y JavaScript sin framework en `public/`; tipografía de sistema, sin CDN ni analytics |
| API y administración | Netlify Functions en Node.js 22; cookies de sesión firmadas y revocables |
| Datos | Supabase PostgreSQL: ediciones (`albums`), pistas (`tracks`), ejemplares (`physical_copies`), sesiones, control de intentos y caché |
| Archivos | Supabase Storage: portadas verificadas en `portadas`; audio autorizado en bucket privado `canciones` |
| Fuente musical | MusicBrainz Web Service 2; búsqueda por código o artista/título, revisión humana e importación de la **edición** concreta |

El navegador no contiene claves de Supabase ni accede a la base directamente. La API entrega una proyección pública que excluye notas privadas, URLs de audio heredadas y portadas sin procedencia declarada. Sólo la función server-side usa `service_role`. No hay cuenta para visitantes; un único propietario puede administrar.

## Identificación y reproducción

1. El administrador busca por código de barras (prioritario) o por artista y título, opcionalmente con número de catálogo. MusicBrainz devuelve candidatos con confianza alta, media o baja. El administrador revisa la edición y su lista de pistas antes de confirmar.
2. El servidor vuelve a consultar o recupera de caché la edición por MBID, detecta duplicados por MBID y posibles coincidencias por código o artista/título, y crea edición, pistas y primera copia física en una transacción SQL. Los campos ausentes permanecen vacíos; no se inventan canciones, año ni procedencia.
3. Metadatos y permisos de audio son independientes. Una pista recién importada indica «Audio no disponible». Sólo un archivo subido por el propietario con declaración de autorización pasa a `AUTHORIZED`/`FULL_AUDIO`. El archivo se guarda en bucket privado; la API genera una URL firmada de cinco minutos únicamente para esa pista. El administrador puede retirar el audio.
4. El reproductor ofrece play/pausa, seek, volumen, mute, anterior/siguiente y cola reordenable. «Reproducir pistas autorizadas» prepara la reproducción continua de una edición. No se usa iTunes, YouTube, extracción de streams ni una vista previa de terceros.

Una declaración escrita en el panel **no demuestra jurídicamente** que el propietario pueda difundir una grabación. Antes de subir audio, debe conservar autorización verificable de quienes correspondan. Tener un vinilo o un archivo privado no equivale a tener derechos de comunicación pública.

MusicBrainz documenta su [API](https://musicbrainz.org/doc/MusicBrainz_API), la [limitación de una petición por segundo y User-Agent identificable](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), y distingue [datos centrales CC0 de datos suplementarios con otras condiciones](https://musicbrainz.org/doc/About/Data_License). Esta implementación usa datos básicos de edición y pistas, con atribución visible y enlace a la fuente. La caché dura siete días y puede renovarse manualmente desde la API. El servidor retorna `429` cuando el límite compartido está ocupado; no reintenta en bucle.

## Instalación

Requisitos: Node.js `>=22.13.0`, npm, un sitio Netlify y un proyecto Supabase **dedicado o auditado**. No se ha verificado la configuración de las cuentas remotas ni sus backups.

1. Ejecutar `npm ci`.
2. Primero inspeccionar el esquema, historial, RLS, grants, buckets y objetos del proyecto nuevo con acceso de solo lectura; no asumir que está vacío. Respaldar la base y Storage y ensayar en un clon. Sólo si el preflight lo confirma, aplicar en orden [`202610010001_secure_albums.sql`](supabase/migrations/202610010001_secure_albums.sql) y [`202610010002_music_archive.sql`](supabase/migrations/202610010002_music_archive.sql). La primera **se detiene si ya existen políticas de `storage.objects`**: hay que auditarlas manualmente. No se eliminan políticas ajenas automáticamente.
3. Ejecutar `npm run secrets:generate`. Guardar la contraseña generada fuera del repositorio y configurar sólo el hash y secreto de sesión en Netlify.
4. Configurar las variables siguientes en Netlify y, para desarrollo local, en `.env` (partiendo de `.env.example`; este archivo está ignorado por Git). No configurar secretos en `public/`.
5. Ejecutar `netlify dev` para servir sitio y funciones. `npm run build` verifica los artefactos pero no genera otro directorio: Netlify publica exclusivamente `public/`.

| Variable | Finalidad |
|---|---|
| `SUPABASE_URL` | URL HTTPS del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Credencial privilegiada, sólo en Functions |
| `ADMIN_PASSWORD_HASH` | Hash scrypt del propietario |
| `SESSION_SECRET` | Secreto aleatorio de al menos 32 bytes para cookies |
| `SITE_URL` | Origen HTTPS canónico, requerido en producción para validar CSRF |
| `MUSICBRAINZ_CONTACT` | URL HTTPS de contacto para el User-Agent de MusicBrainz; si falta se usa `SITE_URL` |

No hay `GEMINI_API_KEY`, claves públicas de Supabase ni proveedor de streaming. El código de barras, sello, país y número de catálogo son datos opcionales. Las condiciones de copia usan la escala M/NM/VG+/VG/G+/G/F/P; las notas de copia son privadas.

## API y permisos

| Ruta | Acceso | Uso |
|---|---|---|
| `GET /api/albums` | público | Catálogo saneado, pistas y copias sin notas privadas |
| `POST /api/login`, `GET /api/session`, `POST /api/logout` | sesión | Inicio, comprobación y revocación |
| `POST /api/albums`, `PUT /api/albums/:id`, `DELETE /api/albums/:id` | administrador | CRUD de edición; edición con control optimista `expectedUpdatedAt` |
| `POST /api/albums/:id/copies`, `PUT /api/copies/:id` | administrador | Registro de ejemplares físicos |
| `PUT /api/tracks/:id` | administrador | Corrección manual de título/artista |
| `POST /api/upload` | administrador | Portada propia o licenciada, máximo 4 MB |
| `POST /api/tracks/:id/audio`, `DELETE /api/tracks/:id/audio` | administrador | Subir con declaración de permiso o retirar audio |
| `GET /api/tracks/:id/playback` | público, sólo autorizadas | URL temporal de audio privado |
| `GET /.netlify/functions/music?mode=search|release`, `POST ...?mode=import` | administrador | Búsqueda, revisión e importación MusicBrainz |

Las mutaciones requieren sesión y origen válido. Las cargas se limitan a 4 MB y verifican MIME y firma binaria. La contraseña usa scrypt con sal; la cookie es `HttpOnly`, `Secure`, `SameSite=Strict` y vence en ocho horas. El login tiene limitación persistente de intentos. Las tablas sensibles tienen RLS y no conceden acceso a `anon`/`authenticated`.

## Privacidad, accesibilidad y publicación

La intención actual es un **catálogo público** con área de administración privada. Hay una sola cookie necesaria de sesión; no hay cookies opcionales ni rastreadores, por lo que no se muestra un banner de consentimiento ficticio. Las políticas describen el comportamiento implementado: [privacidad](public/politica-de-privacidad/index.html) y [cookies](public/politica-de-cookies/index.html). Las imágenes externas autorizadas pueden comunicar la IP del visitante a su host; por ello conviene usar fotografías propias alojadas en `portadas`.

Las [condiciones de uso](public/terminos-y-condiciones/index.html) describen la consulta del archivo sin ventas ni reembolsos. El responsable y canal de contacto siguen pendientes; las páginas legales no han sido comprobadas en el despliegue nuevo.

Antes de publicar, completar el responsable y canal real de contacto indicados como **PENDIENTE DE CONFIRMACIÓN**, revisar los plazos y jurisdicciones de Netlify/Supabase, auditar licencias de cada portada y archivo, y verificar el sitio desplegado con teclado, lector de pantalla y tamaños de móvil. El objetivo de accesibilidad es [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/), pero no se declara conformidad certificada. También deben probarse backup y restauración, que no son verificables desde este repositorio. En Chile, revisar la [Ley 19.628](https://www.bcn.cl/leychile/Navegar?idNorma=141599&idVersion=2023-05-09), la [Ley 21.719](https://www.bcn.cl/leychile/navegar?idNorma=1209272) de vigencia diferida y la [Ley 17.336](https://www.bcn.cl/leychile/navegar?idNorma=28933) de propiedad intelectual con asesoría apropiada.

## Calidad y despliegue

```bash
npm run check
npm run security:audit
```

`check` ejecuta ESLint, tests de Node y verificación de build. No hay TypeScript, por lo que no existe un `typecheck` separado. Los tests locales no sustituyen una prueba end-to-end contra Supabase/Netlify reales. Para desplegar: aplicar migraciones tras backup, configurar variables, conectar Netlify, desplegar y probar login, importación, copias, portada, audio autorizado, retiro, logout y lectura pública. No se modificaron servicios remotos desde este trabajo.

### Estado del proyecto Supabase `ujswessaedegncxeoeio` (verificado 2026-10-01)

Migraciones 001, 002 y 003 **APLICADAS** y registradas en el historial remoto. Verificación de solo lectura posterior:

| Elemento | Estado |
|---|---|
| 7 tablas (`albums`, `tracks`, `physical_copies`, `admin_sessions`, `admin_login_attempts`, `music_metadata_cache`, `external_api_throttle`) | APLICADO |
| RLS habilitada y forzada en las 7 | APLICADO |
| Policies en `public` y `storage` | 0, por diseño: solo `service_role` accede |
| Grants de tablas a `anon`/`authenticated`/`PUBLIC` | 0 |
| 6 funciones: ejecutables solo por `service_role` | APLICADO |
| Triggers `albums_sync_manual_tracks`, `albums_initialize_copy` | APLICADO |
| Buckets `portadas` (público) y `canciones` (privado), 4 MB | APLICADO |
| Signed URLs de audio y pruebas end-to-end | NO VERIFICADO: requiere Functions desplegadas en Netlify |

### Estado del despliegue (verificado 2026-10-02)

Sitio: https://vinilosdelacarreralantadilla.netlify.app (Netlify, rama `main`, deploy automático).

| Comprobación | Resultado |
|---|---|
| `/`, páginas legales | 200 |
| `/files.zip`, `/identify-album.js`, `/.env`, rutas inventadas | 404 |
| Cabeceras CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy | presentes |
| `GET /api/albums` (lectura pública desde Supabase) | 200 |
| `POST /api/login` con contraseña incorrecta | 401 |
| Login admin válido, subida de portada/audio, signed URLs | NO VERIFICADO |

Las variables de las Functions se cargan en el panel de Netlify (`npm run secrets:generate` y `scripts/setup-netlify-env.js` generan los valores; los archivos resultantes están ignorados por git y deben borrarse tras importar). Si el escáner de secretos de Netlify falla, las claves de URL pública están excluidas en `netlify.toml`.

Pendiente: probar login admin y subidas con la contraseña de `.env.admin-password`, y rotar cualquier credencial que estuviera en el frontend histórico.

Si aparece un `429` al buscar música, esperar un segundo y reintentar. Si la búsqueda no funciona, comprobar `MUSICBRAINZ_CONTACT` y los logs de Functions. Si una ficha devuelve error, verificar las tres migraciones y credenciales Supabase. Un `409` indica edición existente, posible duplicado o conflicto de actualización. No reutilizar contraseñas que pudieran haber aparecido en versiones históricas del repositorio: rotarlas.

No existe licencia de distribución en el repositorio. El código, fotos y audios no deben redistribuirse suponiendo una licencia implícita.

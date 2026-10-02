# Auditoría de preproducción — 2026-10-01 (actualizada con preflight remoto)

Alcance: revisión local y pruebas HTTP de **sólo lectura** del sitio indicado por el propietario (`https://vinilosdelacarrera.netlify.app/`) y del host del nuevo proyecto Supabase `ujswessaedegncxeoeio`. No hubo acceso a paneles Supabase/Netlify ni a la base de datos. El propietario creó el proyecto nuevo; este trabajo no creó proyectos, aplicó migraciones, desplegó, subió archivos ni borró datos. **Estado global: PREPRODUCCIÓN NO APROBADA**.

## Estado de la evidencia

| Categoría | Resultado |
|---|---|
| VERIFICADO LOCALMENTE | `npm run check`: ESLint, 22 tests y build correctos; `npm run security:audit` y `npm audit`: 0 vulnerabilidades reportadas; `git diff --check`: sin errores. `public/` contiene HTML/CSS/JS y páginas legales, sin medios estáticos. La Function de portadas ahora exige procedencia declarada antes de subir al bucket público. |
| VERIFICADO CONTRA NETLIFY REAL | Dominio objetivo responde 200 en `/` y `/app.js`; sirve el frontend antiguo. `/politica-de-privacidad/`, `/politica-de-cookies/`, `/api/albums` y `/api/session` responden 404. `/files.zip` y `/identify-album.js` responden 200. El HTML estático no envía CSP ni Referrer-Policy; HSTS sí aparece. |
| VERIFICADO CONTRA SUPABASE REAL | El **nuevo proyecto autorizado** `ujswessaedegncxeoeio` resuelve por DNS y `GET /rest/v1/` responde 401 sin credenciales. Esto prueba disponibilidad del host, **no** schema, RLS, policies ni datos. |
| NO VERIFICADO | Migraciones aplicadas, datos reales, RLS/policies/grants efectivos, objetos y licencias, variables/build/funciones del panel Netlify, cookies completas del navegador, accesibilidad con lector de pantalla y flujo end-to-end. |
| BLOQUEADO — REQUIERE ACCESO | Conectar la integración/autorización al proyecto nuevo `ujswessaedegncxeoeio` para SQL read-only y Storage; no hay credenciales locales ni conexión de cuenta. En Netlify, acceso al sitio correcto para revisar configuración, variables y logs, y desplegar una versión sin artefactos heredados. |

El worktree está sin confirmar. El propietario creó y señaló como único objetivo el nuevo Project Ref `ujswessaedegncxeoeio`; el proyecto histórico queda descartado. La búsqueda del árbol de trabajo actual no encontró el identificador histórico literal en archivos funcionales ni documentación; el historial Git y el despliegue actual siguen conteniendo el frontend anterior y no pueden corregirse con cambios locales no desplegados. `supabase/config.toml`, `.env` y `.netlify/state.json` no existen; `.env.example` se actualizó con la URL pública nueva. Las Functions locales ahora rechazan cualquier `SUPABASE_URL` que no sea el host nuevo. Esto es un bloqueo de configuración segura, **no** una vinculación de CLI ni una conexión remota. La integración de Supabase disponible en esta sesión permanece sin instalar/conectar; el directorio global `.supabase` sólo contiene trazas y telemetría, no una conexión utilizable. `.netlify/` está ignorada y contiene artefactos locales obsoletos, incluido `identify-album.zip`; la limpieza de ese caché fue rechazada por el entorno y no debe usarse como fuente de deploy.

**Incidente crítico en el despliegue actual:** `/app.js` publicado contiene una asignación literal de `ADMIN_PASSWORD` y un JWT con rol `anon`; `/files.zip` público contiene otra copia de `app.js` con esa asignación. No se reprodujo ni guardó ningún valor en este informe. No se encontró un marcador `service_role` en esos dos artefactos públicos inspeccionados, pero eso no prueba ausencia en otros lugares. Restringir/despublicar la versión antigua y rotar la contraseña antes de publicar el proyecto nuevo; revisar también las credenciales históricas. El proyecto descartado no se usará para operaciones ni preflight adicional.

## Bloqueos de producción

1. **Supabase nuevo no auditado por dentro.** Hay dos migraciones locales, en este orden: `202610010001_secure_albums.sql` y `202610010002_music_archive.sql`. Estado de cada una en `ujswessaedegncxeoeio`: **NO VERIFICABLE** sin SQL de lectura autorizado. No se aplicaron. Si se ejecutaron por SQL Editor, puede no existir registro en `supabase_migrations.schema_migrations`; verificar el esquema efectivo, no sólo historial.
2. **Netlify sirve una versión vulnerable anterior.** El dominio y varias respuestas se verificaron por HTTP, pero no hay acceso al panel para confirmar branch, build, variables de Functions ni logs. `netlify.toml` local fija `publish = "public"`, `functions = "netlify/functions"` y `command = "npm run check"`; el deploy actual no corresponde a ese árbol. [Netlify indica](https://docs.netlify.com/build/functions/environment-variables/) que variables de `netlify.toml` no están disponibles automáticamente para Functions; configurar secretos en el sitio con ámbito Functions.
3. **Derechos y privacidad sin evidencia remota.** No hay inventario de objetos reales de Storage ni prueba documental de portadas/audio. Falta responsable y canal de contacto en la política. No se pueden certificar derechos ni tratamiento de datos del entorno real.
4. **Archivos heredados activos.** `/files.zip` y `/identify-album.js` responden 200 en el dominio real. `GET /.netlify/functions/identify-album` respondió 404, pero eso sólo prueba ese método/ruta en el momento de la consulta; comprobar inventario de Functions del panel tras un build limpio.

## Supabase: modelo y permisos esperados, no constatados

| Objeto | Relaciones, índices y constraints locales | RLS / acceso esperado |
|---|---|
| `albums` | PK `id`; índices MBID único parcial, `lower(artist),lower(title)`, barcode; checks de título, artista, año, discos, JSON. | RLS habilitada y forzada; policies de `albums` eliminadas por 001; grants `anon`/`authenticated` revocados. |
| `tracks` | FK `album_id` `ON DELETE CASCADE`; único `(album_id,disc_number,track_number)`; índice de orden; checks de duración y derechos. | RLS habilitada y forzada; grants revocados; 002 **no elimina policies preexistentes** si la tabla ya existía. |
| `physical_copies` | FK `album_id` en cascada; índice de FK; checks de condición y longitud de notas. | Igual a `tracks`. |
| `admin_sessions` | PK hash; índice de expiración. | RLS habilitada y forzada; grants revocados; policies preexistentes no se borran. |
| `admin_login_attempts` | PK; índice `(client_key,attempted_at)`. | Igual. |
| `music_metadata_cache` | PK `release_id`, TTL en `expires_at`. | RLS habilitada y forzada; grants revocados; policies preexistentes no se borran. |
| `external_api_throttle` | PK `provider`. | Igual. |

No hay policies de SELECT/INSERT/UPDATE/DELETE creadas para estas tablas; la API usa `service_role` y [éste omite RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Por eso **RLS no protege de un error de autorización en la Function**. Auditar `PUBLIC` grants, privilegios por defecto, secuencias, funciones RPC y cualquier policy preexistente: revocar de `anon` y `authenticated` no equivale a demostrar que no existe una concesión a `PUBLIC`. No hay ownership por usuario: es un único administrador y catálogo público; no puede demostrarse aislamiento entre usuarios distintos porque el sistema no los modela.

La migración 001 crea/endurece tablas y buckets; puede fallar al validar constraints de datos históricos y **se detiene si encuentra cualquier policy en `storage.objects`**, para no borrar reglas de otros proyectos. La 002 agrega entidades, índices, triggers, caché y RPC; hace backfill de copias/pistas, pone `canciones` privado y elimina la RPC antigua. `sync_manual_tracks` reemplaza pistas al cambiar el tracklist manual (impide hacerlo si alguna está `AUTHORIZED`), por lo que hay que respaldar y probar con copia de datos. No ejecutar 002 aislada ni en producción sin preflight.

### Storage: quién puede hacer qué según el SQL local

| Bucket / recurso | Lectura | Subida | Modificación / borrado |
|---|---|---|---|
| `portadas` público | Cualquiera con URL pública, incluso si la ficha aún no publica la portada. | Sólo la Function con `service_role` tras sesión admin; Storage no debería admitir subida anónima si no hay policies adicionales. | Sólo la Function con `service_role`; se intenta borrar al editar/eliminar ficha. |
| `canciones` privado | Descarga directa debe requerir JWT/policy o URL firmada. La API emite URL firmada por **300 s a cualquier visitante** si `rights_status=AUTHORIZED`, `playback_type=FULL_AUDIO` y hay `storage_path`. Es audio público en efecto, aunque el bucket sea privado. | Sólo Function con `service_role` tras sesión admin y declaración textual de derechos. | Sólo Function con `service_role`; revocar/desasociar no prueba invalidación instantánea de una URL ya emitida. |

Un bucket público permite lectura por URL independientemente de la RLS de lectura de objetos, según [Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals). Una `service_role` puede operar fuera de las policies de Storage, según [Supabase](https://supabase.com/docs/guides/storage/security/access-control). La Function local `/api/upload` fue corregida para exigir procedencia declarada antes de subir al bucket público; **no es verificación jurídica** y todavía no está desplegada. El flujo sigue pudiendo dejar una portada huérfana si la subida funciona pero falla el guardado de la ficha. **Riesgo medio:** si falla limpieza de Storage tras borrar la fila, quedan objetos huérfanos (portadas públicas o audios privados).

### Consultas de preflight, sólo lectura

Ejecutar en el proyecto Supabase correcto, con cuenta autorizada, y guardar los resultados sin secretos:

```sql
select to_regclass('supabase_migrations.schema_migrations') as migration_history;
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('r','p') and n.nspname in ('public','storage')
  and c.relname in ('albums','tracks','physical_copies','admin_sessions',
    'admin_login_attempts','music_metadata_cache','external_api_throttle','objects','buckets');
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where (schemaname='public' and tablename in
  ('albums','tracks','physical_copies','admin_sessions','admin_login_attempts',
   'music_metadata_cache','external_api_throttle'))
  or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where (table_schema='public' and table_name in
  ('albums','tracks','physical_copies','admin_sessions','admin_login_attempts',
   'music_metadata_cache','external_api_throttle'))
   or (table_schema='storage' and table_name='objects')
order by table_schema,table_name,grantee,privilege_type;
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id in ('portadas','canciones');
select bucket_id, count(*) as objects_count
from storage.objects where bucket_id in ('portadas','canciones') group by bucket_id;
select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema in ('public','storage')
order by table_schema, table_name, ordinal_position;
select n.nspname as schema_name, c.relname as table_name,
       con.conname, con.contype, pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage') order by 1,2,3;
select schemaname, tablename, indexname, indexdef
from pg_indexes where schemaname in ('public','storage') order by 1,2,3;
select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by 1,2,3;
select n.nspname as schema_name, c.relname as table_name,
       t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname in ('public','storage') order by 1,2,3;
select schemaname, viewname, definition
from pg_views where schemaname='public' order by viewname;
```

Si existe tabla de historial, consultar sus versiones por separado; si no, comparar columnas, índices, triggers, funciones, grants y buckets efectivos con los dos archivos SQL. Las definiciones pueden contener datos sensibles: guardar resultados en un canal seguro, no en el informe público. Hacer backup verificable y ensayo en un clon antes de aplicar.

## Netlify y seguridad de aplicación

`public/` sólo contiene HTML/CSS/JS y páginas legales; `.env` y código de Functions están fuera de él. Esto prueba **sólo el árbol local**. El dominio real sigue sirviendo archivos de la raíz antigua: `files.zip` e `identify-album.js` son accesibles y las rutas legales nuevas no existen. Hay rewrite local forzado `/api/*` a la Function `api`; en el dominio real `/api/albums` responde 404, por lo que el rewrite nuevo no está desplegado. No hay rutas de álbum profundas implementadas; una URL inventada `/album/:id` debe dar 404, no fallback SPA.

`[[headers]]` configura CSP, HSTS, anti-framing, `nosniff`, referrer y permissions policy para archivos estáticos **del futuro deploy**. En el HTML real consultado no aparecieron CSP ni Referrer-Policy; sí HSTS. [Netlify advierte](https://docs.netlify.com/manage/routing/headers/) que headers personalizados de este tipo **no se aplican automáticamente a respuestas de Functions**; la API local sí envía `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`, pero no todos los headers estáticos. Falta verificar respuestas después de un deploy corregido.

La simulación `npm exec --yes --package=netlify-cli -- netlify build --dry` **no pudo ejecutarse**: Netlify CLI devolvió «Could not find the project ID» porque esta carpeta no está vinculada a un sitio. No se ejecutó `netlify link`, `init` ni `deploy`. El dominio público proporcionado permite pruebas HTTP, no acceso a configuración de cuenta.

| Variable | Necesaria en el código local | Alcance / sensibilidad | Configurada en el entorno local | Configurada en Netlify real |
|---|---|---|---|---|
| `SUPABASE_URL` | Sí | Function; URL de proyecto, no clave | No | NO VERIFICADO |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Function; secreta y omite RLS | No | NO VERIFICADO |
| `ADMIN_PASSWORD_HASH` | Sí | Function; sensible | No | NO VERIFICADO |
| `SESSION_SECRET` | Sí | Function; secreto | No | NO VERIFICADO |
| `SITE_URL` | Sí para origen de producción | Function; URL pública | No | NO VERIFICADO |
| `MUSICBRAINZ_CONTACT` | Sí o `SITE_URL` válido | Function; URL pública de contacto | No | NO VERIFICADO |

`.env.example` contiene sólo placeholders y campos vacíos. No hay `.env` local ni `supabase/config.toml`. El frontend actual no usa `SUPABASE_ANON_KEY`; el **frontend desplegado antiguo** sí incorpora un JWT `anon`, por lo que README y despliegue no representan la misma versión.

| Riesgo auditado | Resultado local |
|---|---|
| IDOR/BOLA/IDs | Los endpoints de mutación validan sesión y enteros positivos. Cualquier admin puede editar cualquier ID: no hay usuarios con propiedad separada. La reproducción por ID es pública si la pista tiene derechos marcados. Sin pruebas remotas de aislamiento. |
| Escalada / RLS | API con `service_role` omite RLS por diseño; dependencia fuerte de `requireMutation` y de secreto no expuesto. No hay RBAC granular. |
| XSS | Las cadenas renderizadas en HTML dinámico se escapan; CSP estática sin `unsafe-inline`. URLs de portada restringidas a HTTPS. No hay prueba dinámica con payloads ni CSP del deploy. |
| CSRF/CORS | Mutaciones exigen `Origin` permitido y cookie `SameSite=Strict`; no se declara CORS permisivo. Validar cabeceras que realmente entrega Netlify. |
| Sesiones | Hash scrypt; cookie firmada HttpOnly/Secure/Strict de 8 h; hash de token en DB, logout revoca. Falta ensayo remoto de login/logout/rotación. |
| Rate limiting | Login: 5 intentos/15 min por huella HMAC de IP; MusicBrainz: reserva global de 1 llamada/s. Endpoint público de emisión de signed URLs no tiene límite propio: posible abuso/coste. Cabecera IP de Netlify sin verificar en vivo. |
| Upload/traversal | 4 MB, MIME y magic bytes; nombres generados con UUID, sin ruta del usuario. No hay transcodificación/escaneo antimalware; los magic bytes son una comprobación parcial. |
| Secretos | No aparecen `service_role`/hash en `public/` actual. Sin embargo, el `app.js` y ZIP del deploy antiguo exponen una contraseña administrativa literal; se detectó además un JWT público con rol `anon`. No se observó marcador de `service_role` en esos dos artefactos, pero hay que auditar y rotar credenciales históricas. |

La separación metadata/audio es clara en el código local: MusicBrainz sólo aporta metadatos; pistas importadas no tienen fuente de reproducción. La API local oculta `audio_url`/`track_audio` históricos y retiró la ruta antigua. El deployment remoto aún sirve un `app.js` con referencias a audio heredado; no hay inventario de objetos reales legibles por URL. `GET /.netlify/functions/identify-album` dio 404, pero no reemplaza la inspección del listado de Functions. El navegador **del código local** reproduce URLs temporales de Supabase únicamente para pistas marcadas `AUTHORIZED`. La nota de derechos es una declaración del administrador, no prueba de licencia.

## Privacidad: datos que el código realmente procesa

| Dato | Dónde se recopila | Para qué | Dónde se guarda | Quién puede verlo |
|---|---|---|---|---|
| IP y metadatos técnicos HTTP | Solicitudes al hosting/Functions | Entrega, seguridad y limitación de login | Logs del proveedor: retención NO VERIFICADA; HMAC de IP en `admin_login_attempts` | Proveedor y operadores autorizados; hash en DB para backend |
| Contraseña administrativa | Formulario de login | Verificar acceso | No se guarda en claro; hash configurado en Netlify | Function durante la petición; propietario conoce la contraseña |
| Token de sesión | Cookie tras login | Autorizar administración | Cookie en navegador; hash en `admin_sessions` | Navegador lo envía automáticamente; Function lo lee; no JavaScript |
| Búsqueda de edición (barcode, artista, título, catálogo) | Formulario admin | Buscar MusicBrainz | Respuesta/caché de release en `music_metadata_cache`; logs de terceros NO VERIFICADOS | Administrador, Function, MusicBrainz para la consulta |
| Metadatos de edición/pistas y estado de copias | Formularios/importación | Catálogo | `albums`, `tracks`, `physical_copies` | Público salvo notas de copias y nota de procedencia de portada, sólo admin |
| Notas de copia y declaraciones de derechos | Formularios admin | Inventario y registro de permiso | `physical_copies.notes`, `tracks.rights_evidence`, `albums.cover_rights_note` | Backend/admin; no se proyectan al catálogo público |
| Imagen de portada y archivo de audio | Upload admin o URL de imagen indicada | Presentación y reproducción | Storage/URL externa, referencias en DB | Portada pública por URL; audio con URL firmada para pista autorizada |

No hay cuenta de visitante ni formulario de contacto; no se recaban nombre, email o RUT del visitante. Una imagen externa autorizada puede revelar IP al host externo al visualizarse. Cualquier dato personal escrito por el admin en `description` sí se haría público: requiere revisión editorial antes de publicar.

## Cookies y terceros

| Elemento | Momento | Destinatario / datos | Necesidad |
|---|---|---|---|
| `vinilos_session` | Sólo al login admin; 8 h máx., se borra al logout | Sitio/Netlify Function; token firmado; hash en Supabase | Necesaria para administrar |
| Scripts de analytics/ads, pixels, fuentes CDN | No presentes en `public/` | Ninguno en código local | No aplicable |
| MusicBrainz API | Búsqueda/release por admin, desde Function | Consulta musical y datos técnicos del servidor | Necesaria para importación, no para navegación pública |
| Portadas remotas HTTPS | Al renderizar una ficha con URL externa | Host de la imagen recibe petición del navegador | Opcional, según ficha |
| Supabase Storage | Al cargar portada o reproducir audio | Supabase recibe petición/IP y URL de objeto o signed URL | Necesaria para medios presentes |

Cookies agregadas por Netlify, Supabase o una configuración externa, y trackers inyectados en deploy: **NO VERIFICADOS**. No se justifica banner de opcionales con el código actual; repetir auditoría en navegador real.

## Accesibilidad y contenido

**Verificado por inspección local:** enlaces de salto, landmarks, botones nativos, labels de formularios y sliders, `dialog` nativo, `alt` informativo en portada, `alt=""` en miniatura decorativa del player, foco visible, `prefers-reduced-motion`. Contrastes calculados de combinaciones principales: texto acento sobre fondo claro 7.76:1, texto secundario sobre papel 5.78:1, botón blanco/acento 5.96:1. No equivale a auditoría WCAG completa. **Pendiente:** recorrido teclado completo (Tab/Shift+Tab/Enter/Espacio/Escape/flechas), foco tras cerrar o re-renderizar modal, lector de pantalla, zoom 200/400 %, contraste de todas las combinaciones/estados, y reproducción con teclado en despliegue real.

| Contenido | Procedencia | Derechos/licencia | Estado |
|---|---|---|---|
| Gráfica del disco del encabezado y placeholders | CSS original del proyecto | Código sin licencia de distribución declarada | Local, sin imágenes de terceros |
| Imágenes estáticas y audio estático en `public/` | Ninguno | No aplica | Inventario local vacío |
| Portadas dinámicas | Foto subida por admin o URL HTTPS indicada | Declaración `OWN_PHOTO`/`LICENSED`, no prueba documental | **NO VERIFICADO** para objetos reales; bucket público |
| Audio dinámico | Subida admin a `canciones` | Declaración textual, no prueba documental | **NO VERIFICADO** para objetos reales; bucket privado con URL firmada si autorizado |
| Metadatos externos | MusicBrainz, enlace de atribución | [Datos centrales CC0; otros datos con condiciones distintas](https://musicbrainz.org/doc/About/Data_License) | Uso de campos básicos localmente inspeccionado; datos importados reales NO VERIFICADOS |
| Enlaces de terceros | MusicBrainz y fuentes legales en políticas | No incorporan recursos hasta acción del visitante, salvo portadas remotas | Inspección local |

Las tres páginas locales de información existen: `/politica-de-privacidad/`, `/politica-de-cookies/` y `/terminos-y-condiciones/`. En el dominio actual, las dos primeras devuelven 404; la tercera no se ha desplegado y no se validó allí. No existe función comercial ni política de reembolsos. La identidad del responsable/canal de contacto sigue pendiente, así que ningún texto se presenta como aprobación legal final.

## Secuencia exacta antes de publicar

1. Confirmar sitio Netlify y proyecto Supabase correctos; obtener acceso de **lectura** y registrar estado/backup sin exponer secretos. Conectar Supabase para la auditoría remota; no hay acceso confirmado en esta revisión.
2. En Supabase, ejecutar consultas read-only anteriores, inspeccionar historial y esquema efectivo, todos los grants/policies y objetos/buckets. Determinar entonces exactamente si faltan 001, 002 o ambas. Auditar especialmente policies existentes de `storage.objects` y grants a `PUBLIC`.
3. Respaldar DB y Storage y ensayar migraciones en clon; validar constraints sobre datos existentes, backfill, triggers y rollback. Aplicar en producción sólo tras revisión de impacto y comparar estado efectivo después. No ejecutar 002 sin 001.
4. Inventariar cada portada/audio real con procedencia y permiso demostrable. Retirar o sustituir material no verificable; comprobar URLs públicas heredadas y comportamiento tras revocación.
5. Revisar Netlify UI: branch, base/publish, build command, funciones, Node, dominios, variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `SITE_URL`, `MUSICBRAINZ_CONTACT`) y ámbito Functions. Rotar credenciales históricas. Confirmar que `public/` sea el único publish y no desplegar `.netlify/` antiguo.
6. Confirmar responsable/canal real y políticas de privacidad; revisar logs, retención, subprocesadores y cookies del dominio real.
7. Hacer build/deploy de prueba desde un estado versionado y limpio. Comprobar rutas `/`, `/politica-de-privacidad/`, `/politica-de-cookies/`, `/terminos-y-condiciones/`, `/api/albums`, refresh, 404 de `/identify-album`, `/identify-album.js` y `/files.zip`, headers y que `.env`/archivos privados no respondan. Verificar además el inventario de Functions y artefactos en Netlify.
8. Ejecutar pruebas contra servicio real con cuenta admin y visitante: login/rate limit/logout, CRUD, importación, duplicados, uploads, derechos/no derechos, acceso directo a Storage, signed URL a los 300 s, revocación y errores. Verificar accesibilidad con teclado y lector de pantalla y documentar resultados.
9. Publicar sólo si las seis condiciones del usuario quedan comprobadas: código, Supabase, Netlify, seguridad, accesibilidad y contenido.

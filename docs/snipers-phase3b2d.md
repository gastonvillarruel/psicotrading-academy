# Snipers — Fase 3B-2D: vinculación y consumo privado

Implementación local sobre `977fc143e07dc7eaca128b600fb762b7a35c94c2`, rama
`feature/snipers-campus`. Sin commit, stage, push, merge, deploy ni migraciones.
`SNIPERS_ENABLED=false`; los arneses habilitan el módulo sólo en sus procesos hijos.

## Contratos y flujo

Se reutilizan los modelos de archivos y sus restricciones, autorización académica,
permisos editoriales, SERIALIZABLE/reintentos, versiones de clase, fachada de sesión,
ConfirmModal y recibos editoriales. No se agregan dependencias ni infraestructura.

- La carga determina `classId`, inmutable. Vincular no mueve archivos entre clases.
- `VERIFIED` sólo significa validación técnica. El mentor confirma ATTACH para fijar
  `attachedAt`; DETACH lo elimina sin alterar evidencia, generaciones ni bytes.
- Una clase DRAFT conserva los vínculos preparados. PUBLISHED los ofrece al grupo;
  vincular en publicada advierte que el archivo quedará disponible al confirmar.
  Retirar/archivar la clase impide nuevas firmas, sin retirar físicamente objetos.
- Los comandos reciben UUID, clase, versión esperada, recurso e intención estrictos.
  Vínculo, incremento efectivo de versión y auditoría confirman juntos. Un no-op
  conserva versión/fecha; un replay devuelve el recibo histórico sin reaplicar nada.
- Se conserva auditoría editorial v1; v2 agrega CLASS_ATTACH/CLASS_DETACH y un
  snapshot acotado de recurso, objeto/generación y vínculo anterior/posterior.
  No guarda nombres en claro, cuerpos, claves R2, credenciales ni URLs.
- El editor comparte comandos/versiones con los vínculos. Con texto sin guardar,
  cambios inciertos o clase archivada no permite vincular. Actualizar inventario
  no reemplaza una revisión remota sin la confirmación existente.

El inventario incluye estados técnicos para explicar archivos aún no vinculables.
Cualquier editor/supervisor Snipers puede vincular archivos de esa clase. Los
permisos del creador para operar transferencias siguen intactos. Gestor y ADMIN
global sin concesión no obtienen edición.

## Decisión de acceso y entrega

La acción `signSnipersResource({resourceId, mode: PLAY|DOWNLOAD})` usa la fachada
de sesión existente. No acepta actor, clave, bucket, nombre ni URL del cliente.
Reautoriza cada emisión/renovación; los tres niveles comerciales comparten la misma
decisión académica, sin recortar historia por fecha de alta.

1. En una transacción, autorizar y seleccionar la clase publicada y su recurso
   VERIFIED/vinculado. Bloquear en orden usuario/concesiones o membresía → clase →
   recurso → carga → objetos por ID → trabajos por ID. Exigir definitivo FINAL,
   BYTES_VERIFIED, activado, no retirado, hash/tamaño/clave coincidentes y carga y
   productor SUCCEEDED con generación acreditada coincidente.
2. Fuera de SQL, HEAD verifica sólo los **metadatos de entrega** del candidato.
   No sustituye ni vuelve a acreditar la validación de bytes de 2C.
3. En una nueva transacción, repetir autorización, bloqueos y selección completa;
   exigir el mismo definitivo. Firmar localmente con credenciales estáticas y
   reloj PostgreSQL. No hay llamadas remotas en callbacks reintentables.
4. Devolver únicamente URL GET y vencimiento, con máximo de 120 segundos. La firma
   no se persiste ni se reutiliza como recibo de acceso futuro.

Un retiro o revocación que confirma antes de la decisión final impide la firma.
Si la firma gana, el cambio concurrente espera los bloqueos hasta su COMMIT. La
política aceptada permite reutilizar esa URL durante su vigencia y permite que
transferencias iniciadas continúen después. No hay revocación instantánea de bytes
entregados ni promesa de impedir copias de material descargable.

## Compatibilidad R2 y decisión sobre encabezados

Fuentes primarias consultadas:

- [Compatibilidad S3 de R2](https://developers.cloudflare.com/r2/api/s3/api/):
  documenta GetObject/Range y metadatos Content-Type, Content-Disposition y
  Cache-Control en PutObject.
- [Metadatos R2](https://developers.cloudflare.com/r2/api/s3/extensions/):
  relación con `httpMetadata`.
- [URLs firmadas](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) y
  [CORS](https://developers.cloudflare.com/r2/buckets/cors/).

La tabla no documenta los overrides GET `response-content-*`. Esta implementación
**no depende de ellos**. Al crear un FINAL nuevo, el PUT condicional existente agrega
`Content-Disposition: attachment; filename="snipers-<identificador-seguro>.mp3|pdf"`.
Mantiene MIME validado y `Cache-Control: private, no-store`. El nombre se construye
en servidor a partir de la identidad de carga, sin texto o rutas aportados por el
usuario. No se modifica la clave, la evidencia o el protocolo de escritura.

El reproductor HTML5 usa el mismo objeto como subrecurso de audio; no requiere una
navegación con `inline`. Las descargas navegan directamente al GET firmado, donde
attachment determina el nombre. Ningún archivo pasa por un proxy Next.js ni por
un Blob completo en memoria del navegador. La prueba Chromium debe acreditar
reproducción y descarga con esos encabezados; no acredita comportamiento de R2 real.

Antes de firmar, HEAD exige esos metadatos. Un FINAL anterior sin ellos falla de
forma cerrada y requiere una nueva carga como recurso distinto; no se sobrescribe,
no se copia sobre sí mismo y no se altera su historial. No se aplicó ningún cambio
remoto a objetos existentes. Esta limitación se documenta para su operación.

CORS de referencia conserva PUT y agrega GET/Range, con orígenes explícitos. El
origen de prueba real deberá configurarse después; no se cambia CORS remotamente.
CORS no hace a la URL intransferible y no sustituye la firma.

## Experiencia de consumo

El detalle de clase entrega sólo metadatos públicos del recurso, nunca URL o clave.
MP3 tiene audio HTML5 sin precarga y un botón independiente de descarga. PDF tiene
descarga directa. La página usa referrer no-referrer y los enlaces de descarga lo
repiten. Las firmas quedan en memoria y se descartan al desmontar/cambiar sesión.

Reanudar/buscar con una firma que vence en menos de 15 segundos provoca renovación
preventiva, conservando posición y pausa/reproducción. Un error compatible con
vencimiento admite una recuperación automática, después requiere acción manual.
Denegaciones detienen y limpian el audio; las respuestas tardías tras desmontar se
descartan. No hay gestor de streaming, caché, colas ni descargas en segundo plano.

El ajuste de PrivateUploads permite observar SUCCEEDED directamente: el worker puede
haber superado PROCESSING entre dos consultas. Antes se esperaba exclusivamente ese
estado intermedio. También deja de ofrecer cancelación a una carga ya exitosa.

## Inventario exacto

Modificados:

- `src/lib/snipers/content-contracts.ts`
- `src/lib/snipers/content.ts`
- `src/lib/snipers/gateway.ts`
- `src/lib/snipers/server.ts`
- `src/lib/snipers/upload-storage.ts`
- `src/app/actions/snipers-content.ts`
- `src/app/mi-campus/snipers/biblioteca/[id]/page.tsx`
- `src/components/snipers/ClassEditor.tsx`
- `src/components/snipers/EditorialManagement.tsx`
- `src/components/snipers/PrivateUploads.tsx`
- `config/snipers-r2-cors.example.json`
- `scripts/phase3b1/actions.test.cjs`: sólo inventario de dos nuevos exports.
- `scripts/phase3b2b/integration.test.ts`: acotar recibos de carga v2 a su acción/tipo,
  manteniendo la validación estricta; auditoría editorial también tiene ahora v2.

Nuevos:

- `src/components/snipers/PrivateResources.tsx`
- `scripts/phase3b2d/cli.ts`
- `scripts/phase3b2d/fixtures.ts`
- `scripts/phase3b2d/integration.test.ts`
- `scripts/phase3b2d/actions.test.cjs`
- `scripts/phase3b2d/storage.test.ts`
- `scripts/phase3b2d/storage-fixture.cjs`
- `scripts/phase3b2d/browser.cjs`
- `docs/snipers-phase3b2d.md`

`.vscode/settings.json` conserva su modificación previa y queda fuera de la fase.
Perfiles, SQL, Prisma, configuración general y fuentes comerciales se preservan.
No incluir `.local/`, `.env*`, binarios sintéticos ni backups en un eventual commit.

## Verificación y clasificación de hallazgos

El lanzador verifica rama/HEAD, identidad PostgreSQL, flag, baseline de archivos
protegidos, esquema sin cambios y red loopback. Ejecuta y verifica `npm run db:backup`
antes de cada suite que escribe. Comparte el lock de 2C para no competir con la cola
local. Las regresiones se lanzan directamente conservando sus guards; sus CLIs
históricos siguen fijados a sus HEAD originales y no se modifican.

Reproducción: `node node_modules/tsx/dist/cli.mjs scripts/phase3b2d/cli.ts <acción>`.
Acciones: test, regression, typecheck, lint, build, browser. Ejecutarlas en serie.

Los fixtures técnicos declaran analizadores dobles. SQL, transacciones, permisos,
NextAuth/JWE, SDK y navegador son reales; almacenamiento es doble explícito en SQL
y HTTP loopback en transporte, con un verificador SigV4 GET independiente. El reloj de vencimiento de UX es controlado
sólo en navegador; no altera SQL ni afirma vencimiento real de R2.

Resultados finales, 31/10/2026 (Argentina):

| Comprobación | Resultado |
|---|---|
| Suite nueva: contratos, SQL, acciones JWE y adaptador SDK | **26/26**, ninguna omitida |
| Regresión afectada 3B-1/2B/2C | **93/93**, ninguna omitida |
| Navegador Chromium/Edge | **9/9**, sin errores JS inesperados ni navegación externa no prevista |
| TypeScript | `--noEmit --incremental false`: aprobado |
| ESLint | Archivos afectados y arnés, `--max-warnings=0`: aprobado |
| Build aislado | Prisma generate + Next.js 16.2.6 Webpack: aprobado |
| Esquema, perfiles y archivos protegidos | Sin cambios; flag persistente false |
| Formato de diff | `git diff --check`: aprobado |
| R2/VPS/analizadores reales | No ejecutados; requisitos externos pendientes |

Las carreras nuevas usan conexiones PostgreSQL independientes, barreras dentro
de consultas reales y observación de espera `Lock` en pg_stat_activity. Prueban
vincular/publicar en ambos órdenes, firma frente a DETACH/WITHDRAW/revocación de
permiso y suspensión académica en ambos órdenes. No se fabrican SQLSTATE ni se
acepta un deadlock como resultado. El rollback de auditoría se provoca por una FK
SQL real inválida y comprueba ausencia de vínculo, incremento y recibo.

Chromium decodifica frames MPEG-1 Layer III y avanza el reloj de audio con el
Content-Disposition attachment persistido. Descargas MP3/PDF usan GET directo y
nombre seguro; Range devuelve 206. Se prueban firma alterada y firma ya vencida
contra el verificador local, renovación preventiva manteniendo posición/pausa,
un único intento automático y reintento manual. La captura móvil fue inspeccionada.

Evidencias finales en `.local/snipers/phase3b2d/`:

- `test-1793480382703.log` y `-evidence.json`.
- `regression-1793480420286.log` y `-evidence.json`.
- `build-1793480186417.log` y `-evidence.json`.
- `browser-1793480343296.log`, `-evidence.json`, `browser-results.json` y captura móvil.
- `typecheck-1793480478107.log` y `lint-1793480499409.log`, con sus evidencias.

Cada evidencia final registra `passed=true`, `unchanged=true`, `localOnly=true` y
flag persistente false. Los respaldos de test, regresión y navegador incluyen
manifiesto, SHA-256, tamaño e inventario verificados antes de escribir fixtures.
La instrumentación cubre procesos Node y peticiones del navegador controlados;
no es una captura global de red del equipo.

Se conservan dos corridas fallidas anteriores. La primera suite nueva usaba un
doble cuyo HEAD omitía la identidad de carga; se corrigió sólo ese fixture y se
añadió una comprobación explícita de VERIFIED para evitar fallos en cascada.
La regresión inicial tenía 91/93: el lector 2B seleccionaba todos los payloads v2,
incluida la nueva auditoría editorial. Ahora selecciona su acción/tipo de entidad,
sin relajar ninguna validación. La repetición completa dio 93/93. No se borraron
filas, recibos ni archivos de evidencia de los intentos fallidos.

- **Bloqueantes externos para habilitar:** integración contra bucket R2 privado real,
  CORS/origen, encabezados persistidos en GET/206, rechazo público y firma vencida,
  reproducción prolongada y descarga en navegadores objetivo. Continúan los
  prerrequisitos operativos de validadores/VPS de 2C; no se afirman aquí ejecutados.
- **Bloqueante por recurso histórico:** un definitivo sin los metadatos requeridos
  no recibe firma de entrega hasta volver a cargarlo como un recurso nuevo. No se
  trata como listo sólo por ser VERIFIED y no se altera el objeto anterior.
- **Mejoras no bloqueantes:** nombres de descarga más descriptivos y verificación
  adicional en navegadores móviles reales. No requieren rediseñar el modelo.
- **Riesgos aceptados:** URLs portadoras por hasta 120 s, transferencias en curso y
  copias descargadas; limpieza física
  diferida a 3B-2E. Sin garantías DRM ni uso único.

Detenerse para revisión externa antes de commit local o habilitación.

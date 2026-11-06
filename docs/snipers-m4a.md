# Snipers: M4A con AAC-LC

Implementación y pruebas locales del 06/11/2026 (Argentina), rama `feature/snipers-campus`. Sin commit, push, merge, deploy ni operaciones sobre producción o R2 real.

## Restricciones encontradas y cambio

El enum Prisma/PostgreSQL y el CHECK `SnipersResource_private_file_check` sólo admitían MP3/PDF. También estaban limitados el selector, contrato Zod, validador básico, filtro PLAY, DTOs y extensión de descarga. El flujo web vigente usa `advancePrivateUpload` y validación básica de política 2, descrito en `snipers-basic-files.md`; no requiere activar el worker histórico ni sus analizadores.

La migración **nueva** `20261106000000_snipers_m4a` incorpora M4A y agrega exclusivamente la rama `M4A` / `audio/mp4` / hasta 262144000 bytes. Las condiciones MP3/PDF y de clave privada permanecen iguales. Usa comparación textual para la nueva alternativa del CHECK, permitiendo agregar el valor del enum y el CHECK en una transacción. No modifica migraciones históricas, filas ni evidencias de validación existentes. El gate del historial reconoce la migración pendiente/aplicada y conserva sus comprobaciones de checksum y prerrequisitos.

Respaldo inicial mediante `npm.cmd run db:backup -- --env-file .env.snipers.local`: verificados identidad real `snipers_dev / snipers_local / 127.0.0.1:55432`, tamaño 2481668 bytes, cabecera PGDMP, listado y SHA-256. Archivo `backups/snipers-local/local-2026-11-06T20-22-19-960Z-e32d390c.dump`, SHA-256 `a874f289cb84adef7f009d150b4f019d944a54bf09754bdddaa105cc7a0b3a2c`. No se afirma una restauración nueva.

`snipers_dev` conserva el historial antiguo de las fases. Para no cambiarlo, las pruebas crearon `snipers_basic_e6188dca` en la misma instancia PostgreSQL 18.6 local, con rol restringido, esquema base y migraciones del lanzamiento. Aplicaron la corrección básica y M4A mediante Prisma real, después de respaldos de esa base; una segunda ejecución no aplicó cambios. Se conserva un archivo verificado de política 1 creado antes de migrar. La base de pruebas y sus fixtures se conservan.

## Formatos y validación efectiva

- MP3 (`audio/mpeg`) hasta 250 MiB: mismo validador de tramas e ID3, sin cambios.
- PDF (`application/pdf`) hasta 25 MiB: mismo validador, entrega y comportamiento, sin cambios.
- M4A (`audio/mp4`) hasta 250 MiB: contenedor ISO-BMFF no fragmentado, una única pista de audio, sample entry `mp4a`, descriptor MPEG-4 Audio `0x40`, AudioSpecificConfig AAC-LC (tipo 2), mono/estéreo, frecuencias indexadas de 7350 a 96000 Hz y tramas de 1024 muestras. Se admite el descriptor adicional que declara SBR ausente. El selector normaliza `audio/x-m4a` a `audio/mp4`; el servidor sólo persiste el MIME canónico.

El validador verifica tamaños/límites de cajas, estructura de pista, descripción del códec, referencias internas, tablas de tiempo/tamaño/chunks y que todas las muestras estén contenidas en `mdat`, sin solapamientos. Rechaza ALAC, HE-AAC, AAC Main y otros códecs declarados, video/pistas adicionales, cifrado reconocido, referencias externas, fragmentación y estructuras inconsistentes. Limita metadatos `moov` a 32 MiB, cantidades de cajas y longitudes de descriptores. Respeta la señal de cancelación.

Es una comprobación estructural conservadora: no decodifica todas las muestras, no certifica el contenido real de cada trama AAC, no detecta todo daño multimedia ni malware, y puede rechazar variantes M4A válidas fuera de ese subconjunto. No acepta archivos sólo por nombre o MIME. WAV, FLAC, OGG y AAC/ADTS independientes siguen sin admitirse.

Se reutilizan conteo completo de bytes/SHA-256 del temporal y definitivo, multipart, claves nuevas, leases, generaciones, estados, reintentos, autorización, vinculación y retención. Los rechazos M4A terminan como FAILED/REJECTED antes del PUT final. El definitivo conserva los bytes originales, `audio/mp4`, disposición `.m4a` y los metadatos privados existentes. PLAY y DOWNLOAD mantienen las mismas comprobaciones en servidor y firmas de 120 segundos. HTML5 recibe el MIME mediante Content-Type; el error de reproducción ofrece reintentar o descargar. No hay rutas nuevas de entrega en la aplicación.

## Archivos

| Archivos | Finalidad |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/20261106000000_snipers_m4a/migration.sql`, `.gitattributes` | Enum, CHECK aditivo y SQL con LF estable |
| `scripts/snipers-launch/database.ts` | Historial opcional de la migración nueva, preservando los cambios previos del archivo |
| `src/lib/snipers/file-contracts.ts`, `upload-client.ts` | Declaración, MIME, límites y tipo compartido |
| `src/lib/snipers/m4a-validation.ts`, `basic-file-validation.ts` | Validación estructural y AAC-LC sin dependencias nuevas |
| `src/lib/snipers/file-validation.ts`, `basic-upload-processor.ts` | Tipo compartido y rechazo permanente de M4A inválido |
| `src/lib/snipers/upload-storage.ts` | Extensión de descarga M4A, conservando las de MP3/PDF |
| `src/lib/snipers/content.ts`, `content-contracts.ts`, `storage-management-contracts.ts` | PLAY de M4A y DTOs coherentes |
| `src/components/snipers/PrivateUploads.tsx`, `PrivateResources.tsx` | Selector, identificación, HTML5 y mensaje de error |
| `scripts/snipers-basic-files/files.test.ts` | Recorrido SQL/multipart, MIME, vinculación, descarga y acceso M4A |
| `scripts/snipers-m4a/` | Pruebas de formato, historial y navegador; fixture real con licencia |
| `docs/snipers-m4a.md` | Alcance, evidencia y publicación pendiente |

Los cambios locales preexistentes se verificaron por hash. En `database.ts` se comprobó la preservación reconstruyendo el contenido previo al retirar exclusivamente las adiciones M4A. No se modificaron configuración productiva, autorizaciones comerciales, membresías/pagos de la aplicación ni campus general. Las membresías sintéticas de prueba sólo existen en la base aislada.

## Resultados

- `node --import tsx --test --test-concurrency=1 scripts/snipers-basic-files/files.test.ts`: **24/24**, sin omisiones. Migración Prisma/repetición, registro previo preservado, MP3/M4A/PDF, SHA/tamaño/formato, errores/concurrencia del flujo existente, MIME y SQL, vinculación y publicación. M4A autorizado por membresía permite PLAY/DOWNLOAD; sin acceso o con suspensión se deniega. Incluye el proceso de acciones públicas con NextAuth/JWE y PostgreSQL reales: **1/1** dentro del subtest correspondiente.
- `node --import tsx --test scripts/snipers-m4a/format.test.ts scripts/snipers-m4a/history.test.ts`: **20/20**. Fixture AAC-LC real, falsos/truncados, ALAC/cifrado/video, perfiles no admitidos, referencias externas, tablas inválidas, pistas adicionales/fragmentación, MIME/extensiones manipulados, límite de audio, integridad y cancelación.
- `node --import tsx --test scripts/snipers-launch/history.test.ts scripts/snipers-m4a/history.test.ts`: **22/22**. Gate de historial y checksum, sin escrituras SQL.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: aprobado.
- ESLint de todos los archivos de código modificados/nuevos con `--max-warnings 0`: aprobado.
- `node scripts/snipers-m4a/browser.cjs`: **8 comprobaciones aprobadas**, sin errores de página, Edge 156.0.4314.58 en Windows. Selector y carga reales, SDK S3 contra HTTP loopback, validación servidor, vínculo/publicación por servicio, reproducción HTML5 con avance real del tiempo, descarga con SHA-256 idéntico y extensión `.m4a`, denegación de firma y mensaje de error con descarga disponible.
- Prisma generate 7.8.0 y build Next.js 16.2.6 `--webpack`: aprobados, 38/38 páginas estáticas y TypeScript integrado. Se usó una copia aislada de fuentes/configuración pública, sin `.env`, fuentes offline y red restringida a loopback. Fuentes comprobadas por hash; arnés y evidencia en `.local/snipers/m4a/build.cjs`, `build.log` y `build-evidence.json`.

El navegador utiliza los componentes reales compilados con esbuild y un puente HTTP exclusivo del arnés hacia los gateways reales. SQL y SDK S3 son reales; el proveedor de almacenamiento se simula en loopback. El transporte de Server Actions/NextAuth se prueba por separado en `actions.test.cjs`. La captura del arnés no acredita una revisión visual de la página completa del campus. No se probaron Safari/iPhone, Android, Chrome ni Firefox; no se promete compatibilidad universal ni reproducción audible verificada por una persona.

Evidencias locales en `.local/snipers/m4a/`: `browser-evidence.json`, `m4a-edge.png`, `downloaded.m4a`, `focused-tests.log`, `build.log` y `build-evidence.json` al finalizar el build. Evidencia de SQL/migración en `.local/snipers/basic-files/evidence-e6188dca.json` y logs `migrate-e6188dca-*`. Los intentos iniciales del arnés detectaron errores de su simulador HTTP (firma en headers) y del fixture editorial (texto vacío); se corrigieron en el arnés sin cambios funcionales adicionales.

## Preparación de publicación

Tras la revisión del diff, preparar un commit con sólo estos archivos, excluyendo el trabajo local ajeno y los perfiles/evidencias privados. Para una publicación futura y expresamente autorizada: respaldo verificado del destino, gate de identidad/historial, aplicación de la migración nueva con el lanzador existente, generación del cliente Prisma y despliegue de la aplicación correspondiente. La migración debe preceder a la habilitación del selector M4A. Aplicar sólo la migración o sólo el código no completa el soporte. No cambiar banderas del worker histórico ni de limpieza.

La implementación local está terminada y lista para preparar su publicación; no se declara desplegada ni habilitada en producción.

Esta entrega no ejecuta esos pasos remotos ni certifica R2/CORS/lifecycle productivos. No se alteran objetos existentes. No se iniciaron auditorías generales nuevas.

Se cerraron los servidores/navegador del arnés y se detuvo PostgreSQL, inicialmente detenido, después de verificar que no había otras conexiones de clientes.

Referencias de formato: [registro MPEG-4 Object Types](https://mp4ra.org/registered-types/object-types), [Apple: MPEG-4 audio codec](https://developer.apple.com/documentation/quicktime-file-format/mpeg-4_audio_codec), [RFC 6381](https://www.rfc-editor.org/rfc/rfc6381). Fixture y licencia: `scripts/snipers-m4a/fixtures/README.md` y `LICENSE.chromium`.

## Integración local sobre main vigente

06/11/2026: integración exclusiva del commit M4A `f9516770aa1b4b26439e1a884eb5aad91bba2f83` sobre `main` verificado en GitHub: `9cc759ddadbdfb6212a69a930a08d0eac24ebb6a`. Rama aislada `integration/snipers-m4a`, worktree `.local/snipers/integrate-m4a`. No se modificaron las ramas `main` ni `feature/snipers-campus`, ni sus archivos de trabajo.

Se resolvieron únicamente los contextos de `content.ts` y `database.ts`: se mantienen `finalResourceIdentity`, la exclusión de definitivos retirados, la exportación del guard de acceso privado, los checksums históricos revisados y el conteo de aplicaciones activas de main. La migración M4A es idéntica a la del commit de origen y los 11 blobs SQL históricos son idénticos a main; no se editaron migraciones antiguas. Para la migración de junio, el checkout Windows produjo CRLF distintos de los bytes registrados: se usó el blob exacto de Git, sin agregar excepciones ni modificar el SQL versionado.

Se agregó una prueba focalizada que carga/vincula/publica un M4A, comprueba PLAY autorizado, exige desvinculación y permiso administrativo para retirarlo, y verifica que el retiro impida nuevas firmas PLAY/DOWNLOAD, revinculación y exposición en la clase. La retención evita inicializar la limpieza.

Validación de esta integración:

- Archivos MP3/M4A/PDF, migración Prisma y repetición, compatibilidad previa, SHA/MIME/tamaños, autorización y retiro M4A: **25/25**, sin omisiones; incluye acciones públicas con NextAuth/JWE y PostgreSQL reales (**1/1** en su proceso hijo).
- Formato M4A y gates de historial actual + nuevo: **41/41**, sin omisiones.
- Regresión focalizada de retiro definitivo vigente en main: **9/9**, sin omisiones; incluye autorización, protección de vinculados, retención, denegación de entrega/revinculación y concurrencia.
- TypeScript sin emitir y ESLint focalizado con cero advertencias: aprobados.
- Prisma generate: aprobado, cliente generado en dependencias propias del worktree.
- Build Next.js 16.2.6 `--webpack`: aprobado, 38/38 páginas estáticas y TypeScript integrado. La advertencia de varios lockfiles corresponde al worktree anidado; no se modificó configuración de la aplicación para silenciarla.

Las pruebas se ejecutaron con código de este worktree y R2 simulado, red limitada a loopback y respaldos locales verificados. La suite de archivos utilizó una base nueva `snipers_basic_a9b1ecba`; la regresión de retiro agregó fixtures locales sin alterar registros existentes. Las copias ejecutadas de los tests sólo adaptan rutas de evidencia, la ausencia deliberada de `.env` y la ubicación física del PostgreSQL local: el arnés delega la comprobación de identidad al guard original, sin omitir sus controles. No se copiaron perfiles productivos. Las copias temporales de tests se conservaron como texto bajo `.local/validation/`, fuera del inventario Git.

Evidencias: `.local/validation/{files,unit,retirement,tsc,lint,generate,build}.{log,json}` dentro del worktree y `.local/snipers/basic-files/evidence-a9b1ecba.json`. No se repitió navegador: la integración sólo adapta código servidor; la prueba HTML5 de Edge de la implementación anterior mantiene el alcance y las limitaciones ya declarados.

Publicación posterior, sujeta a autorización: revalidar el main/deployment vigente; verificar identidad, catálogo e historial productivos; obtener y verificar respaldo; exigir que la única migración pendiente sea `20261106000000_snipers_m4a`; aplicar esa migración mediante el lanzador existente; recién después integrar/publicar el código revisado y confirmar el SHA desplegado. Si un push/merge de main dispara Vercel, debe ocurrir después de confirmar la migración. Smoke mínimo: MP3/PDF previos y un M4A AAC-LC real por mentor/alumno autorizado, con descarga íntegra y rechazo de usuario sin acceso.

El CHECK puede requerir un bloqueo temporal; conservar sus timeouts y detenerse si falla. Si se aplicó la migración pero falló el despliegue, mantener la versión anterior para MP3/PDF sin borrar el enum. Si ya existen M4A, un rollback de código no revierte los datos y puede perder reproducción/descarga M4A: priorizar una corrección hacia adelante. No restaurar la base ni borrar objetos/filas automáticamente. Ninguna de estas operaciones productivas se realizó durante la integración local.

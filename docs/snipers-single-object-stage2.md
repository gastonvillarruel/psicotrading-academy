# Snipers: objeto único por archivo, Etapa 2

Implementación local, 12/11/2026 Argentina. Sin commit de Etapa 2, cambios productivos ni activación del Cron.

## Cierre local de Etapa 1

Commit `21d67afa1106059e6ec3110be261f1dbdae9d9d1`, rama `feature/snipers-campus`, 20 archivos. Solo incluye eliminación de archivos/clases, interfaz, ejecutor preparado, migración y pruebas de Etapa 1. En `scripts/snipers-launch/database.ts` se incorporaron exclusivamente sus siete líneas de reconocimiento de migración; la exportación del comprobador privado y las modificaciones anteriores del historial permanecieron fuera del commit.

Archivos incluidos: `config/snipers-deletion-cron.vercel.example.json`, `docs/snipers-deletion-stage1.md`, `prisma/migrations/20261113000000_snipers_deletion_stage1/migration.sql`, `prisma/schema.prisma`, `scripts/snipers-launch/database.ts`, `scripts/snipers-storage/build.ts`, `discard-browser.cjs`, `discard.test.ts`, `src/app/api/snipers/storage-cleanup/route.ts`, `src/components/snipers/ClassEditor.tsx`, `DiscardResourceButton.tsx`, `src/lib/snipers/content-contracts.ts`, `content.ts`, `gateway.ts`, `resource-discard.ts`, `server.ts`, `storage-cleanup.ts`, `storage-deletion-cron.ts`, `storage-deletions.ts` y `storage-management-gateway.ts`. Los nombres abreviados pertenecen al directorio del primer archivo de cada grupo.

## Recorrido nuevo

El servidor web crea las cargas con `singleObject=true`. El cliente no puede elegir ni modificar esa marca. Los recursos existentes reciben `false` por defecto y conservan sus claves y sus pruebas.

1. Se crea el recurso pendiente y un único trabajo `PROCESS_UPLOAD`.
2. El primer avance reserva una clave única `snipers/final/...`, registra el objeto y crea multipart con metadatos privados de entrega. No se emiten URLs de lectura.
3. El navegador envía las partes directamente a R2, con progreso. Se conserva multipart como transporte común para los tamaños actuales, evitando un segundo protocolo de subida para archivos pequeños.
4. Se cotejan partes/tamaños/ETags y se completa multipart con `If-None-Match: *`, sin sobrescritura.
5. Un único GET descarga el objeto a scratch privado, verifica tamaño y SHA-256 y ejecuta los validadores MP3/M4A/PDF existentes. Se habilita ese mismo objeto en SQL. No se copia, renombra ni vuelve a descargar otro definitivo.

Se mantienen 250 MiB para MP3/M4A y 25 MiB para PDF. El archivo verificado queda disponible para vincularlo; no se publica automáticamente. El selector se libera al finalizar o fallar una carga nueva, permitiendo seleccionar otro archivo, incluso el mismo nombre.

Se reutilizan los enums existentes por compatibilidad. El recorrido nuevo solo ejecuta preparación, completado y validación; no pasa por `PUT_FINAL`, `VERIFY_FINAL`, antivirus ni recuperaciones con candidatos adicionales. Un solo trabajo conserva el contador/lease de exclusión, sin crear otra clave al perder una ejecución.

## Fallos, abandono y eliminación

Un error de transferencia, completado incierto, integridad o formato cierra la carga y registra limpieza persistente. No se aprueba un objeto por un HEAD ni por una declaración del navegador. No se reintenta un CREATE o un completado incierto para rescatar la carga: el mentor puede iniciar otra.

`terminateSingleUpload` reutiliza la cancelación/fencing y la cola `CLEAN_OBJECT` de Etapa 1. Conserva solamente firmas de escritura y ventanas remotas pendientes, no siete días de recuperación. La limpieza sabe abortar/listar multipart también para el objeto único `FINAL`.

El mantenimiento periódico puede expirar cargas nuevas abandonadas en preparación, transferencia, completado o validación después de sus 24 horas de vigencia. No necesita una pestaña ni una sesión del mentor. Su ejecución real sigue pendiente de activar el Cron preparado en Etapa 1. Una carga abandonada puede esperar hasta la siguiente ejecución diaria.

La eliminación de archivo o clase invalida al productor bajo los locks existentes. Aunque una lectura remota termine después, la ejecución anterior no puede activar el archivo. Los objetos protegidos y las clases ocultas conservan su comportamiento anterior. Las URLs de lectura ya emitidas mantienen su breve vigencia restante.

## Migración adicional

`20261114000000_snipers_single_object`, posterior a Etapa 1:

- Añade únicamente `SnipersUpload.singleObject`, inmutable y `false` para las filas anteriores.
- Adapta dos CHECK y tres funciones de consistencia para admitir un único objeto `FINAL` multipart y un único productor en las cargas nuevas.
- Impide más de un objeto y cualquier temporal en ese recorrido. Conserva pruebas de bytes, origen, relación, leases, archivo seleccionado, estados terminales y retención técnica.
- Mantiene las reglas anteriores cuando `singleObject=false`. No cambia claves, pruebas, disponibilidad ni retenciones de archivos existentes.

No se borran tablas ni migraciones anteriores. El verificador de lanzamiento reconoce el nuevo checksum y exige Etapa 1 aplicada. La migración solo se probó en PostgreSQL local.

## Código conservado y motivo

Los procesadores antiguos de transferencia, validación y recuperación siguen disponibles para registros históricos; el worker anterior excluye cargas nuevas. Eliminarlos ahora rompería la gestión de cargas antiguas y ampliaría el alcance.

El campo histórico `temporaryObjectId` se reutiliza internamente como puntero al objeto multipart, que en el recorrido nuevo es `FINAL`. Se conserva su nombre/FK para evitar una migración y duplicación de relaciones innecesarias; no representa una segunda copia física.

La inspección posterior de escrituras remotas inciertas sigue perteneciendo a la limpieza. No restaura ni recupera archivos para el mentor.

## Verificación

Usar PostgreSQL dedicado en `127.0.0.1:55432`. Los arneses comprueban destino/rol y hacen backup antes de escribir. R2 está simulado; las llamadas SDK del navegador van únicamente al fixture HTTP `127.0.0.1:3101`. Ese fixture no certifica credenciales, CORS ni comportamiento de Cloudflare productivo.

```text
node --import tsx --test --test-concurrency=1 scripts/snipers-storage/discard.test.ts
node --import tsx --test --test-concurrency=1 scripts/snipers-storage/single-object.test.ts
node --import tsx --test --test-concurrency=1 scripts/snipers-basic-files/files.test.ts scripts/snipers-launch/history.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --import tsx scripts/snipers-storage/build.ts
node scripts/snipers-storage/discard-browser.cjs
```

La prueba de objeto único y el navegador usan el perfil de base aislada generado por la primera prueba. El arnés SDK `scripts/phase3b2e/storage.test.ts` requiere el entorno del lanzador local Fase 1; no debe ejecutarse sin sus guardas.

Los casos cubren formatos válidos/inválidos, integridad, límites y archivos de tamaño máximo, un objeto y un GET de validación, ausencia de copias, concurrencia, eliminación durante validación, completado/respuesta inciertos, abandono y limpieza sin navegador, publicación/ocultación, eliminación de archivo/clase, autorización y lectura histórica. La concurrencia puede devolver un conflicto SERIALIZABLE reintentable, sin duplicar escrituras.

El navegador conserva sus pruebas de eliminación y agrega MP3/M4A/PDF reales por el nuevo flujo web, progreso, SDK y metadatos de entrega. El build usa copia aislada sin `.env`, fuentes offline y red limitada a loopback; comprueba hashes contra las fuentes actuales.

Evidencias locales privadas: `.local/snipers/single-object/test-evidence.json`, `.local/snipers/deletion-stage1/browser-evidence.json` y `.local/snipers/storage-management/build-evidence.json`.

Resultados finales: **14/14** pruebas del flujo nuevo, **10/10** de eliminación tras la corrección del Cron, **46/46** regresiones de carga histórica/historial, **1/1** del SDK con su lanzador local y **7/7** escenarios de navegador, sin errores de página. TypeScript completo y ESLint de los archivos afectados sin errores; build aislado aprobado, 38/38 páginas estáticas y hashes de fuente coincidentes. La corrida inicial del arnés SDK sin las variables de su lanzador fue rechazada por su guarda; la ejecución correcta pasó sin cambiar esa protección.

Los cambios anteriores en los dos archivos mixtos se conservan: el verificador de migraciones solo añade el reconocimiento de Etapa 2, y la prueba histórica de archivos solo adapta una comparación de snapshot para la columna aditiva `singleObject=false`. Las modificaciones previas de ambos archivos permanecen presentes; los otros 21 archivos del inventario previo conservan sus hashes.

## Fuera de esta entrega

No se inventarían objetos ajenos al registro ni se limpian los 378,06 MB productivos. Los dos archivos publicados permanecen fuera de cualquier intervención remota: la compatibilidad se prueba con registros históricos locales y no exige volver a subirlos.

El rendimiento de 250 MiB se validó localmente con almacenamiento simulado; el ancho de banda y tiempo real de R2/Vercel no quedan certificados. No se redujeron límites ni se agregó infraestructura para compensarlos.

Una futura integración debe conciliar esta rama con la rama productiva actual, obtener un backup autorizado del destino y aplicar ambas migraciones mediante el procedimiento habitual. Cron, variables, despliegue y cualquier acción productiva continúan pendientes de autorización.

## Corrección bloqueante en el cierre local

Al preparar la publicación conjunta se comprobó que el Cron general podía seleccionar objetos históricos ya retirados. Eso contradice la exclusión de la conciliación histórica de esta publicación. Se informó antes de incluir la corrección.

La selección automática de mantenimiento y ejecución queda limitada a `singleObject=true` o a recursos con `deletionRequestedAt` registrado explícitamente por el sistema nuevo. Los históricos anteriores, incluso con tareas `CLEAN_OBJECT` ya creadas, quedan fuera. La limpieza individual autorizada conserva su selector explícito. No se cambian retenciones, migraciones ni el flujo de subida.

La prueba de eliminación agrega el caso de históricos con y sin tarea previa; la prueba de abandono usa ahora el ejecutor automático completo. Los resultados previos de interfaz, cargas históricas y SDK corresponden a fuentes sin cambios en esos recorridos; para esta corrección se repiten únicamente las pruebas relacionadas, TypeScript, ESLint y el build. El procedimiento de publicación está en `docs/snipers-publication-plan.md`.

## Archivos del commit de cierre de Etapa 2

```text
docs/snipers-publication-plan.md
docs/snipers-single-object-stage2.md
prisma/migrations/20261114000000_snipers_single_object/migration.sql
prisma/schema.prisma
scripts/phase3b2b/storage-fixture.cjs
scripts/snipers-basic-files/files.test.ts
scripts/snipers-launch/database.ts
scripts/snipers-storage/build.ts
scripts/snipers-storage/discard-browser.cjs
scripts/snipers-storage/discard.test.ts
scripts/snipers-storage/single-object.test.ts
src/components/snipers/PrivateUploads.tsx
src/lib/snipers/basic-upload-processor.ts
src/lib/snipers/content.ts
src/lib/snipers/single-object-upload.ts
src/lib/snipers/storage-cleanup.ts
src/lib/snipers/storage-deletions.ts
src/lib/snipers/upload-contracts.ts
src/lib/snipers/upload-gateway.ts
src/lib/snipers/upload-processor.ts
src/lib/snipers/upload-server.ts
src/lib/snipers/upload-storage.ts
src/lib/snipers/uploads.ts
```

Los dos archivos mixtos se incluyen parcialmente: solo la adaptación del snapshot en `files.test.ts` y el reconocimiento de la migración en `database.ts`. Los cambios ajenos permanecen fuera del índice y del commit. Las evidencias corresponden al árbol local validado; no sustituyen la comprobación de una futura integración con el main vigente.

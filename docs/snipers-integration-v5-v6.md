# Integración local de Snipers: contratos v5/v6

Validación cerrada el 12/11/2026, Argentina. Sin commits nuevos ni operaciones productivas.

## Base y alcance

- Rama aislada: `integration/snipers-files-v5-v6`.
- Worktree: `.local/snipers/integration-files-v5-v6`.
- Base: `origin/main`, actualizado mediante fetch y confirmado en `0a1b7f8869521dd9a100b52c508d917e731132b2`.
- Etapa 1: `21d67afa1106059e6ec3110be261f1dbdae9d9d1`.
- Etapa 2: `bfe0b806c184e8076479b1b1394ba79a92099f44`.
- Se aplicó el delta de las dos etapas sobre main y se conciliaron los conflictos. No se reintrodujeron cambios ajenos del árbol de desarrollo ni se reemplazaron íntegramente las protecciones de main.
- HEAD sigue en la base: la integración está en archivos de trabajo, sin staging ni conflictos pendientes. `main` y `feature/snipers-campus` permanecen intactas.

## Incompatibilidad y corrección mínima

En main, v5 significa `RESOURCE_RETIREMENT_REQUEST`, con objeto final, fecha y pareja opcional de operaciones de limpieza. El descarte administrativo productivo es v6, con `finalObjectId` y `requestedAt` nulos conjuntamente o asociados al definitivo retirado. Las etapas usaban además v5 para `ADMIN_RESOURCE_DISCARD`, sin esos dos campos. Intercambiar los validadores rechazaba comprobantes válidos o perdía su asociación con el objeto.

Se conserva el contrato productivo de retiro v5. El lector de descartes admite estrictamente el descarte v5 de desarrollo y el v6 productivo; las escrituras nuevas emiten v6. La repetición exige el mismo actor, operación, recurso y hash. El comprobador central de main conserva la asociación exacta entre objeto final y fecha para retiro v5/descarte v6. El descarte v5 sin esa asociación solo puede autorizar limpieza cuando existe la nueva marca explícita de eliminación del recurso.

Se reutiliza `resource-retirement-proof.ts` en entrega y limpieza. Su prueba de generaciones distingue el productor histórico del trabajo de objeto único. La selección SQL de candidatos no concede autoridad: la limpieza vuelve a comprobar estrictamente la prueba al reclamar y antes de efectuar operaciones remotas, junto con las ventanas de escritura y las referencias de otros recursos. No se añadió otra capa de protección ni un worker.

El Cron conserva el filtro de las etapas: cargas nuevas `singleObject` o recursos con `deletionRequestedAt`. Un comprobante histórico de retiro/descarte, incluso con una tarea ya encolada, no incorpora por sí solo ese recurso al Cron. Repetir una operación histórica no constituye una nueva solicitud de eliminación.

## Migraciones y datos existentes

Orden comprobado: `20261113000000_snipers_deletion_stage1` → `20261114000000_snipers_single_object`. Ambas se aplicaron sobre PostgreSQL local con las restricciones reales y un recurso verificado anterior a ellas.

El esquema anterior y las migraciones previas coinciden con la base conocida de main. No se modificó el contenido versionado de las dos migraciones: sus blobs Git son, respectivamente, `83488c6888d4f87ca342caeb96538f5aea7d852f` y `e6f2b53a09ef2b56a030f4604faa939193315ecd`, iguales a Etapa 2. No se necesitó una migración adicional.

Las claves, checksum, objeto final y fecha de verificación del recurso histórico permanecen iguales después de migrar. La clase publicada permite firmar; ocultarla conserva sus objetos y retira nuevas autorizaciones; republicarla funciona. Los comprobantes históricos v5/v6 siguen interpretándose y los recibos con objeto, fecha, hash o actor incorrectos no levantan la protección.

Estas son comprobaciones locales con fixtures. No se consultaron ni alteraron los dos archivos publicados en producción. Su reproducción/descarga real sigue siendo una verificación del procedimiento de publicación.

## Validación ejecutada

PostgreSQL dedicado en `127.0.0.1:55432`, bases de prueba nuevas y respaldos locales verificados antes de las modificaciones. R2 simulado y red de aplicación limitada al entorno local.

- `discard.test.ts`: **14/14** (13 escenarios y contenedor). Contratos, repetición, permisos, eliminación de archivos/clases, ocultación, ventanas de escritura, concurrencia, reintentos, históricos y exclusión del Cron.
- `single-object.test.ts`: **14/14** (13 escenarios y contenedor). Objeto único, integridad, formatos, fallos, abandono, eliminación y firma histórica con su clave original.
- `discard-browser.cjs`: **7/7**, cero errores de página. Sesión autenticada, confirmaciones, publicación/ocultación, eliminación y subida PDF/MP3/M4A mediante SDK contra fixture local.
- TypeScript: `tsc --noEmit --incremental false`, salida 0.
- ESLint sobre todos los archivos TS/TSX/CJS cambiados respecto de main, salida 0 y sin diagnósticos.
- Build Next.js de una copia aislada de la aplicación integrada, salida 0; hashes de las fuentes comprobadas sin cambios. Incluye comprobación TypeScript durante el build.
- `git diff --check`, sin errores; índice sin conflictos ni cambios preparados.

Los tests se ejecutaron desde el directorio raíz para reutilizar la identidad verificada de PostgreSQL local, importando los módulos del worktree. Se verificó igualdad del SQL utilizado entre ambos árboles, normalizando únicamente CRLF/LF. Build y navegador verificaron los hashes del código integrado. Los artefactos están en `.local/snipers/integration-validation/`, separados de la evidencia anterior. Las adaptaciones de los scripts permiten seleccionar la fuente aislada y evitan depender de un `next-env.d.ts` generado previamente.

## Archivos del diff respecto de main

Incluye cambios de las dos etapas y su conciliación; no todos son correcciones del contrato.

- Datos/configuración: `prisma/schema.prisma`; `prisma/migrations/20261113000000_snipers_deletion_stage1/migration.sql`; `prisma/migrations/20261114000000_snipers_single_object/migration.sql`; `config/snipers-deletion-cron.vercel.example.json`; `scripts/snipers-launch/database.ts`.
- Contratos, prueba y descarte: `src/lib/snipers/storage-management-contracts.ts`; `resource-retirement-proof.ts`; `resource-discard.ts`; `storage-management-gateway.ts`.
- Clases y acceso: `src/lib/snipers/content.ts`; `content-contracts.ts`; `gateway.ts`; `server.ts`.
- Subidas: `src/lib/snipers/single-object-upload.ts`; `basic-upload-processor.ts`; `upload-contracts.ts`; `upload-gateway.ts`; `upload-processor.ts`; `upload-server.ts`; `upload-storage.ts`; `uploads.ts`.
- Limpieza: `src/lib/snipers/storage-cleanup.ts`; `storage-deletions.ts`; `storage-deletion-cron.ts`; `src/app/api/snipers/storage-cleanup/route.ts`.
- Interfaz: `src/components/snipers/ClassEditor.tsx`; `DiscardResourceButton.tsx`; `PrivateUploads.tsx`.
- Pruebas: `scripts/phase3b2b/storage-fixture.cjs`; `scripts/snipers-basic-files/files.test.ts`; `scripts/snipers-storage/build.ts`; `discard-browser.cjs`; `discard.test.ts`; `single-object.test.ts`.
- Documentación: `docs/snipers-deletion-stage1.md`; `snipers-single-object-stage2.md`; `snipers-publication-plan.md`; este informe.

Los nombres abreviados pertenecen al directorio del primer archivo de cada grupo.

## Estado y siguiente autorización

Las dos etapas están conciliadas y validadas localmente para preparar su publicación. No quedan bloqueos técnicos locales identificados. El procedimiento actualizado está en `docs/snipers-publication-plan.md`; no volver a aplicar los commits sobre este resultado.

Se requiere autorización posterior para crear el commit de integración, publicar/integrar remotamente y efectuar las operaciones productivas del plan: respaldo, verificación del historial real, migraciones, despliegue, variables/Cron y pruebas con material productivo de prueba. No se activó el Cron ni se ejecutó limpieza real. La conciliación masiva del almacenamiento histórico sigue fuera de alcance. Revertir código no revierte las migraciones ni recupera objetos eliminados.

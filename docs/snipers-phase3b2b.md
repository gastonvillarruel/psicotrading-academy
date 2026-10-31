# Snipers — Fase 3B-2B: transferencia privada multipart

Entrega de implementación sobre `1fab14edf6191984a4a466f546553821e4b3cac0`, rama
`feature/snipers-campus`. Sólo carga privada y procesador básico. No implementar
validación/activación, vinculación editorial, lectura para alumnos ni limpieza física.

## Funcionamiento

La página de edición de una clase guardada agrega **Carga privada** debajo del editor.
Admite MP3 hasta 262144000 bytes y PDF hasta 26214400 bytes, no vacíos, con nombre
editorial de hasta 200 caracteres. El navegador calcula SHA-256 y conserva el archivo,
UUIDs y ETags exclusivamente en memoria. No se usa localStorage/IndexedDB para cargas.

El inicio reserva recurso, carga y PREPARE_UPLOAD en una transacción SERIALIZABLE.
El procesador crea el multipart privado con clave nueva inventariada antes del I/O y
metadato de identidad de carga. Su resultado y la preparación se confirman juntos.
Cada parte de 8 MiB (última menor) va del navegador directamente al almacenamiento,
mediante PUT firmado; los bytes no atraviesan Next.js. Hay progreso, hasta tres
intentos por parte, reintento manual conservando las partes confirmadas, pausa y
cancelación mediante ConfirmModal. Recargar/cerrar no recupera el archivo ni la sesión.

Completar sólo sella el manifiesto y crea PROCESS_UPLOAD. El procesador coteja la lista
real de partes, ETags y tamaños; completa R2 y consulta HEAD del temporal. Exige tamaño
declarado e identidad de carga. Deja carga PROCESSING, temporal ACKNOWLEDGED y trabajo
BLOCKED/DOWNLOAD/AWAITING_VALIDATION. **HEAD no acredita integridad criptográfica.**
El recurso permanece PENDING, sin checksum final, verifiedAt, attachedAt ni finalObjectId.
No existen GET de archivos, objetos FINAL ni transición a VERIFIED en esta fase.

## Autorización, idempotencia y errores

- Las cinco acciones nuevas verifican flag, secreto explícito y sesión NextAuth; los
  servicios comprueban sesión efectiva y SNIPERS_CONTENT_EDITOR/SNIPERS_ADMIN en SQL.
  Tener rol ADMIN general o gestionar membresías no habilita las cargas.
- Consultar, firmar, completar y cancelar exigen ser el creador, también para otro
  editor o supervisor. El UUID de una carga ajena devuelve NOT_FOUND.
- Inicio/finalización/cancelación usan UUID de operación, actor y huella de intención
  en auditoría estricta v2 con la acción existente FILE_FOUNDATION_CHANGED. La misma
  operación se confirma una vez; otro actor o intención no reutiliza el recibo.
  No se guardan URLs firmadas, nombres de archivo, claves ni secretos en esos recibos.
- Firmar vuelve a autorizar y persiste un horizonte máximo de diez minutos, acotado al
  vencimiento de 24 horas de la carga. La firma incluye Content-Length para el Blob
  exacto. Su cumplimiento por Cloudflare requiere todavía prueba real en R2.
- Cancelar confirma primero el estado terminal, cancela trabajos activos y retira
  irreversiblemente el inventario respetando retenciones existentes. Después intenta
  AbortMultipartUpload fuera de SQL. Un error remoto no deshace la cancelación; el
  mismo botón permite reintentar el aborto con el UUID original.
- No se alteran modelos, enums SQL, triggers ni migraciones de 3B-2A. Los efectos
  remotos nunca se ejecutan dentro de transacciones ni de callbacks reintentables.

## Procesador y configuración

`scripts/phase3b2b/worker.ts` ejecuta un solo trabajo a la vez, con bloqueo advisory
de sesión para evitar dos instancias. Usa los modelos existentes como cola. Reclama
sólo cargas originadas por recibos UPLOAD_START v2: no procesa fixtures históricos
ni recursos ajenos. Leases de 60 segundos, heartbeat cada 20 y generaciones CAS.

Un reinicio reclama trabajo vencido. Si un Complete anterior dejó el objeto, HEAD
permite reconocer la transferencia sin emitir otro Complete. Si el resultado de
Create/Complete es ambiguo y no puede confirmarse, queda BLOCKED; no se repite la
escritura. Lecturas fallidas se reprograman a 30 segundos, hasta tres reclamaciones.
Perder el lease o cancelar impide confirmar trabajo con un token antiguo. Si Create
responde después de cancelar, se intenta abortar el multipart conocido.

La unidad systemd de ejemplo reinicia en fallos y mata el grupo al detenerlo. No se
instaló ni ejecutó en un VPS. No hay Redis, cola externa, contenedores ni supervisor.

Configuración de referencia: `config/snipers-uploads.env.example`,
`config/snipers-upload-processor.service` y `config/snipers-r2-cors.example.json`.
No se modificaron perfiles existentes. El adaptador exige SNIPERS_R2_ENVIRONMENT=test,
credenciales SNIPERS_R2_TEST_* explícitas y bucket `snipers-test-*`. No recurre a claves
R2/AWS genéricas. El procesador requiere SNIPERS_UPLOAD_PROCESSOR_ENABLED=true y una
DATABASE_URL explícita; no carga `.env` automáticamente.

Para provisionar el VPS de prueba posteriormente: instalar Node compatible con el
repositorio, ejecutar `npm ci --include=dev` (el ejecutor tsx está en devDependencies),
ubicar el checkout en `/opt/snipers` y el EnvironmentFile privado en
`/etc/snipers/uploads-test.env`, propiedad del administrador y modo 0600. Adaptar las
rutas del ejemplo a la instalación. No se hicieron estas operaciones en esta entrega.

En R2 de prueba, mantener deshabilitados r2.dev y cualquier dominio público. Aplicar
el ejemplo CORS reemplazando AllowedOrigins por **el origen exacto** del frontend de
prueba: sólo PUT, encabezado content-length y exposición ETag. Create/List/Complete/
Abort/HEAD son servidor-servidor y no requieren métodos CORS adicionales. No usar `*`.
La política de aborto nativo de multipart incompletos y la privacidad del bucket
deben verificarse en R2 antes de una prueba externa; no se configuraron remotamente.

## Comprobación local y límites

Usar el lanzador acotado; verifica rama/HEAD, PostgreSQL dedicado, perfiles, ausencia
de cambios de esquema y red de hijos limitada a loopback. Antes de test/browser ejecuta
`npm run db:backup -- --env-file .env.snipers.local` y verifica dump/manifiesto. Los
fixtures confirmados se conservan; no se borra historia para repetir pruebas.

```powershell
node node_modules/tsx/dist/cli.mjs scripts/phase3b2b/cli.ts test
node node_modules/tsx/dist/cli.mjs scripts/phase3b2b/cli.ts typecheck
node node_modules/tsx/dist/cli.mjs scripts/phase3b2b/cli.ts lint
node node_modules/tsx/dist/cli.mjs scripts/phase3b2b/cli.ts build
node node_modules/tsx/dist/cli.mjs scripts/phase3b2b/cli.ts browser
```

Las pruebas de servicios usan PostgreSQL real y un doble de almacenamiento declarado.
Las de acciones usan NextAuth/JWE y SQL reales, sin R2 configurado. El navegador usa
Next.js compilado, acciones y SQL reales, el SDK S3 oficial y un fixture HTTP local
con forma S3. Este fixture **no implementa la seguridad de Cloudflare ni certifica
SigV4**; sirve para comprobar el transporte, CORS local y la integración de la UI.
El endpoint de fixture sólo se admite con marcador del arnés, perfil local,
PostgreSQL dedicado y destino literal `http://127.0.0.1:3101`.

Resultados finales:

| Comprobación | Resultado |
|---|---|
| Servicios/contratos/acciones, PostgreSQL y NextAuth reales | 24/24 tras corregir timeout; ninguna omitida |
| Navegador con Next compilado + SDK S3 + fixture HTTP local | 6/6; sin errores JavaScript inesperados |
| Límite MP3 en navegador | 250 MiB exactos, 32 partes, recurso PENDING |
| PDF multipart y reintento | 9 MiB, dos partes; tres fallos inducidos y reintento manual |
| TypeScript | Standalone aprobado tras corregir timeout; build previo aprobado |
| ESLint de archivos afectados | Aprobado, cero advertencias |
| Build Next.js 16.2.6 Webpack aislado | Aprobado |
| Esquema/perfiles y red instrumentada | Sin cambios; sólo loopback permitido |
| R2 real / VPS real / systemd real | No ejecutados; pendientes externos |

Las 24 comprobaciones Node incluyen 22 subpruebas y sus dos contenedores. No se
reejecutaron suites completas de fases cerradas. Se verificó la compatibilidad de
recibos v1/v2 con filas reales; la única ampliación histórica es el lector de auditoría.
El navegador comprueba rechazo de archivo no admitido, reintentos de partes, límite
MP3, pausa/cancelación, recarga sin recuperación y selector liberado sin R2.

### Corrección focalizada del timeout del SDK

La auditoría confirmó que `requestTimeout: 30000` sólo advertía cuando faltaba
`throwOnRequestTimeout: true`. Se agregó exclusivamente esa opción al cliente S3;
se conservan los 30 segundos, leases, heartbeat y tratamiento de errores existentes.

La prueba nueva usa el adaptador/SDK reales y un servidor HTTP loopback que acepta
HEAD sin responder. Reduce el plazo a 100 ms sólo mediante un mock del parámetro
del handler en la prueba, restaurado al finalizar; no simula el error del SDK. Un
watchdog independiente evita colgar una regresión y su AbortError no satisface la
aserción. Antes de corregir, falló por AbortError tras la advertencia; después pasó
por TimeoutError/ETIMEDOUT. También pasa ese error real a processUploadOnce y verifica
WAIT_RETRY/STORAGE_UNAVAILABLE, lease/token nulos, reintento futuro y carga COMPLETING
sin transferencia acreditada. La comprobación completa nueva tardó unos 371 ms.

Tras la corrección se ejecutaron las 24 comprobaciones de servicios/acciones,
TypeScript y ESLint: todas aprobadas. Los resultados 6/6 de navegador y build de la
tabla corresponden a la implementación previa; no se reejecutaron en esta ronda,
que no cambia interfaces ni componentes. No se agregaron dependencias ni se tocaron
otras fases. El único cambio de ejecución es la opción del SDK; la prueba se añadió
al arnés 3B-2B existente. No aparecieron otros bloqueantes confirmados.

Evidencia y fallos previos preservados en `.local/snipers/phase3b2b/`. La persistencia
del flag sigue en false; el navegador habilita Snipers sólo en el proceso sintético.
No se afirman R2 real, VPS real ni validación antivirus/formato/SHA final.

Pendientes externos bloqueantes para acreditar integración real: bucket privado y
credenciales de prueba, CORS real y VPS configurado. Debe probarse allí firma con
longitudes alteradas, ETag visible, límites máximos reales, acceso público denegado y
reinicio systemd. Ninguna de esas dependencias requiere secretos productivos.

Riesgos aceptados: resultados ambiguos requieren cancelar/revisar; huérfanos de un
Create sin respuesta dependen del aborto nativo de R2 hasta 2E; no hay barrido ni
limpieza física. El vencimiento bloquea nuevas firmas/finalizaciones; el barrido de
cargas UPLOADING abandonadas queda en 2E. El SHA del navegador carga como máximo
250 MiB en memoria durante el cálculo; una mejora futura puede hacerlo incremental.

Clasificación de pendientes: **bloqueantes externos** para acreditar la integración
real, R2 privado/CORS y VPS de prueba; **sin bloqueantes locales conocidos** tras los
chequeos anteriores; **mejora no bloqueante**, hash incremental del navegador;
**riesgos aceptados**, bloqueos manuales por ambigüedad y limpieza diferida a 2E.

## Inventario

- Dependencias: package.json/package-lock.json, SDK S3 y presigner oficiales.
- Integración mínima: página existente de edición de clase; sin cambiar ClassEditor.
- Compatibilidad de auditoría: sólo el validador histórico en
  `scripts/phase1/integration.test.ts` acepta ahora v1 o v2 mediante sus respectivos
  esquemas estrictos; las demás aserciones y escenarios permanecen intactos. Sin esta
  ampliación, los recibos nuevos válidos fallaban el consumidor histórico de pruebas.
- Nuevos servicios: upload-contracts, upload-storage, uploads, upload-processor,
  upload-gateway, upload-server y upload-client en `src/lib/snipers/`.
- Nuevas acciones: `src/app/actions/snipers-uploads.ts`.
- Nueva UI: `src/components/snipers/PrivateUploads.tsx`.
- Operación/pruebas en `scripts/phase3b2b/`: `cli.ts`, `worker.ts`,
  `integration.test.ts`, `actions.test.cjs`, `browser.cjs` y `storage-fixture.cjs`.
  Los tres ejemplos de `config/` se detallan en Configuración.
- Informe: este documento. `.vscode/settings.json` era un cambio previo y se conserva.

Sin commit, staging, push, merge, deploy, cambios productivos ni habilitación permanente.
Corregido el bloqueante y aprobadas las comprobaciones focalizadas, se recomienda el
cierre local de 3B-2B sin otra auditoría general. No crear commit sin autorización.

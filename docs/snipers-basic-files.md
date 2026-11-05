# Snipers: archivos privados sin worker obligatorio

Implementación local del 01/11/2026 sobre `646ebe625c431c87a368b2fc69cb31d1816b122f`, rama `feature/snipers-campus`. La implementación se entregó inicialmente sin commit; su revisión focalizada de cierre se registra al final. Sin push, merge, deploy ni cambios remotos. El perfil local conserva `SNIPERS_ENABLED=false`; `.env` no define esa bandera y la aplicación queda deshabilitada por defecto. Los tests habilitan únicamente fachadas/procesos locales aislados. No se modificaron secretos ni `.vscode/settings.json` (su diferencia previa contra HEAD permanece).

## Cambio y recorrido

Se conservan multipart de 8 MiB, contratos de carga, estados, recibos/idempotencia, inventario, transacciones SERIALIZABLE, leases de 60 segundos y generaciones. El navegador sigue enviando las partes directamente al almacenamiento privado; no envía el archivo por una Server Action.

La nueva acción `advanceSnipersUpload({uploadId})` comprueba sesión, permiso explícito `SNIPERS_CONTENT_EDITOR`/`SNIPERS_ADMIN` y propiedad antes de acceder al almacenamiento. No admite flags de aprobación, políticas ni evidencias en su entrada. `getSnipersUpload` sigue siendo una consulta.

Cada avance ejecuta como máximo una etapa:

1. `PREPARING`: el procesador de transferencia existente crea el multipart.
2. `COMPLETING`: ese mismo procesador coteja partes, completa R2 y pasa a `PROCESSING`.
3. `DOWNLOAD`: descarga completa a scratch privado, cuenta tamaño, comprueba SHA-256 y estructura; registra política 2. Cede en `PUT_FINAL`.
4. `PUT_FINAL`: vuelve a descargar y comprobar los bytes del temporal; reserva una clave FINAL nueva antes de un único PUT condicional, con los metadatos privados de entrega existentes. Cede en `VERIFY_FINAL`, incluso si se perdió el acuse del PUT.
5. `VERIFY_FINAL`: GET completo del definitivo y comprobación de tamaño/SHA; confirma atómicamente objeto activado, recurso VERIFIED, carga y trabajo SUCCEEDED, y retiro del temporal. No vincula ni publica automáticamente.

Las etapas de validación tienen un presupuesto de I/O de 45 segundos; la página editorial declara `maxDuration=60`. No se promete un límite global de SQL: los leases y fences impiden acreditar resultados de generaciones vencidas. El alojamiento debe respetar su límite de ejecución. No hay trabajo lanzado sin esperar, servicio nuevo ni dependencia de scratch entre peticiones.

Un avance normal conserva generación/lease, liberando sólo `executionId`/`executionDeadlineAt`. Una llamada concurrente no toma esa ejecución. Al vencer el lease se reclama una generación nueva, se retiran candidatos anteriores y se reinicia desde el temporal en R2. Errores transitorios conservan el backoff de 30 segundos y el límite de cuatro reclamaciones (incluida transferencia); al agotarlo queda BLOCKED, cancelable para volver a cargar. Nunca se repite un PUT a una clave incierta. Una recarga de la pestaña sigue sin recuperar el archivo local/manifiesto del navegador, igual que antes.

`PrivateUploads` solicita estos avances y espera SUCCEEDED; permite reintentar también desde PROCESSING. No se agregaron pantallas ni controles comerciales. Vinculación, publicación, autorización académica, TTL de lectura de 120 segundos y adaptador R2 se conservan.

## Validación y compatibilidad SQL

Política 2: MP3 hasta 250 MiB; PDF hasta 25 MiB, límites actuales sin cambios. Se cuentan todos los bytes y se calcula SHA-256 en servidor. El hash declarado sólo permite cotejar la transferencia; no prueba autoría ni ausencia de malware.

- MP3: recorrido de tramas MPEG Layer III completas y coherentes, al menos tres; admite bitrates variables, ID3v2 inicial e ID3v1 final. Rechaza tramas incompletas, basura y variantes fuera de esos formatos reconocidos. No decodifica el audio.
- PDF: encabezado reconocido, `startxref`, cierre `%%EOF` y posición de xref/objeto dentro del archivo. No interpreta el árbol completo, no descomprime streams ni certifica que el documento pueda renderizarse. No garantiza detectar cifrado, JavaScript, adjuntos internos o malware.

La migración nueva `20261101000000_snipers_basic_files` reemplaza únicamente `snipers_file_check_resource`. Política 1 conserva las evidencias antivirus y vigencia histórica originales; política 2 exige comprobación básica y campos antivirus NULL. Políticas desconocidas y pruebas incompletas se rechazan. No se modificaron Prisma, enums, tablas, migraciones cerradas ni SQL de revisión históricos; no se reetiquetan registros anteriores.

El gate del historial de lanzamiento reconoce la corrección pendiente/aplicada y comprueba su checksum; la migración base sigue verificándose contra su ensamblado determinista. Se fija LF para el nuevo SQL. Antes de una aplicación futura, revisar la corrección y realizar el backup correspondiente; esta entrega no autoriza operaciones remotas.

El worker anterior, sus analizadores y limpieza quedan sin cambios y no se arrancaron. Sus banderas no deben habilitarse para este MVP. Los uploads históricos BLOCKED por otros errores no se aprueban automáticamente. Los objetos retirados se conservan sin limpieza automática y pueden acumular costo de almacenamiento; no se agregaron lifecycle rules remotas.

## Verificación ejecutada

- `node --import tsx --test --test-concurrency=1 scripts/snipers-basic-files/files.test.ts`: **21/21**, sin omisiones, en una base nueva de la instancia local identificada y con respaldos previos. Incluye migración Prisma real y repetición sin cambios, preservación de un definitivo de política 1, recorrido servidor MP3/PDF, vinculación/publicación, firma PLAY/DOWNLOAD, denegación de alumnos y cargas ajenas, integridad, concurrencia, interrupciones, lease vencido, cancelación, PUT incierto y barreras SQL.
- El proceso hijo `actions.test.cjs` ejecutó **1/1** con NextAuth/JWE y PostgreSQL reales, secreto sintético nuevo y ningún R2 configurado. Comprueba todos los exports, incluidos los denegados por sesión, flag, permiso o propiedad. El runner elimina el contexto de test heredado y exige una salida TAP de ejecución efectiva; se conserva el intento anterior que Node omitía.
- Prueba existente `scripts/phase3b2c/storage.test.ts`: **1/1**, SDK S3 real contra HTTP loopback, GET completo, PUT condicional, colisión sin sobrescritura/retry y aborto del stream por plazo.
- TypeScript `--noEmit --incremental false`, ESLint focalizado con `--max-warnings=0` y `npm run build` (Prisma + Next.js/Turbopack, Node 22.14.0): aprobados. El build usa base local, secreto sintético, fuentes simuladas y guardia de red externa; Snipers permanece deshabilitado.

Evidencia privada: `.local/snipers/basic-files/evidence-c9f78aff.json`, logs `actions-c9f78aff.log`, `migrate-c9f78aff-*.log`, `sdk-check-*.log` y `build-1793569290024.log/json`. La base `snipers_basic_c9f78aff` y los respaldos se conservan. En esa ejecución los 105 avances registrados tardaron como máximo 1,43 segundos; los fixtures máximos son sintéticos y el almacenamiento del recorrido principal está controlado en memoria. La prueba S3 separada usa HTTP local.

No se certificaron R2 real, CORS/lifecycle del proveedor, reproducción audible/renderizado en navegador ni límites del alojamiento remoto. Mantener los tamaños actuales no acredita rendimiento remoto: si una medición autorizada posterior muestra interrupciones repetidas de 45 segundos con los máximos, proponer temporalmente MP3 de 32 MiB/PDF de 10 MiB antes de agregar infraestructura. Esta entrega no aplica esa reducción ni inicia esa verificación remota.

## Revisión focalizada previa al commit local

01/11/2026: no se encontraron defectos bloqueantes de autorización, integridad o compatibilidad SQL. Se revisaron las entradas públicas, los permisos y propiedad en servidor, el cómputo completo de bytes/SHA, la validación básica, los fences de ejecución/generación y la confirmación atómica del definitivo. Las evidencias anteriores cubren interrupciones, reintentos, concurrencia y denegaciones; no se repitieron suites extensas.

Se comparó la función SQL nueva con la definición final de la migración cerrada: fuera del bloque que distingue políticas 1/2, las invariantes son idénticas. Los triggers de inmutabilidad de archivos verificados y uploads terminales permanecen intactos. El registro histórico de política 1 fue preservado en la prueba de migración y los checksums de historial se verificaron con Prisma local.

Para el campus se reutilizaron el build actual con bandera false y el smoke HTTP previo de login, curso/matrícula, Snipers deshabilitado y logout, conservado en `.local/snipers/launch-a/correction-1793541128044/acceptance-final.log`. No se modificó código compartido de esos recorridos ni se repitió ese smoke en esta revisión.

Los hashes de `.env`, `.env.snipers.local`, `.vscode/settings.json` y la migración cerrada coinciden con la entrega anterior. El worker, analizadores, adaptador R2, schema.prisma y SQL de revisión históricos coinciden con HEAD. El commit local autorizado debe incluir únicamente los 15 archivos de esta simplificación y excluir la diferencia preexistente de settings, perfiles privados, respaldos y evidencias locales. Los riesgos pendientes descritos arriba se mantienen.

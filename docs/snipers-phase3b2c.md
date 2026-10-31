# Snipers — Fase 3B-2C: validación privada y destino definitivo

Implementación local sobre `9a2ea7e71afe0ea20b15290eccbf0e0f9f1eb3bc`, rama
`feature/snipers-campus`, 31/10/2026 (Argentina). Pendiente de revisión externa;
sin commit, stage, push, merge, deploy ni migración. `SNIPERS_ENABLED=false`.

## Flujo y garantías

Se reutilizan el inventario, `PROCESS_UPLOAD`, autorización editorial, transacciones
SERIALIZABLE, orden de locks, leases de 60 s, heartbeat de 20 s y generaciones de
3B-2A/2B. Sólo se reclama `PROCESSING` con recibo `UPLOAD_START` v2: el estacionamiento
`BLOCKED/DOWNLOAD/AWAITING_VALIDATION` pasa por READY y una reclamación normal. No se
reconstruyen el multipart, recibos ni transferencias. El worker existente alterna
transferencia y validación cuando el interruptor específico lo habilita.

1. Descargar el temporal a un directorio privado, contando bytes y calculando SHA-256
   incrementalmente. Cortar al superar la declaración; exigir longitud exacta y hash
   esperado. Los límites MP3/PDF existentes se vuelven a validar. HEAD no es evidencia.
2. Analizar el mismo archivo, de sólo lectura. MP3: FFmpeg fuerza demuxer MP3,
   decodifica todo el primer stream de audio con errores fatales y exige progreso
   terminado con duración positiva. PDF: qpdf `--is-encrypted` debe devolver 2 y
   `--check` debe devolver 0, sin advertencias. Cualquier cifrado, incluido password
   vacío, se rechaza; no se intenta reparar contenido.
3. Copiar únicamente `main.cvd`, `daily.cvd` y opcionalmente `bytecode.cvd` a un
   snapshot privado, con lectura acotada a 256 MiB por base. `sigtool --info` debe
   verificar las firmas. La fecha de publicación de daily, tomada de su encabezado
   firmado, debe estar entre ahora y 72 horas atrás. ClamAV usa ese mismo snapshot,
   bases oficiales, detección de cifrado y alertas por límites; exige archivo OK,
   exactamente un archivo escaneado, cero infecciones, salida completa y sin errores.
4. Recalcular el hash local después del análisis. Persistir evidencias y reservar una
   clave FINAL nueva por generación **antes** del PUT. Escribir condicionalmente con
   `If-None-Match: *`, sin retries automáticos. Jamás sobrescribir un objeto verificado.
5. Hacer GET completo del definitivo y volver a comprobar tamaño y SHA. Una respuesta
   perdida del PUT sólo se concilia si esta lectura completa coincide. Ausencia,
   corrupción, timeout o lectura ambigua bloquean; no habilitan otro PUT a esa clave.
6. Revalidar lease, generación, autorización, clase y vigencia de firmas. Confirmar
   juntos objeto BYTES_VERIFIED/activado, recurso VERIFIED, carga SUCCEEDED, trabajo
   SUCCEEDED y retiro del temporal. `attachedAt` permanece NULL. No hay vinculación,
   publicación, URL de lectura ni incorporación a la biblioteca de alumnos.

Las operaciones remotas y los procesos hijos quedan fuera de SQL y de callbacks
reintentables. Las restricciones SQL existentes siguen siendo la última barrera.
La versión de política es 1 y la cadena de versiones respeta el formato SQL existente.
No se modifican Prisma, enums, triggers ni migraciones.

## Reinicios, fallos y retenciones

Un reinicio reclama un lease vencido con generación nueva, retira candidatos previos
y repite validación desde el temporal. Escribe a otra clave; una generación vieja
puede terminar un I/O ya emitido, pero no puede acreditar su resultado. Inventario y
claves se conservan. Cancelar cerca también los resultados tardíos.

Hash/tamaño/formato inválidos, cifrado o detección antivirus/límites producen recurso
REJECTED, carga/trabajo FAILED y retiro de todos los objetos. Errores de analizadores,
firmas vencidas, resultados incompletos y promoción incierta bloquean sin VERIFIED.
Errores transitorios de transporte/apagado reprograman 30 s hasta cuatro reclamaciones
totales del trabajo (incluida la transferencia). Un error de invariantes SQL se propaga
para detener el worker; no se presenta como indisponibilidad remota.

Los candidatos abandonados conservan siete días, política conservadora por encima
del mínimo de 24 h. El temporal exitoso conserva al menos 24 h y el horizonte de firmas
de partes +2 s; fallidos/cancelados, siete días. Las extensiones de objetos ya retirados
usan su fecha original y los guards existentes. No se implementa limpieza física (2E).

## Aislamiento y requisitos pendientes del VPS

Se usa el **systemd ya previsto para el worker** para ejecutar procesos individuales
en unidades transitorias; no se agrega un daemon, cola, supervisor propio ni contenedor.
No hay fallback sin aislamiento. En Windows el ejecutor real rechaza la operación.

Cada análisis usa DynamicUser, filesystem temporal de raíz de sólo lectura con
exposición limitada a `/usr`, librerías, input y snapshot, directorio temporal acotado,
red privada y denegada, sin capacidades, sin privilegios nuevos ni credenciales.
`env -i` elimina el entorno incluso si systemd tuviera variables globales.
Hay límites de memoria (1 GiB), swap (0), CPU (120 s/100%), procesos (16), archivos,
salida (64 KiB) y duración (150 s por proceso; watchdog 155 s). Cancelación/timeout
solicitan detener el cgroup; RuntimeMaxSec limita el proceso aun si el worker muere.
Descarga, PUT y relectura tienen cada uno un máximo de 120 s; el trabajo completo, 12 min.

Referencia: `config/snipers-validation.env.example`. Antes de habilitar en VPS:

- Instalar/verificar FFmpeg, qpdf, ClamAV/sigtool y las propiedades de systemd usadas.
- Proveer bases oficiales **CVD firmadas** vigentes; política 1 rechaza CLD. El analizador
  no ejecuta freshclam ni obtiene firmas por red. La actualización corresponde al host.
- Dar al worker autorización administrada para sus ejecuciones aisladas y su detención;
  no otorgar acceso genérico irrestricto al gestor de servicios. Su integración de
  privilegios debe verificarse en el VPS antes de habilitar la bandera.
- Configurar en la unidad existente `StateDirectory=snipers-validation` y
  `StateDirectoryMode=0700`; usar `/var/lib/snipers-validation`. La unidad tiene
  PrivateTmp: un archivo en su `/tmp` no sería visible al gestor de systemd.
- Verificar en el host que los procesos ven sólo los mounts previstos, no tienen red
  ni secretos, respetan límites y mueren al vencer/cancelar. No se ejecutó aquí.
- Verificar R2 privado real, PUT condicional, GET y recuperación con reinicio real.

Son bloqueantes externos para acreditar operación real. No se instalaron binarios,
unidades, reglas de permisos ni infraestructura durante esta entrega.

Referencias primarias utilizadas al preparar los comandos:
[FFmpeg](https://www.ffmpeg.org/ffmpeg-protocols.html),
[qpdf](https://qpdf.readthedocs.io/en/stable/cli.html),
[ClamAV y límites](https://docs.clamav.net/manual/Usage/Scanning.html),
[firmas CVD](https://docs.clamav.net/manual/Signatures.html),
[aislamiento systemd](https://freedesktop.org/software/systemd/man/latest/systemd.exec.html).

## Reproducción y alcance de evidencia

```powershell
node node_modules/tsx/dist/cli.mjs scripts/phase3b2c/cli.ts test
node node_modules/tsx/dist/cli.mjs scripts/phase3b2c/cli.ts test-transfer
node node_modules/tsx/dist/cli.mjs scripts/phase3b2c/cli.ts typecheck
node node_modules/tsx/dist/cli.mjs scripts/phase3b2c/cli.ts lint
```

Ejecutar test y test-transfer **en serie**: comparten cola local. El lanzador nuevo
impide dos ejecuciones simultáneas de esas acciones mediante un lock local exclusivo.
Valida rama/HEAD, identidad PostgreSQL, flag, esquema/perfiles/archivos y red loopback.
Antes de cada suite que escribe ejecuta `npm run db:backup` con el perfil local y
verifica dump/manifiesto. No borra historia. Logs, backups y resultados fallidos se
preservan en ubicaciones ignoradas; no forman parte de la entrega.

Las pruebas SQL usan PostgreSQL real y dobles declarados de almacenamiento/analizadores.
La prueba del adaptador usa SDK S3 real contra HTTP loopback: no certifica R2 ni SigV4.
Las pruebas de comandos verifican orquestación y criterios de aceptación con un runner
doble: no certifican decodificación real, análisis de malware real ni aislamiento Linux.
No se afirma validación externa inexistente.

## Riesgos aceptables y mejoras

Los resultados ambiguos bloqueados requieren revisión/cancelación; no hay desbloqueo
automático ni escrituras repetidas. Un proceso externo puede vivir hasta su límite si
muere el worker; su generación ya no puede activar nada. Un crash puede dejar scratch
local huérfano y objetos retirados; la limpieza operativa local y 2E siguen pendientes.
Los límites pueden rechazar archivos costosos pero legítimos. Admitir CLD con un contrato
de autenticidad equivalente y optimizar snapshots es una mejora posterior, no una
razón para aceptar análisis incompletos.

La ejecución simultánea accidental de las dos suites produjo interferencia de fixtures
y errores 40001/INVALID_STATE. Se conserva su evidencia y se repiten en serie. Un primer
fallo del fixture HTTP incorporaba query strings S3 a la clave: se corrigió sólo el
fixture. El primer formato de versión de firmas no respetaba el CHECK existente:
se ajustó la implementación sin cambiar SQL.

Tras terminar esa corrida, se cancelaron **23 transferencias sintéticas** creadas en
su ventana temporal exacta, después de otro backup verificado. Se conservaron filas,
inventario y auditoría; no se borraron fixtures ni se alteraron aserciones históricas.
La recuperación puntual queda en `.local/` junto con la evidencia, fuera de la entrega.

Resultados de implementación anteriores a la auditoría focalizada, en ejecuciones separadas:

| Comprobación | Resultado |
|---|---|
| Suite 3B-2C (22 casos SQL, 7 unitarios/orquestación, 1 SDK HTTP y contenedor SQL) | 31/31, ninguna omitida |
| Regresión de servicios/procesador de transferencia afectados, sin editar la suite 2B | 19/19, ninguna omitida |
| TypeScript `--noEmit --incremental false` | Aprobado |
| ESLint de fuentes y arnés afectados, `--max-warnings=0` | Aprobado |
| Esquema, perfiles, archivos protegidos y destinos instrumentados | Sin cambios durante cada ejecución final; sólo loopback |
| FFmpeg/qpdf/ClamAV, aislamiento Linux, R2 y VPS reales | No ejecutados; requisitos externos pendientes |

No se reejecutan acciones/UI ni suites de fases anteriores sin cambios relacionados.
El SDK emite el aviso esperado de petición streaming no reintentable al inducir 412;
la aserción comprueba el rechazo y ausencia de un retry/sobrescritura.

## Inventario

| Estado respecto de HEAD | Archivo exacto | Cambio |
|---|---|---|
| Modificado | `src/lib/snipers/upload-processor.ts` | Reutilizar claim/fencing, continuación PROCESSING y selección puntual para pruebas. |
| Modificado | `src/lib/snipers/upload-storage.ts` | GET streaming y PUT condicional con el cliente/credenciales de prueba existentes. |
| Modificado | `scripts/phase3b2b/worker.ts` | Continuación de validación optativa en el worker existente. |
| Nuevo | `src/lib/snipers/file-validation.ts` | Conteo, SHA-256 incremental, contrato de evidencia y vigencia de firmas. |
| Nuevo | `src/lib/snipers/file-analyzers.ts` | Snapshot de bases, comandos, aislamiento y evaluación de resultados. |
| Nuevo | `src/lib/snipers/file-processor.ts` | Validación, promoción, relectura, fencing y confirmación SQL atómica. |
| Nuevo | `scripts/phase3b2c/cli.ts` | Lanzador protegido con backup, trazas, hashes y exclusión mutua de suites. |
| Nuevo | `scripts/phase3b2c/integration.test.ts` | Pruebas de persistencia y recuperación con PostgreSQL real. |
| Nuevo | `scripts/phase3b2c/validation.test.ts` | Lectura acotada y criterios de analizadores con runner doble. |
| Nuevo | `scripts/phase3b2c/storage.test.ts` | SDK S3 real contra fixture HTTP loopback. |
| Nuevo | `config/snipers-validation.env.example` | Referencia deshabilitada, bases CVD y scratch compartido con systemd. |
| Nuevo | `docs/snipers-phase3b2c.md` | Implementación, evidencia, inventario y auditoría focalizada. |

La transferencia existente conserva su comportamiento por defecto. No se cambia UI
ni servicios editoriales.

`.vscode/settings.json` es un cambio preexistente y queda fuera de esta entrega.
Perfiles, secretos, respaldos y `.local/` tampoco se incluyen. El cierre local y cualquier
commit esperan autorización tras revisión externa.

## Auditoría técnica focalizada — 31/10/2026

Alcance: exactamente los doce archivos de la tabla anterior; consulta de contratos,
guards SQL y documentación 3B-2A/2B. Sin rediseño, esquema nuevo ni infraestructura.
Durante esta auditoría sólo cambiaron `file-processor.ts`, `integration.test.ts`,
`storage.test.ts` y este documento. Los tres archivos modificados de fases anteriores
conservaron sus hashes de inicio de auditoría. Una baseline de **365 archivos
rastreados/perfiles** confirma cero cambios, incluidos contratos, SQL, Prisma,
`.vscode/settings.json` y pruebas históricas. Los nuevos de 3B-2C no estaban rastreados
y sus cambios autorizados se describen por separado aquí.

### B1 — defecto real de recuperación, corregido

En `src/lib/snipers/file-processor.ts:17` y `:18`, `retire()` añadía ahora +2 s incluso
sin horizonte de firmas. Al recuperar un trabajo con un candidato retirado hace ocho
días y retención original de siete días ya vencida, intentaba extender `cleanupAfter`
y `nextProbeAt` más allá del plazo permitido. PostgreSQL rechazaba la operación con
`23514: Retention extension requires current policy justification`, y el worker salía
sin poder reanudar el archivo. **Impacto: disponibilidad/recuperación; no aprobación
de bytes inválidos ni sobrescritura.** Era un defecto de código, no una integración
externa pendiente.

Reproducción persistida: nueva prueba `integration.test.ts:123`. Se crea un candidato
IN_FLIGHT, se simula el tiempo transcurrido al registrar su primer retiro y se deja
el trabajo reintentable; no se reescriben fechas de un objeto ya retirado. La ejecución
previa a corregir falló exactamente en `retire()` con el SQLSTATE anterior.

Corrección mínima: quitar el fallback al reloj actual de las dos expresiones; sólo un
horizonte de firmas no NULL agrega +2 s. Se conserva el cálculo desde `retiredAt` y no
se reducen retenciones. La regresión exige que las tres fechas del candidato viejo
permanezcan iguales y que el nuevo intento alcance VERIFIED con otra clave.
Estado: **resuelto**, sin bloqueantes de código pendientes encontrados en esta auditoría.

### Comprobaciones A–D y alcance de evidencia

| Propiedad | Evidencia revisada y límites |
|---|---|
| Descarga acotada | `inspectBytes` cuenta antes de escribir y falla al superar el tamaño declarado, validado contra 250 MiB MP3/25 MiB PDF. Pipeline con contrapresión, sin buffer completo, y señales de 120 s. Pruebas de exceso, truncamiento, error y fuente estancada. No se midió RSS ni una cuota global del host. |
| Disco y bytes locales | Archivo exclusivo `wx` en directorio 0700, después 0444; máximo por entrada según declaración. Snapshot de hasta tres bases de 256 MiB cada una. La limpieza normal está en finally; un crash puede dejar scratch huérfano. |
| Mismos bytes | Los analizadores reciben el archivo local original mediante bind de sólo lectura y DynamicUser; el worker recalcula SHA después y revalida bytes remotos después del PUT. No se promueve salida de analizadores. La efectividad del bind/UID en Linux no se probó aquí. No se cubre compromiso del worker/administrador del host. |
| MP3 y PDF | FFmpeg fuerza MP3 y decodificación, exige código cero, audio/progreso final y sin errores. qpdf verifica cifrado y estructura; cualquier cifrado/error/warning se rechaza. Los tests de estas herramientas son dobles de comandos/resultados, no decodificación real. |
| Antivirus | Snapshot usado tanto por sigtool como por clamscan; edad de daily también comprobada contra reloj SQL antes de activar. Salida limpia y completa requerida, detección de límites/cifrado activa; códigos no cero, warnings y resúmenes incompletos fallan. Malware real, bases oficiales y timeout del motor siguen sin ejecutar. |
| Invocación/aislamiento | `spawn` con ejecutables absolutos y arrays, sin shell, nombres de herramientas fijos; paths de mounts sin espacios/specifiers/`..`. `env -i`, red privada/denegada, sin capacidades, límites de memoria/CPU/procesos/tmp/salida/duración y solicitud de stop del cgroup. Los tests inspeccionan argumentos; no certifican aplicación de propiedades ni muerte real del cgroup. |
| FINAL e idempotencia | UUID y generación en clave inventariada única permanente antes de PUT; `IfNoneMatch='*'`, maxAttempts=1. SDK real y fixture HTTP comprueban colisión 412 sin retry/sobrescritura. Resultado perdido sólo se concilia por GET completo coincidente; ausencia/corrupción bloquean. |
| Confirmación | Prueba source + formato/AV + edad de firmas + prueba FINAL se confirman con trabajo/carga/recurso y retiro del temporal. Los guards SQL mantienen generación/lease y coherencia final. No hay I/O remoto en transacciones. Tests SQL rechazan VERIFIED parcial y prueban replay sin nueva escritura. |
| Obsolescencia | Cancelación durante análisis/PUT/GET FINAL, generación reemplazada durante PUT y lease vencido durante GET FINAL impiden que el resultado viejo se acredite. La recuperación usa clave/generación nuevas y conserva inventario retirado. `attachedAt` se comprueba NULL. |

La expiración de firmas de partes y de transferencia conserva el contrato de 2B:
no se firman/finalizan nuevas transferencias vencidas. Una carga ya sellada PROCESSING
se verifica mediante sus leases y controles; 2A no permite PROCESSING → EXPIRED. No se
introdujo una transición nueva ni un vencimiento editorial distinto.

Fronteras de caída revisadas: antes/después de GET temporal, análisis, reserva SQL,
PUT, acuse, GET FINAL y activación. Antes de la confirmación atómica, un reinicio vuelve
a validar con una generación nueva y abandona el destino previo; después, el trabajo
SUCCEEDED no es reclamable. La pérdida de respuesta de COMMIT no autoriza repetir PUT
a la misma clave. Estas conclusiones combinan revisión de código/contratos con las
inyecciones de fallo existentes; no se simularon desconexiones PostgreSQL en todas
las instrucciones ni SIGKILL reales en cada frontera.

Cobertura añadida sin ampliar infraestructura: tres casos SQL (B1, cancelación durante
GET FINAL, vencimiento de lease durante GET FINAL) y una comprobación dentro del test
SDK: respuesta GET HTTP real con encabezados y cuerpo que nunca termina; plazo de
100 ms exclusivo de la prueba, fuente destruida y watchdog independiente aún vigente.

### Clasificación final

- **Bloqueantes reales:** B1 corregido con reproducción roja y regresión verde. No
  quedan defectos bloqueantes demostrados en el alcance revisado.
- **Mejoras no bloqueantes:** soporte de CLD con autenticidad equivalente; reducir el
  costo de copiar CVD; medir consumo máximo real. Son mejoras de compatibilidad/costo,
  no sustituyen controles ni justifican aceptar resultados parciales.
- **Riesgos aceptables:** ambigüedad no conciliable bloquea hasta revisión/cancelación;
  puede haber falsos rechazos por límites y scratch huérfano tras crash. No relajan
  VERIFIED; limpieza remota es 2E y mantenimiento local sigue operativo.
- **Pendientes externos:** Linux/systemd y permisos efectivos del worker; aislamiento
  real de red/filesystem/credenciales, límites y cancelación del cgroup; FFmpeg/qpdf/
  ClamAV/sigtool reales con corpus válido/corrupto/cifrado y malware de prueba; bases
  vigentes; R2 privado con PUT condicional/GET y VPS/reinicio real. Son requisitos antes
  de habilitar operación externa, **no bloqueantes del commit local por sí solos**.

Resultados de esta auditoría: **34/34** de 3B-2C (25 casos SQL, su contenedor, siete
unitarios/orquestación y un caso SDK ampliado), **19/19** de regresión de transferencia,
sin omitidas, ejecutados en serie y con backups verificados. Las pruebas históricas no
se editaron. El aviso del SDK al inducir 412 es esperado y la prueba exige su rechazo.

TypeScript `--noEmit --incremental false` y ESLint `--max-warnings=0` del alcance
afectado: aprobados nuevamente después de las correcciones y pruebas añadidas.
`git diff --check` cubre los tres modificados; los nueve nuevos se comprueban también
contra un archivo vacío mediante `git diff --no-index --check`, sin stage. Su código
1 por diferencias es esperado; se exige ausencia de diagnósticos de whitespace.

Recomendación: **APTO PARA COMMIT LOCAL** tras la corrección B1 y los chequeos
aprobados de TypeScript/ESLint/diff. No equivale a integración Linux/R2 acreditada
ni a autorización para habilitar banderas, publicar, desplegar o crear el commit.

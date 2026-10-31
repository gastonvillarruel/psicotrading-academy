# Grupo de Snipers — Fase 3B-2E

Implementación y validación exclusivamente local, 31/10/2026 (Argentina).
Base: `feature/snipers-campus`, HEAD `2091e5c2dd1b2508bee8ca8df526a61cbaec639b`.
Pendiente de auditoría independiente y autorización de commit. No se habilitan banderas.

## Alcance y política efectiva

Se reutilizan PostgreSQL, el inventario permanente, los guards SQL de 2A y el worker
secuencial existente. No hay Prisma, SQL, migraciones, paquetes, endpoints, UI,
contenedores, servicios o unidades systemd nuevos.

- Sólo `PREPARING`/`UPLOADING` vencidas pasan a `EXPIRED`, mediante `lockUpload` y
  `terminateUpload`. La transición, cancelación de productores, retiro y auditoría
  se confirman en una transacción SERIALIZABLE. No se aborta remotamente en el barrido.
- `expiresAt` deja de cancelar `COMPLETING`. Las cargas selladas bloqueadas conservan
  estado y bytes hasta resolución o cancelación explícita. No se agrega desbloqueo
  automático de resultados ambiguos ni se alteran otras causas de cierre existentes.
- Temporales exitosos conservan al menos 24 horas; canceladas, expiradas y fallidas
  conservan la política existente de siete días. Candidatos finales abandonados
  conservan sus siete días. Siempre rigen `cleanupAfter`, `nextProbeAt` y firmas +2 s.
- La limpieza física espera además carga terminal y ausencia de productores activos.
  Un candidato retirado de una carga sellada todavía bloqueada se conserva.
- Cualquier definitivo activado o seleccionado mediante `finalObjectId`/`objectKey`
  se protege, incluso si el recurso está archivado y el objeto retirado. La fase no
  agrega una autorización editorial para eliminarlo. Desvinculación, despublicación,
  archivado de clase y antigüedad nunca autorizan borrado.

## Protocolo, concurrencia y recuperación

El registro de trabajos parte del inventario SQL y de un recibo `UPLOAD_START` v2
estricto con actor, recurso, carga e identificador concordantes. La clave debe ser
exactamente la emitida por el productor: tipo/recurso/generación/objeto. Los fixtures
históricos sin esa procedencia no se convierten en candidatos remotos.

Hay un `CLEAN_OBJECT` por objeto, respaldado por el índice parcial existente. Claim,
heartbeat, comprobaciones y confirmación toman los bloqueos clase → recurso → carga
→ objetos → trabajos. Se comprueban lease vivo, token, generación, retiro, plazos,
procedencia, selección y dependencias antes y después del I/O. No se mantiene una
transacción SQL abierta durante peticiones remotas.

Antes del primer aborto o DELETE se consulta HEAD. Si existe un objeto completo con
identidad de carga ausente o contradictoria, se bloquea sin llamadas destructivas.
Esta comprobación conservadora complementa la autorización SQL; no la sustituye.

Los temporales conocidos se abortan por su ID persistido; los desconocidos se
descubren con `ListMultipartUploads` paginado y prefijo igual a la clave autorizada.
Se abortan exclusivamente coincidencias exactas. Se repite un listado completo
sin abortos para acreditar que no quedan multipart. Luego se ejecutan DELETE
individual y HEAD. Errores, paginación inválida, listados parciales y cancelaciones
locales nunca acreditan ausencia.

Una ausencia comprobada permite `QUIESCENT` directamente: los CHECK SQL existentes
lo permiten con `lastProbeAt`/`lastAbsentAt`. No se exigen dos observaciones a 24 h.
Sólo los estados de escritura congelados `IN_FLIGHT`/`UNCERTAIN` reabren semanalmente
el mismo trabajo, con nueva generación. Si reaparecen objetos o multipart, el mismo
protocolo vuelve a eliminarlos. Las escrituras confirmadas no se sondean recurrentemente.

La justificación no es consistencia eventual: R2 documenta consistencia fuerte y que
la última escritura en terminar gana. Un Create/Complete/PUT ya emitido puede terminar
después de la ausencia observada. No existe aquí una cota demostrada del proveedor
que permita abandonar definitivamente el sondeo de esos estados inciertos.
[Consistencia R2](https://developers.cloudflare.com/r2/reference/consistency/).

Un DELETE emitido no puede alcanzar bytes que vuelvan a ser legítimamente vigentes
en el protocolo: identidad y clave son inmutables, la clave es única y el inventario
no se elimina; el retiro es irreversible y bloquea activación/escritura SQL; recursos
verificados no pueden cambiar su selección histórica; otras generaciones usan otras
claves. La carga terminal elimina resoluciones pendientes que podrían ampliar la
retención. El guard SQL invalida/reprograma leases ante extensiones, pero no cancela
un DELETE remoto ya emitido. No se atribuye al fencing esa garantía inexistente.

La auditoría técnica v3 usa `FILE_FOUNDATION_CHANGED`, actor NULL y payload Zod
estricto. Guarda intención, generaciones, resultados, observaciones y códigos
permitidos. No guarda claves, nombres, URLs, tokens, credenciales ni IDs multipart.
Los sondeos quiescentes sin cambios no duplican eventos de quiescencia; las intenciones
destructivas quedan identificadas por trabajo/generación/fase. No se eliminan filas,
manifiestos, pruebas de bytes/antivirus/formato ni eventos históricos.

## Worker y límites

`SNIPERS_STORAGE_CLEANUP_ENABLED=false` es independiente del flag web y de validación.
El worker conserva el singleton PostgreSQL y ejecuta transferencia y validación antes
del mantenimiento. Barre como máximo un agregado cada 60 s y procesa como máximo un
trabajo de limpieza por vuelta. No hay drenaje ilimitado de pendientes.

Presupuesto remoto por visita: 30 s, incluyendo el tiempo consumido al reclamar;
máximo 10 s por petición. Lease de 60 s y heartbeat cada 20 s, cercado bajo bloqueos.
El presupuesto interrumpe paginación/abortos extensos y reprograma; no los interpreta
como ausencia. El corte local también deja de esperar a un adaptador que ignore abort,
sin afirmar que el proveedor haya cancelado la solicitud enviada.

Errores transitorios: WAIT_RETRY a 15 min, conservando intención e inventario.
Configuración, identidad o dependencia insegura: BLOCKED. Error de invariantes SQL
en la ejecución: se propaga y detiene el worker. SIGTERM/pérdida del singleton abortan
el trabajo; un reinicio reclama leases vencidos con nueva generación. Se conservan
los límites originales del SDK, de validación y de systemd.

## Archivos de la entrega

Nuevos:

- `src/lib/snipers/storage-cleanup.ts`.
- `scripts/phase3b2e/cli.ts`.
- `scripts/phase3b2e/integration.test.ts`.
- `scripts/phase3b2e/storage.test.ts`.
- `docs/snipers-phase3b2e.md`.

Modificados:

- `src/lib/snipers/upload-processor.ts`: vencimiento sólo no sellado.
- `src/lib/snipers/upload-storage.ts`: contrato/adaptador de limpieza.
- `src/lib/snipers/file-contracts.ts`: auditoría técnica v3.
- `scripts/phase3b2b/worker.ts`: mantenimiento secundario y opt-in.
- `config/snipers-uploads.env.example`: bandera false y condición operativa.
- `scripts/phase1/integration.test.ts`: lector histórico estricto v3.
- `scripts/phase3b2b/integration.test.ts`: lector v1/v2/v3 y alcance por uploadId para
  evitar que los dobles de transporte procesen fixtures persistidos de otras suites.
  Se mantienen las aserciones históricas y el procesador no cambia por esa adaptación.

`uploads.ts`, Prisma, SQL canónico/aplicado, perfiles y unidad systemd quedan intactos.
La modificación preexistente de `.vscode/settings.json` se protege mediante hash.

## Verificación local y evidencia

El lanzador nuevo fija rama/HEAD/flag, identidad y privilegios del PostgreSQL local;
verifica los checksums canónicos/aplicados de las ocho migraciones locales y
preserva baseline y esquema, hashes de archivos protegidos y perfiles. Usa el runner
existente con credenciales externas vacías y preloader que sólo permite red loopback.
Antes de cada grupo con escrituras ejecuta `npm run db:backup` con el perfil explícito;
verifica SHA-256, tamaño, manifiesto, destino y TOC. No se afirma una restauración nueva.
La evidencia se conserva en `.local/snipers/phase3b2e/`, sin sobrescribir corridas previas.

Comandos reproducibles: `node node_modules/tsx/dist/cli.mjs scripts/phase3b2e/cli.ts`
seguido de `test`, `regression`, `typecheck`, `lint`, `build` o `verify`. `init` sólo
crea la baseline inicial y rechaza sobrescribirla. Los lanzadores históricos y sus
HEAD congelados no se modifican.

Resultados finales aprobados:

| Comprobación | Resultado | Evidencia en `.local/snipers/phase3b2e/` |
|---|---|---|
| Focalizadas 3B-2E | 28/28, cero fallos/cancelaciones/omitidas | `test-1793483199287-evidence.json` |
| Regresiones 2A/2B/2C/2D + auditoría Fase 1 | 139/139, cero fallos/cancelaciones/omitidas | `regression-1793482780445-evidence.json` |
| TypeScript sin emitir/incremental | Aprobado sobre fuentes finales | `typecheck-1793483461781-evidence.json` |
| ESLint, cero warnings admitidos | Aprobado | `lint-1793483339627-evidence.json` |
| Prisma generate + Next 16.2.6 build --webpack aislado | Aprobado, 38/38 páginas estáticas; TypeScript integrado aprobado | `build-1793483353866-evidence.json` |

Cada corrida exitosa acredita `unchanged=true`, `localOnly=true`, esquema inalterado,
archivos protegidos preservados y flag persistente false. La baseline contiene 383
archivos/perfiles; la excepción de alcance incluye los siete archivos anteriores
modificados. El hash de `.vscode/settings.json` coincide con su baseline preexistente.
No se ejecutó navegador nuevo: no hay cambios de UI; las regresiones incluyen acciones,
autorización, almacenamiento y entrega. No se afirma R2/VPS/analizadores reales.

La suite focalizada utiliza PostgreSQL real, dobles explícitos de almacenamiento y
analizador, y SDK real contra HTTP loopback. Incluye contención observada en
`pg_stat_activity`, expiración frente a sellado, unicidad de trabajos, takeover,
heartbeat, invalidación del token, claves con prefijo compartido, Create sin ID
persistido, Create/Complete/PUT tardíos, errores de DELETE/HEAD/paginación, apagado,
límites reales de 10/30 s y protección de definitivos incluso mal encolados.
Las fechas antiguas de fixtures se construyen mediante SQL permitido; no se cambian
relojes de producción ni se debilitan guards. El SIGTERM se representa mediante
AbortSignal; no acredita un reinicio de systemd real.

Se conservan los fallos anteriores: presupuesto fraccional rechazado por la API de
timeout (corregido), interpretación del error HTTP HEAD 403 en el fixture (corregida),
cursor del doble que dependía de encontrar un multipart ya abortado (corregido), y
regresión 2B que reclamaba trabajos ajenos / asumía sólo dos versiones de auditoría.
TypeScript detectó además que el tipo del fixture exigía campos de recibo no usados
por las observaciones; se limitó a recurso/carga/almacenamiento, sin cambio de ejecución.
No se borran fixtures, recibos ni logs para hacer pasar las comprobaciones.

## Clasificación y límites pendientes

- Bloqueantes locales encontrados: ninguno pendiente tras las correcciones y checks.
- Bloqueantes operativos externos: antes de habilitar cargas reales hay que comprobar
  que ninguna regla de aborto multipart alcance `snipers/temporary/` y que ninguna
  expiración borre objetos todavía necesarios. R2 tiene aborto incompleto por defecto
  a siete días desde inicio; aumentar a otro plazo finito no cumple conservación
  hasta resolución/cancelación. No se consultó ni modificó el bucket real y no se
  promete recuperar partes ya eliminadas. `COMPLETING` puede necesitar esas partes;
  `PROCESSING` ya requiere un objeto completo observado.
  [Lifecycle R2](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
- Pendiente R2/VPS real: permisos y privacidad efectivos, listado/paginación, aborto,
  DELETE/HEAD, recuperación, singleton, límites, parada y reinicio systemd. También
  permanecen los prerrequisitos operativos de validación documentados en 2C/2D.
- Riesgos aceptados: bytes necesarios de cargas selladas bloqueadas conservados hasta
  intervención; liberación demorada por retención, backlog o sondeo semanal; una
  solicitud remota puede terminar después del corte local. Inventario y evidencias
  permanecen; esta fase no restaura bytes borrados ni agrega herramientas editoriales.
- Mejoras no bloqueantes: ajuste de capacidad del barrido si el volumen futuro lo
  justifica. No se introduce mayor paralelismo ni sondeo permanente generalizado.

Producción fuera de alcance. Sin commit, stage, push, merge, deploy, migración
productiva ni cambios a R2/VPS reales. Detener para auditoría independiente antes
de autorizar commit local o habilitación.

Estado Git de entrega: misma rama y HEAD; cinco archivos nuevos y siete anteriores
modificados por esta fase, todos sin staging. Se conserva aparte la modificación
preexistente de `.vscode/settings.json`, sin alteraciones. `SNIPERS_ENABLED=false` y
la nueva bandera de mantenimiento permanece false por defecto.

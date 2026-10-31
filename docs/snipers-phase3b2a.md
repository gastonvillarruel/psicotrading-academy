# Grupo de Snipers — Fase 3B-2A: persistencia y contratos

Entrega del **30/10/2026 (Argentina)** para auditoría independiente. Base Git verificada:
`c9132806f52f5be499471b72e0ee6943a9bd94b9`, rama `feature/snipers-campus`.
Sin commit, stage, push, merge ni despliegue. La autorización se limita a 3B-2A.

## Alcance implementado

- Cuatro columnas nuevas en `SnipersResource`: `finalObjectId`, `attachedAt`, `verifiedAt`
  y `archivedAt`; `objectKey` ahora admite NULL antes de verificar.
- Tres modelos: `SnipersUpload`, `SnipersFileJob`, `SnipersStorageObject`.
- Siete enums técnicos y una acción de auditoría `FILE_FOUNDATION_CHANGED`.
- FK simples/compuestas, CHECK de fila, unicidad parcial, transiciones irreversibles,
  inventario permanente y restricciones de coherencia diferidas.
- Contratos Zod estrictos y combinador interno de recibos idempotentes, sin fachada HTTP.
- Lanzador local protegido y pruebas de SQL directo/concurrencia PostgreSQL real.

La relación inversa de cargas en Prisma `User` no agrega columnas ni altera su tabla.
Los servicios comerciales, permisos y sesión conservan sus hashes. La corrección
editorial autorizada al final de esta revisión agrega sólo lectura de encuentros por
ID y detección/presentación de revisión remota; se detalla abajo.
La única prueba histórica ampliada es la validación de auditoría de Fase 1: mantiene
todas las ramas/aserciones anteriores y reconoce el contrato estricto nuevo.

No hay worker operativo, supervisor, multipart real, SDK R2, analizadores, URLs firmadas,
reproducción, vinculación editorial operativa ni limpieza remota. No se instalaron
dependencias ni se crearon permisos o reglas comerciales nuevos.

## Contratos e idempotencia

`file-contracts.ts` contiene los estados acordados, límites exactos MP3/PDF, manifiesto
ordenado, observaciones de retiro y una auditoría sin datos arbitrarios.
El tamaño de parte previsto es 8 MiB. Estas declaraciones no implementan una carga.

`withFileReceipt` es infraestructura interna: autoriza al editor/supervisor, busca el
UUID/actor/huella originales, ejecuta un callback SQL y registra el recibo en la misma
transacción SERIALIZABLE. La carrera de UUID revierte y concilia en una transacción
nueva autorizada. Otro actor/intención no reutiliza el recibo. La autorización precede
también a replay, por lo que una revocación lo impide.

El callback debe usar exclusivamente el `PoolClient` recibido, adquirir bloqueos del
agregado en orden y no hacer I/O remoto ni abrir otra transacción. El combinador no
implementa ni certifica por sí mismo un comando editorial: las operaciones de subfases
posteriores deben aportar su trabajo y comprobaciones de versión.

## Restricciones y mecanismos SQL

| Invariante | Implementación |
|---|---|
| Pertenencia a recurso/clase/usuario existentes | FK restrictivas. |
| Carga, temporal, productor, definitivo y limpieza del mismo recurso | Cinco FK compuestas con identidad `(id, resourceId)`. |
| Referencias que requieren estado transaccional final | Tres FK `DEFERRABLE INITIALLY DEFERRED`: definitivo, temporal y destino de limpieza. |
| Una carga por recurso, clave única permanente y candidato por generación | UNIQUE e índices únicos generados por Prisma. |
| Un trabajo por tipo/carga, uno de limpieza por objeto y una activación por recurso | Tres índices únicos parciales. |
| Tamaños 262144000/26214400, MIME, SHA-256, campos requeridos, lease y fases | CHECK de fila; NULL no elude prueba final ni estado RUNNING/SUCCEEDED. |
| Manifiesto completo y ordenado según tamaño del recurso | Función de coherencia diferida, incluyendo atributos/cantidad/ETags permitidos. |
| Estados de manifiesto e intención de escritura | CHECK adicionales en `005`. |
| Recurso archivado terminal; bytes/identidades inmutables | Trigger BEFORE INSERT/UPDATE/DELETE. |
| Retiro irreversible y filas/claves no reutilizables | BEFORE UPDATE, prohibición de DELETE y BEFORE TRUNCATE. |
| Coherencia recurso/carga/objeto/trabajo | Cuatro constraint triggers diferibles, ejecutados desde ambos extremos. |
| Preparación/procesamiento y su resultado se confirman juntos | Dos constraint triggers diferibles adicionales en carga/trabajo. |
| Generación actual para crear/modificar candidatos y registrar validación | Guards con trabajo RUNNING, generación y reloj PostgreSQL. |
| Lease/generación no retroceden ni resucitan | Guard de transición; CAS parametrizado demostrado por SQL en pruebas. |
| Sin write skew por escrituras relacionales bajo aislamiento insuficiente | Guard SERIALIZABLE para tablas nuevas y cambios relacionales de recursos. |

Los CHECK no consultan otras tablas. Las funciones diferidas inspeccionan el estado
final; las escrituras relevantes deben ser SERIALIZABLE. El fixture histórico PENDING
con clave reservada y sin inventario sigue siendo válido bajo READ COMMITTED. Ningún
trigger nuevo se instala en clases, membresías, permisos ni tablas comerciales.

La prueba final requiere coincidencia de checksum/tamaño esperado, temporal y definitivo;
marcas de formato/antivirus, versión de firmas/política, generación de validación,
trabajo productor SUCCEEDED y objeto activado seleccionado. La prueba de activación
deja `attachedAt` en NULL; no existe todavía un servicio que verifique o vincule archivos.
Los bytes permanecen inmutables también después de archivar.

Un retiro no puede alcanzar un definitivo vigente ni un temporal todavía requerido por
una carga activa. Un archivo exige retirar su definitivo en la misma transacción.
El retiro conserva irreversiblemente `retiredAt`; `cleanupAfter` sólo puede crecer hasta
el mínimo justificado por la política vigente. La extensión eleva `nextProbeAt`, devuelve
la observación a PENDING y cancela cualquier lease de limpieza, eliminando su token.
El mismo trabajo queda WAIT_RETRY con `availableAt` al menos igual al plazo ampliado.
La generación no se falsifica: la siguiente reclamación deberá incrementarla. Cambiar
observaciones a PENDING o QUIESCENT nunca permite retirar la marca ni reactivar el objeto. Las retenciones mínimas
de 24 horas/siete días se validan según el destino y estado. No existe un borrado físico
en esta entrega, ni una garantía de ausencia futura por marcar QUIESCENT.

El límite superior del lease admite un milisegundo de representación por `timestamptz(3)`;
su vencimiento efectivo se comprueba siempre contra el valor persistido. No se introduce
esa tolerancia en coberturas ni en firmas, que no se implementan aquí.

## Cadena local y errores conservados

Se aplicaron exclusivamente a `127.0.0.1:55432/snipers_dev`, después de backups verificados:

1. `003_snipers_phase3b2a`: delta inicial.
2. `004_snipers_phase3b2a_corrections`: funciones corregidas y endurecimiento.
3. `005_snipers_phase3b2a_finalization`: coherencia de fases/resultados durables.
4. `006_snipers_phase3b2a_retention`: extensiones monotónicas justificadas y fencing/reprogramación de limpieza.
5. `007_snipers_phase3b2a_cleanup_guard`: reclamaciones y heartbeats de limpieza bloquean el destino y comprueban `cleanupAfter` y `nextProbeAt` contra PostgreSQL.

Cada SQL canónico conserva una copia de igual SHA-256 y checksum Prisma en la cadena
ignorada. No se reescribieron migraciones ya aplicadas ni las fases `000`/`001`/`002`.
No hubo reset, resolve, `db push`, migración productiva ni reparación automática.

La auditoría encontró una contradicción en `004`: congelaba también `cleanupAfter`,
mientras el chequeo diferido podía exigir siete días a un candidato retirado por 24h.
Las pruebas añadidas reprodujeron el rechazo antes de `006`. El llamador debe confirmar
el estado terminal y todas las extensiones necesarias en la misma transacción; el
trigger no modifica automáticamente estados comerciales ni repara datos existentes.

Una prueba negativa posterior detectó que la generación del SQL `006` había omitido
la guarda de elegibilidad por una diferencia de indentación en el ancla del generador.
Se conservó `006` aplicado y se corrigió mediante `007`. Los logs
`retention-before-006-red.log` y `cleanup-eligibility-before-007-red.log` conservan
ambos fallos. También se conservan `corrections-fixture-red.log` (cast de enum ambiguo
en el fixture nuevo) y `post006-fixture-red.log` (el helper de claim no filtraba
`availableAt`; la guarda rechazó correctamente la petición prematura).

Las primeras pruebas encontraron una referencia SQL ambigua `o.id` y un rechazo de
lease por redondeo. Se corrigieron sólo funciones nuevas mediante `004`. Las siguientes
fallas de fixtures distinguían incorrectamente qué restricción debía dispararse primero:
se aislaron las FK para comprobar su SQLSTATE y se vaciaron eventos diferidos antes de
probar la prohibición explícita de TRUNCATE. No se debilitaron aserciones históricas.

Los logs rojos permanecen en `.local/snipers/phase3b2a/`. `005` evita confirmar por
separado un trabajo exitoso y una carga que siga en la fase anterior.

La baseline no contenía recursos de archivos. La compatibilidad no se infiere de esa
ausencia: se ejecuta el fixture histórico completo y el preflight canónico contra una
tabla temporal de sesión que reproduce un VERIFIED histórico incompatible; debe abortar
sin repararlo. No se altera para esa prueba ninguna tabla pública existente.

## Evidencia y preservación

El lanzador verifica servidor, privilegios, directorio de PostgreSQL, rama, HEAD y
checksums aplicados. Captura hashes de todos los archivos anteriores, incluyendo todos
los `.env*` y la modificación preexistente de `.vscode/settings.json`; sólo exceptúa los
tres archivos con cambios autorizados (Prisma, auditoría histórica y arnés 3A).
Verifica también que no aparezcan perfiles nuevos.

Los hijos usan credenciales externas vacías y el preloader local existente. Se conservan
el dump completo de estructura antes/después de cada acción y sus destinos de red.
Cada grupo que escribe tiene backup, SHA-256/manifiesto y TOC verificados. No se afirma
una restauración nueva. Los fixtures confirmados y sus eventos se conservan.

El manifiesto previo `.local/snipers/phase3b2a/final-verification.json` contrastaba **331
archivos protegidos**, siete respaldos referenciados por las comprobaciones finales,
hashes de fuentes y el esquema final. Registra staging vacío y puerto HTTP 3100 libre.
El SHA-256 de aquella estructura normalizada era
`d1afab0ab2f3b16fce2eb5ea3e84aeb2ec7e896b47a29ea16cfbd92b91e798fa`.
Se conserva sin sobrescribirlo. La revisión actual se registra separadamente en
`corrections-final-verification.json`, con los **330 archivos protegidos restantes**
y la única excepción adicional autorizada, el arnés 3A. `corrections-baseline.json`
conserva hashes previos a esta ronda y el backup/manifiesto verificado antes de editar SQL.

La evidencia de red alcanza a los procesos instrumentados, no a una captura global del
equipo. No se accedió a producción, R2, Zoom, pasarelas o SMTP. Los navegadores sólo usan
el entorno sintético con fuentes/banderas interceptadas por los arneses existentes.

## Inventario de entrega

Modificados:

- `prisma/schema.prisma`.
- `scripts/phase1/integration.test.ts`: únicamente la rama estricta de auditoría nueva.
- `scripts/phase3a/browser.cjs`: únicamente canonicalización con precisión idéntica.
- `scripts/phase3b1/browser.cjs`: búsqueda de encuentros usando los controles existentes de paginación, sin cambiar datos ni aserciones.
- `scripts/phase3b1/actions.test.cjs`: matriz ampliada para la lectura puntual editorial.
- `src/app/actions/snipers-content.ts`: acción de lectura editorial de encuentro por ID.
- `src/components/snipers/EditorialManagement.tsx`: revisión independiente del listado, con confirmación explícita y estados de consulta fallida.
- `src/lib/snipers/content.ts`: consulta puntual autorizada de encuentro.
- `src/lib/snipers/gateway.ts`: únicamente el enlace de esa nueva consulta editorial.

Nuevos:

- `prisma/snipers-review/phase3b2a.sql`.
- `prisma/snipers-review/phase3b2a-corrections.sql`.
- `prisma/snipers-review/phase3b2a-finalization.sql`.
- `prisma/snipers-review/phase3b2a-retention.sql`.
- `prisma/snipers-review/phase3b2a-cleanup-guard.sql`.
- `src/lib/snipers/file-contracts.ts`.
- `src/lib/snipers/file-receipts.ts`.
- `scripts/phase3b2a/cli.ts`.
- `scripts/phase3b2a/constraints.sql`.
- `scripts/phase3b2a/contracts.test.ts`.
- `scripts/phase3b2a/integration.test.ts`.
- `scripts/phase3b2a/README.md`.
- `docs/snipers-phase3b2a.md`.

No incluir `.local/`, `.env*`, respaldos ni configuración del editor en un eventual commit.

## Resultados de validación

| Comprobación | Resultado |
|---|---|
| Nueva fundación: contratos, SQL, recibos y concurrencia | **41/41**, sin fallidas/omitidas |
| Regresión Fases 0/1 | **40/40** |
| Regresión Fase 2 | **36/36** |
| Regresión 3A: servicios/acciones/correctivas | **37/37** |
| Regresión 3B-1: servicios/acciones/validación | **42/42**, incluye lectura por ID, error SQL real y todas las anteriores |
| Navegador 3B-1 | **23/23**, todos ejecutados, incluidos los tres casos negativos de lectura añadidos al escenario 16 |
| Navegador 3A | **24/24**, todos ejecutados, sin errores JavaScript inesperados |
| TypeScript | `--noEmit --incremental false`: aprobado |
| ESLint | Archivos afectados, `--max-warnings=0`: aprobado |
| Build aislado | Prisma generate + Next.js 16.2.6 Webpack: aprobado |
| Prisma validate / diff local | Aprobados; `No difference detected` |
| Archivos protegidos / cadena local | Hashes y checksums conservados |
| Git diff whitespace | Sin errores |

Las 41 comprobaciones nuevas incluyen cinco unitarias, 35 subpruebas de integración
y su contenedor Node. Se conserva la evidencia anterior de 153 comprobaciones de
servicios/acciones y 24/24 del navegador 3A. Tras corregir el defecto editorial se
repitió sólo la regresión afectada de 3B-1: pasó de 40 a 42 comprobaciones y completó
23/23 del navegador. No se presentan las suites ajenas como reejecutadas en esta ronda.

El fallo 3A anterior era `locator.fill: Malformed value` al llenar el datetime-local de fin de
cortesía con `2027-05-18T22:04:48.230`, generado por el fixture existente. No se modificaron
el helper de presentación ni las aserciones. La canonicalización autorizada del arnés
resolvió ese rechazo. Se conservan `browser3a-fixture-red.log`, el resultado original
y sus artefactos; ahora los 24 escenarios comerciales quedaron acreditados.

El navegador editorial se detuvo en `scripts/phase3b1/browser.cjs:56`, después de
crear `Encuentro b8eae189`, al buscar Publicar. SQL confirma DRAFT y posición **31**
en `ORDER BY startsAt DESC,id DESC`; la página usa límite **25**. La captura muestra
el enlace Siguiente y no contiene ese encuentro. El arnés no pagina antes de buscarlo.
Diez escenarios completaron, el undécimo comenzó y falló, doce no se ejecutaron:
trece quedan sin acreditar. `pageErrors` está vacío, lo que no convierte la suite
incompleta en aprobada. No se atribuye el timeout a los triggers de archivos.

Se conservan `browser3b1-pagination-red.log`, `.json`, `.png` y
`browser3b1-pagination-red-server.log`. El arnés 3B-1, la página y el servicio de
agenda conservaban sus hashes en aquella ejecución. No se borraron ni reordenaron
fixtures para hacer pasar la prueba.

La autorización posterior permitió cambiar sólo el código del arnés 3B-1. Ahora
localiza la referencia única mediante Anterior/Siguiente, comprueba que no haya
ciclos ni duplicados y falla si agota las páginas. Los logs confirman búsquedas
reales en dos páginas y offset 25. La comparación AST conserva las 66 llamadas
originales a assert y los 23 escenarios, en el mismo orden.

Se usó un lanzador de evidencia ignorado porque el CLI anterior considera protegido
el arnés. No se cambió su allowlist: el lanzador puntual comprueba las guardas
existentes, HEAD/rama, el único cambio de código permitido, hashes de las otras
fuentes, cadena SQL, esquema idéntico y backup/manifiesto antes de escribir fixtures.
No repite suites cuyas dependencias siguen intactas.

El primer intento nuevo aprobó el escenario 11 y falló esperando visibilidad de un
nav vacío en la agenda pública de una sola página. Se corrigió sólo la espera nueva
a estado attached. Se conservan `pagination-final-browser.log`, su evidencia y la
carpeta `pagination-attempt1/`.

El segundo intento aprobó 15 escenarios. En el 16 encontró el encuentro remoto en
posición **12**, pero el primer editor conservaba su formulario en offset **25**.
Tras el refresco, la página ya no entrega ese encuentro a MeetingForm. En
`EditorialManagement.tsx:43`, `changed=!!item&&!!base&&item.version!==base.version`
queda falso porque `item` es null (`meetings.find(...)??null`, línea 75). No aparece
el aviso de revisión remota y la aserción original de `browser.cjs:115` falla.
No es un encuentro imposible de localizar: la búsqueda lo encontró en la primera
página después del cambio de fecha. Es una limitación real del formulario cuando
una revisión remota desplaza el registro fuera de la página abierta.

Se conservaron `pagination-attempt2-browser.log`, su evidencia y la carpeta
`pagination-attempt2/`. Quince escenarios aprobaron, el 16 comenzó y falló y siete
no se ejecutaron: ocho quedaron sin acreditar en aquel intento. Entonces se mantuvo
intacto el componente y se solicitó autorización para corregir ese defecto concreto.

## Corrección autorizada de revisión remota de encuentros

No existía una consulta editorial por ID: `getMeetingJoin` exige acceso académico y
publicación, por lo que no sirve para revisar borradores privados. Se agregó
`getEditorialMeeting` con el mismo patrón de `getEditorialClass`: UUID estricto,
transacción existente, reautorización SNIPERS_CONTENT_EDITOR/SNIPERS_ADMIN y consulta
por PK de siete campos, incluido el Zoom privado sólo para el editor autorizado.
La fachada y `getSnipersEditorialMeeting` conservan flag, sesión y manejo de errores.
No se tocaron funciones comerciales ni reglas de ordenamiento/paginación.

MeetingForm conserva un ID independiente de los elementos del listado. Al abrirse,
recibir un refresco o reintentar una consulta, carga ese ID. Una respuesta no reemplaza
campos ni versión base: sólo ofrece la revisión para la confirmación existente.
El efecto descarta resultados de solicitudes invalidadas; la confirmación comprueba
ID/versión de la revisión ofrecida. Una respuesta ausente, denegada o fallida bloquea
guardado/carga y conserva el borrador. `item=null` nunca se usa como evidencia de
eliminación ni convierte un encuentro abierto en una creación nueva.

El navegador reprodujo el cambio de página: **offset 25 → posición 12, versión 4**.
Se verificaron aviso remoto, campos locales conservados, cancelación sin reemplazo,
confirmación conjunta de fecha/Zoom/título y envío posterior con expectedVersion 4.
Las aserciones originales permanecen; los 23 escenarios terminaron aprobados.

En el mismo escenario se agregó un fixture negativo independiente, creado sólo para
estas pruebas. Una interrupción real de la lectura HTTP conserva el borrador y no
ofrece una revisión; revocar el permiso del editor produce denegación real; borrar
exclusivamente aquel fixture por su UUID/título produce NOT_FOUND. En los tres casos
se comprobó guardado bloqueado y ausencia de Cargar revisión remota. Se restituyó el
permiso del usuario sintético en finally. No se eliminó ni reordenó historia existente.

La matriz de acciones prueba el nuevo export para anónimo, alumno, gestor y ADMIN
global, además de editor/supervisor, UUID ausente, entrada inválida, revocación y flag
deshabilitado. Se ejecutó con PostgreSQL y JWE reales mediante el arnés existente.

Además se probó un error SQL real con dos conexiones PostgreSQL independientes:
un bloqueo ACCESS EXCLUSIVE transaccional sobre SnipersMeeting y una conexión
de lectura con statement_timeout de 100ms produjeron SQLSTATE **57014**. `respond`
devolvió UNAVAILABLE sin revisión ni enlace privado. El bloqueo se liberó con
ROLLBACK y se cerró el pool temporal; no se modificaron datos ni permisos SQL.

Evidencia de esta corrección: `meeting-revision-services-2.log` (**42/42**),
`meeting-revision-browser-1.log` (**23/23** y tres negativos),
`meeting-revision-final-types-2.log`, `meeting-revision-final-lint-2.log` y
`meeting-revision-final-build.log`, todos aprobados. El build inicial fue necesario
para que Next start probara el componente nuevo; después del navegador se repitieron
TypeScript, ESLint y build aislado conforme a la autorización. No hubo otros defectos.
El agregado posterior fue únicamente la prueba CJS del error SQL: se repitieron la
suite afectada, TypeScript y ESLint; no se repitieron navegador/build porque sus
fuentes de aplicación y arnés no cambiaron. Se conserva también services-1 (41/41).
Los 113 archivos de evidencia anteriores y sus fallos se conservaron por hash.

El manifiesto de cierre `meeting-revision-final2-verification.json` registra fuentes,
inventario exacto de 22 archivos propuestos, backups, cadena local sin cambios y Git
sin staging. Se mantiene `SNIPERS_ENABLED=false`. **3B-2A queda lista para revisión
final y commit local autorizado por separado; no se creó commit ni se inició 3B-2B.**

Las carreras nuevas observan bloqueos reales y exigen `40001` en el competidor que
pierde; no aceptan deadlock como resultado esperado. Se comprueban después los commits,
estado final y ausencia de reactivación. El takeover usa el reloj PostgreSQL, comprueba
CAS de token obsoleto con cero filas y rechaza también modificar un candidato anterior.
No hay mocks que sustituyan esas carreras.

La prueba de rollback diferido deja insertar el recibo antes de intentar COMMIT; la
restricción real rechaza el conjunto y se comprueba que versión, trabajo y recibo no
quedaron confirmados. La prueba concurrente de UUID confirma una sola modificación.

## Correcciones focalizadas autorizadas tras auditoría

- Se conservan las aserciones anteriores. Se agregan tres transiciones desde un
  candidato retirado por 24h hacia rechazo/cancelación/fallo, comprobando COMMIT,
  marca original, plazo de siete días y ausencia de activación. SQL directo intenta
  acortar el plazo, mover `retiredAt` y extender sin justificación de política.
- La extensión y el claim compiten con conexiones independientes en ambos órdenes.
  Se observa espera real, se exige `40001`, se confirma el ganador y se reintenta
  cuando corresponde. Se comprueban WAIT_RETRY, programación futura, token eliminado,
  CAS obsoleto con cero filas y rechazo de claim aunque se adelante `availableAt`.
- El write skew enfrenta terminación de carga/trabajo con inserción de un candidato
  en otra fila. Ambas lecturas SQL completan antes de las escrituras: constituyen
  la barrera de snapshots. El competidor pierde por `40001`, sin confirmar su objeto.
- La unicidad de clave se prueba con una generación nueva y no repetida; la del
  productor se prueba con una clave nueva. Se exige el nombre exacto de cada índice.
- La barrera del recibo detiene el callback después de leer ausencia y permite a
  otra conexión confirmar el mismo UUID. El INSERT original recibe `23505` real:
  un wrapper sólo observa errores de `pg`, sin fabricarlos. Se exige exclusivamente
  ese código, una ejecución del callback, replay y un único evento. La carrera
  anterior entre dos llamadas completas al combinador también permanece.
- Dos editores con permiso Snipers vigente intentan reutilizar un UUID. El segundo
  recibe IDEMPOTENCY_CONFLICT sin ejecutar su callback; se conserva el actor original.
- ETag rechaza C0, DEL y C1 (`00–1f`, `7f–9f`) tanto en Zod como en SQL local. Se
  contrastan los 64 controles representables con `[[:cntrl:]]`; NUL se prueba aparte,
  pues PostgreSQL rechaza su representación JSONB con `22P05`. No cambió SQL de ETag.
- Sólo el arnés 3A canonicaliza los dos valores enviados a `fill`, usando un input
  HTML separado y comprobando igualdad de `valueAsNumber`. La reproducción aislada
  conserva exactamente `.230`, `.231`, `.000` y segundos cero. El helper de
  presentación, el componente y los servicios comerciales conservan sus hashes.

El fallo 3A anterior era preexistente: HTML normaliza `.230` a `.23` y Playwright
rechaza la diferencia textual aunque sea el mismo instante. Se conservan las mismas
aserciones; no se truncan segundos ni milisegundos.

## Costo histórico acotado

Un recurso sintético acumuló 1/10/50/100/200 generaciones de preparación con un destino
retirado por generación. Se tomaron siete muestras por nivel, sin build ni otros
fixtures simultáneos, de la función completa y del COMMIT de una actualización de
trabajo que dispara sus comprobaciones diferidas. Medianas de tiempo de pared, en ms:

| Objetos/generaciones | Comprobación completa | COMMIT diferido |
|---|---:|---:|
| 1 | 0,91 | 1,18 |
| 10 | 1,02 | 1,39 |
| 50 | 1,35 | 1,70 |
| 100 | 1,87 | 4,54 |
| 200 | 2,97 | 15,01 |

El recorrido de la función crece con el historial; su comportamiento observado es
compatible con O(n) por comprobación. La latencia de COMMIT creció más que la función
en los últimos niveles; esta medición no separa SSI, I/O ni planificación del host.
No se afirma linealidad del COMMIT ni un límite de capacidad. No se optimizó ni rediseñó.
Un lote que genera k eventos
diferidos puede repetir el recorrido k veces: no se acredita rendimiento ilimitado
ni costo constante de barridos masivos. Los tiempos incluyen PostgreSQL, transporte
local y planificación del host; no son un SLA.

`history-cost.json` conserva las muestras crudas. Una medición anterior durante el
build tuvo una mediana de COMMIT de 35,16 ms a 200 objetos: se conserva como
`history-cost-during-build.json`, junto a `test-during-build.log`, y motivó repetir
la medición aislada. No se descartan ni ocultan esos datos.

Archivos cambiados en esta ronda: este informe, `scripts/phase3b2a/README.md`,
`cli.ts`, `contracts.test.ts`, `integration.test.ts`,
`src/lib/snipers/file-contracts.ts` y únicamente la canonicalización de
`scripts/phase3a/browser.cjs`. Nuevos SQL: `phase3b2a-retention.sql` y
`phase3b2a-cleanup-guard.sql`. Prisma, recibos y la ampliación histórica de Fase 1
no recibieron nuevos cambios durante las correcciones.

## Límites de esta evidencia

Las pruebas usan filas y hashes sintéticos: comprueban integridad SQL, no la ejecución
de análisis ni lectura de archivos externos. Un propietario de la base que deshabilite
triggers o falsifique evidencias queda fuera del protocolo de aplicación.

El fencing SQL invalida autorización durable de limpieza y su programación. No
cancela por sí solo un DELETE remoto ya emitido ni recupera bytes eliminados; aún no
existe tal operación aquí. Las subfases posteriores deberán revalidar destino, plazo
y token conforme al protocolo remoto. Los clientes que ignoren el orden objeto →
trabajo pueden abortar por conflicto/deadlock; no se promete ausencia de abortos.

Permanecen pendientes y sin autorización 3B-2B–3B-2E, las garantías experimentales R2,
la longitud firmada real y toda operación productiva. No hay mecanismo remoto de limpieza
ni proceso que reclame los trabajos sintéticos persistidos.

Reproducción: [lanzador y límites](../scripts/phase3b2a/README.md).
Detenerse para auditoría independiente antes de autorizar cierre o nuevas subfases.

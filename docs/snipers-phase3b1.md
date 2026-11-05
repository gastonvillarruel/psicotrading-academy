# Grupo de Snipers — entrega de Fase 3B-1

Estado al **30/10/2026 (Argentina): implementada y corregida exclusivamente en local**.
La sección final registra las cuatro correcciones autorizadas después de la auditoría;
los resultados e inventario iniciales se conservan como historial de la entrega del 29/10.
Pendiente de auditoría independiente. Rama `feature/snipers-campus`, HEAD conservado
en `6d7d727edc40f5cfe47f598121e231c3bff823cf`. Sin stage, commit, push, merge ni deploy.

**3B-2 no iniciada.** No se implementaron R2, multipart, worker, antivirus, transporte
de archivos, emisión de URLs firmadas ni vinculación operativa de recursos.

## Funcionalidades implementadas

- Biblioteca privada de todas las clases publicadas, sin recortar por fecha de alta
  ni distinguir los tres niveles comerciales. Agrupación por mes/año de Argentina,
  filtros de categoría/año/mes, orden estable y paginación de 25 registros.
- Categorías: creación, nombre editable, identificador estable, archivado y restauración.
  Las categorías archivadas conservan sus clases y filtros históricos publicados;
  no se permiten nuevas asignaciones a ellas.
- Editor Tiptap 3.32.1, cargado sólo en la pantalla editorial: párrafos, encabezados
  2/3, negrita, cursiva, listas, citas, separadores, enlaces HTTPS y deshacer/rehacer.
- JSON de contenido validado por servidor: 512 KiB UTF-8, profundidad 20 y 10.000
  nodos como máximos. Lista cerrada de nodos, atributos y marcas; rechazo de marcas
  duplicadas y enlaces ejecutables. Lector React escapado, sin HTML arbitrario.
- Borradores, publicación, guardado explícito sobre publicada, retiro, archivado
  y restauración a borrador. Primera publicación conservada y previsualización local.
- Conflicto editorial conserva el texto local y permite comparar/cargar la versión
  actual con confirmación. No realiza rebase automático ni sobrescritura silenciosa.
- Agenda privada con borradores, edición, publicación, retiro, archivo y restauración.
  Inicio/fin UTC presentados en Argentina. URL Zoom validada por protocolo y hostname.
- Los listados académicos y su HTML no contienen el enlace privado Zoom. Una ruta
  específica reautoriza y redirige con `private, no-store` y `no-referrer`.
- Auditoría editorial paginada con actor, acción, revisión e instante; consulta
  autorizada del resultado de una operación propia para conciliación.
- Navegación integrada al campus y límite cliente ante cambio de identidad.

Los recursos se representan mediante `resources: []` en el contrato de clase.
No se crean recursos ficticios ni se presentan controles de carga al mentor.

## Autorización y concurrencia C4

Las nueve Server Actions nuevas llaman a la fachada `server-only`. El actor se
obtiene de NextAuth; no se acepta una identidad enviada por el navegador. Cada
consulta/acción valida su propio acceso y el flag del módulo.

Editor/supervisor administran contenido. Gestor conserva acceso al contenido publicado
por la autorización académica existente, sin obtener edición. El rol global `ADMIN`
no concede Snipers. El alumno necesita cobertura efectiva, sin suspensión ni baja.
No se modificaron reglas comerciales, autenticación global, cursos ni matrículas.

Los comandos utilizan UUID, entidad e intención canónica; las modificaciones de
registros existentes requieren versión esperada. La auditoría sirve como recibo
idempotente, separado de los comprobantes comerciales por contrato y tipo de evento.

Orden de bloqueo: usuario/concesiones → entidad editorial → categoría cuando cambia
su asignación. Los servicios reutilizan `SERIALIZABLE`, sus tres intentos máximos
y los helpers existentes. No hay transacciones anidadas ni consultas por un segundo
cliente dentro de una transacción.

- Guardar texto no recibe estado editorial ni vinculaciones de recursos.
- Publicar exige borrador; retirar exige publicada; restaurar exige archivada y
  devuelve borrador. Un registro archivado no puede guardarse como si siguiera editable.
- Se comprueba versión después de adquirir el bloqueo. Un reintento conserva exactamente
  la versión original; nunca la sustituye por la última para forzar aprobación.
- Cambio, incremento de versión y evento se confirman juntos. Un fallo de auditoría
  revierte el cambio completo. Un guardado sin cambio efectivo no incrementa versión.
- Replay devuelve el resultado histórico autorizado, sin reaplicar el cambio.
  La interfaz vuelve a consultar el registro actual; un recibo no republica contenido.
- El enlace Zoom se selecciona con bloqueo compartido de su encuentro publicado.
  Un retiro que confirma antes de adquirir ese bloqueo impide una nueva redirección.

La auditoría guarda hashes de título/cuerpo/nombre/Zoom, campos modificados, versiones
y metadatos permitidos. No guarda cuerpos, títulos en claro, enlaces privados,
tokens, claves R2 ni serializaciones indiscriminadas de comandos.

## Esquema y cadena local

El candidato `prisma/snipers-review/phase3b1.sql` añade exclusivamente:

- `version` en `SnipersClass`, `SnipersCategory` y `SnipersMeeting`.
- Tres restricciones de versión positiva y una de coherencia de publicación/archivado.
- `CLASS_CHANGED`, `CATEGORY_CHANGED` y `MEETING_CHANGED` al enum de auditoría.

No crea tablas, no modifica `SnipersResource` ni agrega estructuras de 3B-2. No contiene
DDL destructivo ni DML de corrección. El candidato se copió por hash a la cadena ignorada
como `002_snipers_phase3b1` y Prisma lo aplicó una vez a la base local.

La comparación completa de dumps antes de migrar y al terminar muestra únicamente
esas adiciones. No cambian tablas comerciales, FK previas, funciones/triggers, recursos
ni las 23 tablas anteriores del campus. El diff Prisma entre datasource local y esquema
declarado devuelve **No difference detected**. Los CHECK SQL adicionales se verifican
en el dump, pues Prisma no los representa íntegramente.

Las migraciones heredadas y el delta de Fase 1 están intactos. No hubo `db push`, reset,
resolve ni selección de la cadena experimental desde los flujos normales.

## Resultados de la entrega inicial (29/10)

| Comprobación | Resultado |
|---|---|
| Nuevas: unitarias, integración y acciones 3B-1 | **35/35**, 0 fallidas/omitidas |
| Navegador nuevo | **19/19**, 0 fallidos; errores JavaScript inesperados vacíos |
| Regresión Fases 0/1 | **40/40**, 0 fallidas/omitidas |
| Fase 2 | **36/36**, 0 fallidas/omitidas |
| Fase 3A servicios/acciones/correctivas | **37/37**, 0 fallidas/omitidas |
| Navegador anterior 3A | **24/24**, 0 fallidos |
| Total anterior preservado | **137/137** |
| TypeScript | `--noEmit --incremental false`: aprobado |
| ESLint de módulo/scripts afectados | `--max-warnings=0`: aprobado |
| Build aislado | Prisma generate + Next.js 16.2.6 Webpack: aprobado |
| Prisma validate y diff local | Aprobados; sin diferencias representables |
| Git diff whitespace | Sin errores |

El contador Node nuevo incluye dos contenedores: 17 subpruebas de integración,
11 de acciones, cinco unitarias y los dos contenedores. El navegador aporta 19
escenarios complementarios. No se quitaron ni debilitaron comprobaciones anteriores.

Las pruebas de acciones usan NextAuth/JWE, callbacks y PostgreSQL reales; sólo se
simulan el contexto de solicitud `next/headers` y el marcador `server-only` para Node.

Las cinco carreras con varias conexiones observan espera real en `pg_stat_activity`:
guardar/publicar en ambos órdenes, retirar/guardar en ambos órdenes y archivar frente
a restauración obsoleta. Se comprueban versión final, estado, rechazo `STALE` y ausencia
de deadlocks. También se prueba doble confirmación concurrente del mismo UUID.

El navegador utiliza login real por credenciales, `next start` compilado, Server Actions
HTTP y SQL. Incluye creación desde Tiptap, XSS como texto literal, publicación explícita,
respuesta perdida después del commit y replay sin duplicar versión, dos editores con
texto conservado, POST directo por gestor, agenda sin URL en HTML, redirect Zoom sin
seguirlo, retiro/replay, archivo/restauración, revocación y viewport de 390 px.

### Fallos encontrados y resueltos

- La prueba JWT inicial usaba una expiración de diez segundos, dentro de la tolerancia
  criptográfica del SDK. El fixture se fijó vencido una hora; no se cambió autenticación.
- Los selectores exactos detectaron etiquetas compuestas; se añadieron etiquetas ARIA
  explícitas. Una edición intermedia introdujo un carácter incorrecto por la codificación
  del pipe de PowerShell; se corrigió en los archivos de esta entrega.
- Crear una clase hacía `push` y `refresh` inmediatamente: el refresco podía cancelar
  la navegación aunque SQL ya hubiera confirmado. Ahora conserva el ID confirmado en
  pantalla y navega sin ese refresh concurrente. El escenario real pasó después del arreglo.
- El arnés responde localmente las banderas públicas heredadas, además de las fuentes;
  el resto de orígenes externos sigue bloqueado. No se modificó el flujo global del campus.

Se conservan resultados rojos y capturas locales de esos intentos. No quedan fallos
funcionales conocidos en las suites ejecutadas.

## Evidencia de aislamiento y preservación

- Antes de escrituras se verificaron rama, HEAD, estado Git, instancia, rol y perfil.
- Única base: `127.0.0.1:55432/snipers_dev`, rol limitado `snipers_local`.
- Backup inicial completo verificado: `local-2026-10-29T22-30-45-145Z-c26edcb0.dump`,
  451.796 bytes, SHA-256 `5ec1aeab9abf833285c698f003ee41d6d572923b023ebb2344419f6ad12901b2`.
  La baseline volvió a respaldar antes de registrar evidencia y cada suite que escribe
  ejecutó su backup mediante el lanzador. Formato/TOC, tamaño y SHA-256 se verifican;
  no se afirma una restauración nueva.
- `.env`, `.env.snipers.local` y `.vscode/settings.json` conservan sus hashes iniciales.
  La configuración persistente mantiene `SNIPERS_ENABLED=false`.
- Los núcleos comerciales, autorización previa, sesión y SQL de Fase 1 conservan hashes.
  El gateway sólo añade métodos. La única ampliación de una prueba anterior permite
  reconocer los nuevos contratos de auditoría, conservando todas las aserciones previas.
- Los procesos locales de prueba vacían credenciales externas. El preloader restringe
  TCP/TLS a loopback; las capturas del navegador interceptan otros orígenes. No se
  realizaron conexiones a producción ni operaciones sobre R2 o Zoom.
- La instrumentación acredita los procesos ejecutados, no una captura global del sistema.
  La descarga explícita de dependencias npm no forma parte de las pruebas aisladas.
- Los fixtures son sintéticos `.invalid`; se conserva su historial. Los servidores HTTP
  y navegadores de prueba se cerraron. PostgreSQL se mantiene como estaba al comenzar.

Artefactos ignorados para auditoría local:

- `.local/snipers/phase3b1-baseline.json`.
- `.local/snipers/phase3b1-final-verification.json` y su script local de comprobación.
- `.local/snipers/phase3b1-*-evidence.json` y `phase3b1-*-network.jsonl`.
- `.local/snipers/phase3b1-test.log`, `phase3b1-browser-results.json` y logs de checks.
- `.local/snipers/phase3b1-schema-{before,after}.sql` y `phase3b1-schema-diff.txt`.
- `.local/snipers/phase3b1-editor-desktop.png` y `phase3b1-library-mobile.png`.
- `.local/snipers/phase3b1-*-red.*`: resultados y capturas de fallos corregidos.
- Evidencias de regresión existentes `phase2-*` y `phase3a-*`, actualizadas por sus runners.
- Dumps y manifiestos en `backups/snipers-local/`.

## Inventario de la entrega inicial (29/10)

### Archivos existentes modificados: 8

1. `docs/PLAN-snipers.md` — enlace de continuidad a esta entrega.
2. `package.json` — tres dependencias Tiptap fijadas en 3.32.1; scripts conservados.
3. `package-lock.json` — resolución de Tiptap y sus dependencias.
4. `prisma/schema.prisma` — versiones y acciones editoriales aditivas.
5. `scripts/phase1/integration.test.ts` — contrato de auditoría editorial aditivo.
6. `src/app/mi-campus/snipers/layout.tsx` — navegación académica y límite de identidad.
7. `src/app/mi-campus/snipers/page.tsx` — accesos reales a biblioteca y agenda.
8. `src/lib/snipers/gateway.ts` — métodos editoriales/académicos nuevos.

### Archivos nuevos: 26

1. `docs/snipers-phase3b1.md`.
2. `prisma/snipers-review/phase3b1.sql`.
3. `scripts/phase3b1/README.md`.
4. `scripts/phase3b1/cli.ts`.
5. `scripts/phase3b1/unit.test.ts`.
6. `scripts/phase3b1/integration.test.ts`.
7. `scripts/phase3b1/actions.test.cjs`.
8. `scripts/phase3b1/browser.cjs`.
9. `src/lib/snipers/content-document.ts`.
10. `src/lib/snipers/content-contracts.ts`.
11. `src/lib/snipers/content.ts`.
12. `src/app/actions/snipers-content.ts`.
13. `src/app/mi-campus/snipers/biblioteca/page.tsx`.
14. `src/app/mi-campus/snipers/biblioteca/[id]/page.tsx`.
15. `src/app/mi-campus/snipers/agenda/page.tsx`.
16. `src/app/mi-campus/snipers/agenda/[id]/acceso/route.ts`.
17. `src/app/mi-campus/snipers/gestion/contenido/page.tsx`.
18. `src/app/mi-campus/snipers/gestion/contenido/clases/nueva/page.tsx`.
19. `src/app/mi-campus/snipers/gestion/contenido/clases/[id]/page.tsx`.
20. `src/components/snipers/ClassEditor.tsx`.
21. `src/components/snipers/ContentBody.tsx`.
22. `src/components/snipers/ContentSessionBoundary.tsx`.
23. `src/components/snipers/EditorialManagement.tsx`.
24. `src/components/snipers/LibraryList.tsx`.
25. `src/components/snipers/RichTextEditor.tsx`.
26. `src/components/snipers/useEditorialCommand.ts`.

La modificación previa de `.vscode/settings.json` queda fuera del inventario de Snipers
y se preservó byte por byte. No incluir `.local/`, backups, perfiles o secretos en Git.

## Límites y revisión pendiente

- Sólo Edge headless en este entorno; no otros motores ni dispositivos físicos.
- Build Webpack con fuentes de prueba; no acredita Turbopack ni fuentes remotas reales.
- Sin OAuth real, visitas a Zoom, carga a escala ni evaluación de infraestructura productiva.
- Sin autosave, revisiones restaurables ni borrador paralelo de una clase publicada.
  El texto no guardado se pierde al cerrar/reemplazar la pantalla. Un envío incierto
  conserva su comando exacto sólo en memoria; los guardados confirmados y recibos
  permanecen en PostgreSQL. La ausencia de recibo no demuestra rollback.
- Una lectura o redirección ya autorizada puede concluir; no se retiran copias del
  contenido previamente recibido ni enlaces Zoom que el usuario ya conoció.
- Búsquedas/auditoría conservan las limitaciones de índices de las fases anteriores;
  no se agregaron índices o infraestructura comercial fuera del alcance.
- La cadena local no es una migración productiva aprobada. Su compatibilidad con el
  historial/proveedor productivo continúa pendiente de una fase autorizada posterior.
- R2, MP3/PDF, recursos vinculados, antivirus, worker y sus invariantes C1/C2/C3 quedan
  íntegramente en 3B-2. No se afirma que estén implementados o probados.

Reproducción: [lanzador y requisitos](../scripts/phase3b1/README.md).
Detenerse aquí para auditoría independiente; no iniciar 3B-2 ni crear commit.

## Correcciones focalizadas autorizadas — 30/10/2026

Se corrigieron exclusivamente los tres defectos confirmados y la separación entre
autorización académica y lectura privada. Sin migraciones, cambios del esquema,
alteraciones de reglas comerciales, stage, commit, push, merge, deploy ni Fase 3B-2.

### Cambios y contratos

1. **Categorías y encuentros:** cada formulario conserva su registro base en estado,
   separado de las props remotas; todos sus envíos usan esa versión base. Un refresco
   que trae otra revisión conserva los campos locales y bloquea el nuevo guardado.
   `ConfirmModal` permite conservarlos o aceptar el reemplazo de campos y versión
   juntos. La revisión ofrecida queda fijada mientras se confirma; otra revisión
   posterior vuelve a requerir revisión. No hay rebase silencioso.
2. **Clases/Tiptap:** una sola función reemplaza registro, campos, documento y
   `editorKey`. Una recarga posterior al comando sólo aplica automáticamente la
   revisión que coincide con su recibo. Si ya existe otra revisión, conserva el
   documento local y ofrece comparación/carga con confirmación. Aceptarla reinicia
   Tiptap con la misma revisión usada por la vista previa y el siguiente guardado.
   Los conflictos siguen conservando también el cuerpo sin guardar. Sin autosave.
3. **Slug duplicado:** sólo la restricción `SnipersCategory_slug_key` al crear una
   categoría produce `DUPLICATE_SLUG`, tras intentar conciliar el recibo. La acción
   devuelve un mensaje corregible y el hook descarta ese sobre rechazado; el siguiente
   envío genera otro UUID. Replay concurrente del mismo UUID conserva su resultado;
   una intención distinta bajo un UUID confirmado sigue siendo `IDEMPOTENCY_CONFLICT`.
   Los resultados verdaderamente inciertos conservan exactamente su sobre original.
4. **Lectura académica:** `queries.ts` extrae las reglas existentes a
   `getAcademicAccessInTransaction`, sin cambiar su lógica. Biblioteca, clase,
   categorías, agenda y acceso Zoom autorizan y leen con el mismo `PoolClient` y la
   misma transacción serializable. Orden: usuario → concesiones/membresía → contenido;
   Zoom conserva además su bloqueo compartido del encuentro publicado. Una revocación
   posterior a la autorización espera hasta completar la lectura; si confirma antes
   de adquirir los locks de autorización, la lectura deniega, también tras un reintento
   por instantánea antigua. No hay transacciones anidadas ni conexiones remotas dentro
   de ellas. La ruta Zoom conserva sus headers y contrato; no necesitó editarse.

La extracción académica es el único cambio de `queries.ts`. `operations.ts`,
`commercial.ts`, permisos, sesión y previsualización conservan los hashes originales.
El lanzador mantiene la baseline histórica intacta y registra ambos hashes de
`queries.ts`; durante cada comprobación exige conservar el hash actual. Las demás
guardas de la baseline y todas las aserciones anteriores se mantienen.

### Verificación ejecutada después de corregir

| Comprobación | Resultado |
|---|---|
| 3B-1: servicios, acciones y validación | **40/40**, sin fallidas/omitidas |
| 3B-1: navegador real | **23/23**, sin errores JavaScript inesperados |
| Fases 0/1 | **40/40**, sin fallidas/omitidas |
| Fase 2 | **36/36**, sin fallidas/omitidas |
| 3A: servicios, acciones y correctivas | **37/37**, sin fallidas/omitidas |
| 3A: navegador | **24/24** |
| TypeScript | `--noEmit --incremental false`: aprobado |
| ESLint | Módulo y scripts afectados, `--max-warnings=0`: aprobado |
| Build aislado | Prisma generate + Next.js 16.2.6 Webpack: aprobado |
| Prisma validate / diff local | Aprobados, `No difference detected` |

Las pruebas nuevas cubren refresco real de categorías y encuentros por un segundo
editor, conservación/cancelación/carga de revisiones, versión del envío siguiente,
respuesta de recarga de clase que obtiene un cuerpo posterior al recibo, concordancia
de Tiptap/vista previa/formulario/versión, slug repetido con corrección y UUID nuevo,
replay concurrente de creación y rechazo de intención distinta bajo UUID confirmado.

La concurrencia académica usa conexiones independientes, barreras explícitas y espera
de lock observada en `pg_stat_activity`. Comprueba los cinco servicios de lectura,
una suspensión entre autorización y selección privada, revocación de concesión para
Zoom y revocación confirmada durante una espera previa a la autorización. Conserva
el contrato de terminar una lectura ya autorizada y deniega la solicitud siguiente.
Las regresiones anteriores vuelven a comprobar vencimiento durante bloqueo/reintento,
publicación, retiro, archivo/restauración y acceso Zoom sin seguir el redirect.

Dos intentos de navegador quedaron registrados: uno comenzó antes de que terminara
el build y se detuvo por falta de `BUILD_ID`; el otro detectó un formato de fecha del
fixture no aceptado por `fill`. Se corrigió el fixture a precisión de minutos y el
navegador completo pasó posteriormente. No se debilitaron aserciones ni se modificó
el comportamiento de fechas de la aplicación. Los logs/captura rojos se conservan.

### Archivos tocados por esta corrección: 14

- `src/components/snipers/EditorialManagement.tsx`.
- `src/components/snipers/ClassEditor.tsx`.
- `src/components/snipers/RichTextEditor.tsx` — documenta la propiedad del documento y su reinicio.
- `src/components/snipers/useEditorialCommand.ts`.
- `src/lib/snipers/content.ts`.
- `src/lib/snipers/queries.ts` — extracción académica exclusivamente.
- `src/lib/snipers/errors.ts`.
- `src/lib/snipers/action-result.ts`.
- `scripts/phase3b1/integration.test.ts`.
- `scripts/phase3b1/actions.test.cjs`.
- `scripts/phase3b1/browser.cjs`.
- `scripts/phase3b1/cli.ts`.
- `scripts/phase3b1/README.md`.
- `docs/snipers-phase3b1.md`.

Los cambios previos de Fase 3B-1 permanecen pendientes y fuera de stage. El cambio
preexistente de `.vscode/settings.json` y todos los `.env*` se preservaron por hash.
El perfil persistente mantiene `SNIPERS_ENABLED=false`; sólo los procesos hijos de
prueba habilitan el módulo. Cada suite que escribe ejecutó previamente su backup.

Evidencia adicional ignorada: `.local/snipers/phase3b1-corrections-protected.json`,
`phase3b1-corrections-final-verification.json`, `corrections-*.log`, sus trazas y los
artefactos `corrections-browser-*-red.*`/`corrections-browser-not-ready*`. Se conservan
los manifiestos y dumps en `backups/snipers-local/`. El wrapper local de regresión
añade el preloader de red existente a Fases 0/1 y 2, sin cambiar sus lanzadores.

Límites: Edge headless, fuentes/banderas de prueba locales y red instrumentada de los
procesos de prueba; no captura global del equipo. No se visitó Zoom ni se probó OAuth
externo, infraestructura productiva o migración productiva. Persisten los límites
documentados de ausencia de autosave, sobres pendientes sólo en memoria y alcance
exclusivamente editorial de 3B-1.

La regresión de navegador 3A conserva su arnés previo: intercepta y aborta solicitudes
de imágenes heredadas a `flagcdn.com` y `assets.coingecko.com` antes de conectar. Esas
solicitudes bloqueadas se registran en la evidencia; no se contabilizan como conexiones
externas realizadas ni se modificó el arnés anterior para ocultarlas.

Detenerse para revisión independiente antes del commit.

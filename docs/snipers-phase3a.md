# Grupo de Snipers — entrega de Fase 3A

Estado al **29/10/2026 (Argentina): correcciones focalizadas de auditoría, exclusivamente en local**.
Pendiente de revisión del usuario y autorización de commit. Rama
`feature/snipers-campus`, HEAD `475b677`. No se inició Fase 3B.

## Funcionalidades

- Tarjeta de entrada al módulo en el campus sin crear cursos, compras o matrículas.
- Mi membresía: estado administrativo, cobertura actual, futuras confirmadas y próxima
  renovación. Consulta ligada exclusivamente a la identidad autenticada, incluso sin cobertura.
- Listado paginado de membresías, filtro administrativo y búsqueda por correo.
  La búsqueda de usuarios devuelve únicamente id, nombre, correo, membresía y estado.
- Alta sin cobertura implícita; ficha con pagos/renovaciones de uno a tres períodos,
  importes excepcionales, cortesías y reemplazos, cambio de próxima renovación,
  suspensión/reactivación, baja/reapertura, anulaciones y reemplazos de comprobantes.
- Historial paginado de pagos, coberturas y auditoría comercial; etiquetas legibles
  de operadores, sin payload crudo de auditoría o identificadores de sesión.
- Supervisión de los tres planes existentes, con versión esperada y auditoría atómica;
  consulta, concesión y revocación de permisos reutilizando Fase 1, más historial
  paginado de cambios de catálogo y permisos reservado al supervisor.
- Confirmaciones con `ConfirmModal`, USD en centavos y fechas en hora de Argentina.
  La ficha recarga membresía e historial antes de permitir otra operación.

Los comandos comerciales delegan en Fase 2. No se modificaron `operations.ts`,
`queries.ts`, `contracts.ts`, `permissions.ts`, `preview.ts`, `session.ts` o `server.ts`.
El gateway únicamente recibe métodos adicionales. No hay cambios de Prisma,
restricciones SQL, migraciones o dependencias de aplicación.

## Autorización y recuperación

Las 23 Server Actions públicas llaman por separado a la fachada `server-only`;
no confían en el layout, proxy o permisos visuales. El actor proviene de NextAuth,
con comparación de sesión/permisos en transacción y sin conceder privilegios por roles globales.

Gestor/supervisor: búsqueda, datos comerciales, planes asignables y operaciones.
Supervisor: catálogo, concesiones ajenas y auditoría de supervisión. Editor:
sin acceso comercial o de supervisión. Cualquier sesión válida puede consultar
exclusivamente su propia membresía/capacidades. No hay acciones editoriales de 3B.

El navegador conserva para los comandos de la ficha el sobre necesario para repetir
el envío y, por separado, una señal estricta con sólo actor, membresía y UUID original.
Antes de enviar deben persistirse ambos registros. Una respuesta incierta conserva
el envío exacto. `FORBIDDEN`, `SESSION`, `DISABLED`, `CONFIGURATION` e
`IDEMPOTENCY_CONFLICT` no prueban que
el primer envío haya fallado: se quitan datos privados y se conserva la señal.
La ficha oculta sus datos al detectar pérdida de acceso; para `SESSION` termina el
logout antes de presentar el login nuevo. No cambia la autenticación central.

Logout y cambios de identidad depuran sobres privados desde el proveedor global;
el botón Salir también los depura antes de invalidar la sesión. La caducidad del
sobre a las 24 horas se aplica al revisar el almacenamiento, con revisión adicional
cada minuto mientras el proveedor está montado. No es borrado automático garantizado
en una pestaña suspendida. La señal mínima no caduca por tiempo: quitar el sobre
no demuestra rollback. No contiene importes, referencias, motivos ni propuestas.

Sin sobre, la ficha bloquea nuevas operaciones hasta conciliar el UUID original.
La nueva consulta valida sesión y permiso comercial dentro de una transacción y
consulta únicamente un recibo del mismo actor y membresía. No expone el payload ni
crea operaciones. Sólo un recibo confirmado y la recarga autorizada de la ficha
permiten eliminar la señal. La ausencia de recibo mantiene el bloqueo; no se
interpreta como rechazo, pues podría existir un envío en curso. El alta mantiene
su UUID y la unicidad de membresía de Fase 2 como antes.

No se agrega vencimiento a las propuestas de Fase 2. Perder/cerrar la pestaña o
el almacenamiento puede impedir la recuperación local; consultar historial antes
de registrar otro cobro. Las confirmaciones se recuperan desde el recibo existente,
pero la ficha siempre vuelve a consultar el estado actual.

Las páginas son dinámicas. Los datos privados no se ponen en caché compartida.
El `ADMIN` global sin concesión Snipers es rechazado también por acceso directo.

## Verificaciones ejecutadas

| Comprobación final | Resultado |
|---|---|
| Fase 2, `scripts/phase2/cli.ts test` | **36/36**, 0 fallidas/omitidas |
| Regresión Fases 0/1, `scripts/phase2/cli.ts regression` | **40/40**, 0 fallidas/omitidas |
| Fase 3A, `scripts/phase3a/cli.ts test` | **37/37**: 23 originales + 14 correctivas, 0 fallidas/omitidas |
| Navegador, `scripts/phase3a/cli.ts browser` | **24/24**: 16 originales + 8 correctivos, 0 fallidos; sin errores JavaScript inesperados |
| TypeScript | `--noEmit --incremental false`: aprobado |
| ESLint del módulo y scripts | `--max-warnings=0`: aprobado |
| ESLint adicional de Navbar/Providers | 0 errores; 1 advertencia heredada del logo `<img>` |
| Build aislado | Prisma generate + Next.js 16.2.6 **Webpack**: aprobado |
| Preservación | Hashes protegidos y dump completo de estructura SQL idénticos antes/después |

El contador Node de 3A incluye 21 subpruebas de acciones, su contenedor, cinco
unitarias originales y diez correctivas. La matriz comprueba que **cada export de acciones** está contemplado,
con NextAuth/JWE/callbacks y PostgreSQL reales; sólo simula contexto de solicitud
`next/headers` y el marcador `server-only`.

Las pruebas cubren todas las consultas/acciones por permiso; rol global sin concesión;
consulta propia sin elección de otro usuario; pagos completos, descuentos, cortesías,
reemplazos y estados; doble confirmación y renovaciones simultáneas; recibos históricos;
conflicto de versión de catálogo, rollback por fallo de auditoría; revocación y sesión
sustituida; módulo deshabilitado; aislamiento/depuración de almacenamiento; centavos,
fronteras de fecha y rechazo TCP/TLS externo del arnés. Las 76 pruebas previas
conservan sus aserciones y carreras originales.

Edge headless ejecuta login real por credenciales sobre `next start` compilado,
Server Actions HTTP y SQL. Sus 16 escenarios originales incluyen el ciclo comercial completo,
respuesta perdida **después del commit**, recarga/reintento sin pago duplicado,
reemplazos, consulta del alumno suspendido, acceso directo anónimo/editor/ADMIN,
repetición directa de una acción comercial con sesión de alumno, catálogo desde
un supervisor `STUDENT`, concesión/revocación y vista de 390 px sin desbordamiento.

Los seis escenarios correctivos iniciales agregan commit con respuesta perdida seguido de
revocación de permiso y de sesión (dos escenarios), cambio gestor → logout → alumno
→ gestor en la misma pestaña, recibo ausente que mantiene el bloqueo, conservación
del plan de cortesías en los tres niveles con elección explícita ante inactividad,
y visualización de los cinco campos del catálogo. Las pruebas de acciones incluyen
conciliación ajena/no existente, permisos de la nueva consulta, replay sin duplicar,
plan inactivo y comparación de cada valor anterior/posterior del catálogo.
Los dos últimos escenarios verifican cambio de cuenta entre pestañas con sesión
cliente rezagada y descarte de un rechazo `STALE` definitivo. En el primero sólo
se fija la respuesta de `/api/auth/session` de la pestaña A para sostener el rezago:
el login B, el conflicto, la consulta denegada del recibo, la conciliación A y SQL
son reales. Las pruebas aisladas del manejador simulan hooks/acciones y comprueban
14 códigos de error; complementan el navegador, sin sustituirlo.

## Aislamiento y evidencia

- Única base: `127.0.0.1:55432/snipers_dev`, rol limitado `snipers_local`, identidad
  y privilegios comprobados por las guardas existentes antes de ejecutar.
- `.env` y `.env.snipers.local` conservan sus hashes. La configuración persistente
  mantiene `SNIPERS_ENABLED=false`; sólo los procesos locales de prueba habilitan el módulo.
- `runnerEnv` vacía credenciales externas y evita que Next/dotenv las repueble.
  El preloader rechaza conexiones TCP/TLS fuera de loopback. Las últimas evidencias
  de servicios/build registran únicamente `127.0.0.1:55432`; navegador agrega
  `127.0.0.1:3100`. Los cuatro rechazos del test son probes deliberados a `.invalid`.
- El navegador bloquea otros orígenes; responde localmente el CSS público de Google
  Fonts y fija la preferencia regional AR. No utiliza servicios productivos.
- Cada suite que escribe ejecutó previamente `npm run db:backup -- --env-file
  .env.snipers.local`, con verificación del archivo/manifiesto antes de continuar.
  No se afirma una restauración nueva.
- Fixtures `.invalid` y auditoría permanecen en local; la concesión temporal de
  supervisor de navegador se revoca al terminar. No se borró historial.
- El servidor HTTP y los contextos de navegador se detuvieron. PostgreSQL se conserva
  iniciado como estaba al comenzar. No hubo push, merge, deploy o commit.

Artefactos ignorados:

- `.local/snipers/phase2-test.tap` y `phase2-regression.tap`: suites base.
- `.local/snipers/phase3a-test.log`: 37 comprobaciones (23 originales y 14 correctivas).
- `.local/snipers/phase3a-browser-results.json`: 24 escenarios y errores JS vacíos.
- `.local/snipers/phase3a-{test,build,browser,typecheck,lint}-evidence.json`:
  hashes, destino, flag persistente y resumen de conexiones por ejecución.
- `.local/snipers/phase3a-*-network.jsonl`: destino/puerto, sin credenciales.
- `.local/snipers/phase3a-member-desktop.png` y `phase3a-member-mobile.png`: capturas.
- `backups/snipers-local/`: dumps y manifiestos verificados. Último previo al navegador:
  `local-2026-10-29T21-09-57-667Z-677f88fb.dump`.
- La corrección inicial del 28/10 verificó siete respaldos. La última corrección
  del 29/10 ejecutó cuatro backups antes de las suites con escrituras, todos con
  tamaño y SHA-256 comprobados, además de formato/TOC del procedimiento de backup.
- `phase3a-browser-cim-rejected-{evidence,results}.json` y
  `phase3a-browser-session-retry-{evidence,results}.json`: ejecuciones fallidas previas
  a los ajustes; no se presentan como aprobadas.

La traza es de los procesos instrumentados, no una captura de tráfico de todo el sistema.

El arnés rechaza el puerto ocupado antes de crear fixtures o iniciar Next. Espera
el anuncio Ready del hijo y verifica mediante `netstat.exe` que el listener exacto
`127.0.0.1:3100` pertenece a su PID antes de hacer requests HTTP. Aborta si el hijo
falla o sale; cierra el navegador y espera `close` del servidor, con terminación
forzada como último recurso. No se añadió endpoint de diagnóstico ni se relajó
la guarda de red. La comprobación de propietario está limitada a Windows.

## Defectos detectados y correcciones

Último bloqueante: el cliente descartaba `IDEMPOTENCY_CONFLICT` como rechazo
definitivo, aunque también significa que el recibo pertenece a otro actor. Ahora
retira el sobre privado y conserva actor, membresía y UUID originales, sin copiar
la intención al actor nuevo. La pantalla muestra revisión autorizada y permite
volver al listado; no invalida la sesión del otro gestor ni crea bloqueos globales.

El descarte automático usa una lista explícita de rechazos comerciales posteriores
a la búsqueda autorizada del recibo en Fase 2: `NOT_FOUND`, `STALE`, `OVERLAP`,
`DUPLICATE_REFERENCE` e `INVALID_STATE`. `VALIDATION` puede producirse antes de esa
búsqueda e `INTEGRITY` también puede indicar un recibo inconsistente: ambos conservan
el intento y requieren reintento o revisión. Los errores desconocidos tampoco lo
descartan. No se modificaron los servicios de Fase 2 ni el protocolo de recuperación.

La nueva regresión de navegador comparte cookies entre dos pestañas: A confirma
un pago sin referencia y pierde la respuesta; B inicia sesión mientras se devuelve
deliberadamente la sesión cliente anterior a la pestaña A. El reintento recibe un
conflicto real por HTTP, elimina los datos privados y conserva exactamente la señal
de A. B recibe `confirmed:false` al consultar ese recibo; puede navegar y gestionar
sin heredar la señal. A vuelve a ingresar, concilia y mantiene un único pago. Otra
regresión cambia la versión antes de confirmar y comprueba que `STALE` libera la
ficha sin registrar un pago. El manejador real también se ejecuta aisladamente
frente a 14 códigos de error para comprobar conservación y descarte.

Correcciones de los cinco hallazgos de auditoría:

- Recuperación: separar sobre privado y señal mínima; conciliar el recibo existente
  con autorización vigente, sin modificar idempotencia ni servicios de Fase 2.
- Cortesías: el historial proyecta `planId` y el editor lo conserva en los tres
  niveles. Un plan original inactivo se muestra y bloquea la revisión hasta elegir
  expresamente otro activo, conforme al rechazo existente del servicio de Fase 2.
- Privacidad: limpieza global por sesión/identidad y al salir, conservando sólo la
  señal mínima. Una ficha sin permisos deja de mostrar información comercial.
- Aislamiento: puerto libre, disponibilidad del hijo, propietario real del listener
  y cierre esperado. CIM fue rechazado por Windows durante la primera validación;
  se reemplazó por lectura de `netstat`, sin elevar privilegios.
- Catálogo: la auditoría muestra sólo los cambios reales de nombre, precio,
  duración, activo y orden, derivados del payload existente; sin payload crudo.

Una prueba de sesión revocada detectó una carrera entre el refresco con cookie
anterior y el nuevo login. Se corrigió el límite de UI para finalizar primero el
logout. Se conservan los resultados fallidos previos en los artefactos locales.

- El helper heredado de fecha local puede producir un minuto sin cero inicial:
  `21:2` es inválido para `datetime-local`. La regresión nueva falló antes de
  corregir el adaptador de presentación Snipers; el helper global no se modificó.
- La edición de cortesías podía perder segundos/milisegundos y alterar una frontera.
  La representación de entrada y su conversión conservan ahora la precisión completa.
- Diferencias de espacios Unicode de Intl entre Node y Edge causaban hidratación
  incorrecta. Las fechas visibles se construyen con partes explícitas y los espacios
  monetarios se normalizan; el navegador final no informa errores de hidratación.
- Una nueva acción podía abrirse con versión o historial aún antiguos tras confirmar.
  La ficha espera ambas lecturas antes de habilitar operaciones; no se cambió Fase 2.
- Las rutas anidadas mostraban la cabecera pública mientras la raíz Snipers la ocultaba.
  Se unificó la visibilidad para todo el módulo.
- El arnés nuevo requirió corregir sintaxis JSX, escapado de paths Windows,
  preparación de storage en documentos opacos y argumentos ya normalizados de
  `Socket.connect`. La regresión de red falló antes de corregir la guarda y luego aprobó.

Se conservaron evidencias rojas de fechas/red en `.local/snipers/`. Ninguna prueba
de negocio/seguridad se quitó o debilitó para aprobar. No se demostró un defecto
en la lógica comercial de Fase 2 ni se la modificó.

## Inventario

### Archivos nuevos (27)

- `docs/snipers-phase3a.md`.
- `scripts/phase3a/README.md`, `cli.ts`, `network-guard.cjs`, `font-responses.cjs`,
  `unit.test.ts`, `actions.test.cjs`, `browser.cjs`, `corrections.test.cjs`, `server.cjs`.
- `src/app/actions/snipers.ts`.
- `src/app/mi-campus/snipers/layout.tsx`, `page.tsx`, `gestion/alumnos/page.tsx`,
  `gestion/alumnos/[id]/page.tsx`, `gestion/supervision/page.tsx`.
- `src/components/snipers/ui.tsx`, `MemberList.tsx`, `MemberDetail.tsx`,
  `CommercialOperation.tsx`, `Supervision.tsx`, `SessionCleanup.tsx`.
- `src/lib/snipers/commercial.ts`, `action-result.ts`, `page-data.ts`,
  `pending-intent.ts`, `presentation.ts`.

### Archivos existentes modificados (7)

- `src/lib/snipers/gateway.ts`: métodos adicionales, sin cambiar operaciones previas.
- `src/app/mi-campus/page.tsx`: tarjeta Snipers independiente de cursos/matrículas.
- `src/components/ClientChromeVisibility.tsx`: navegación uniforme del módulo.
- `scripts/phase1/integration.test.ts`: contrato estricto de auditoría `PLAN_CHANGED`,
  manteniendo comprobaciones de inmutabilidad y ausencia de secretos.
- `docs/PLAN-snipers.md`: enlace de continuidad a esta entrega.
- `src/components/Navbar.tsx`: depuración de sobres privados antes del logout.
- `src/components/Providers.tsx`: observador de sesión para depuración de identidad.

## Límites y estado de Git

El build y navegador se validaron con Webpack y fuentes locales de prueba;
no acreditan Turbopack ni la descarga real de fuentes. Playwright está instalado
en `.local/snipers/browser-tools`, sin cambiar dependencias de aplicación. Se probó
Edge headless y viewport móvil, no otros motores ni dispositivos físicos.

No hubo prueba de OAuth, pagos externos, infraestructura productiva o carga a escala.
Las búsquedas parciales y auditoría conservan las limitaciones de índices ya conocidas.
La recuperación local es de la pestaña, no un respaldo de comprobantes del cobro real.
Si desaparece el sobre y no existe recibo, no hay desbloqueo automático: se requiere
investigar el resultado. Si se pierde la pestaña o se borra su almacenamiento,
también se pierde la señal. No se agrega deduplicación entre pestañas/gestores ni
un registro persistente nuevo; siguen vigentes los contratos de Fase 2.

El lint adicional de `Navbar` conserva una advertencia heredada por el `<img>` del
logo, sin errores. El cambio previo del usuario en `.vscode/settings.json` no fue
modificado y queda fuera del inventario de Snipers.

Fase 3B, R2, editor, publicación académica y recursos privados quedan pendientes y
sin autorización de implementación. Compatibilidad/migraciones productivas continúan
fuera de esta validación. No hay autorización implícita para habilitar producción.

HEAD permanece en `475b677`; archivos de esta entrega sin stage ni commit final.
No incluir `.local/`, perfiles, secretos, respaldos o credenciales en un futuro commit.

Ejecución reproducible: [lanzador y requisitos](../scripts/phase3a/README.md).

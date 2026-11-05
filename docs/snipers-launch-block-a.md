# Snipers — Bloque A: preparación local para auditoría

Fecha: 01/11/2026, Argentina. Base: `feature/snipers-campus`,
`f7214174e62493aff41c32f76a880256af4898a3`.

Este bloque prepara artefactos. No autoriza producción, migraciones remotas, R2,
VPS, push, merge, deploy, commit ni inicio del Bloque B. Todas las banderas
persistentes permanecen desactivadas. No se modifican contratos comerciales,
roles generales, SQL históricos, perfiles existentes ni `.vscode/settings.json`.

## Archivos y alcance

Modificados:

- `.gitattributes`: LF únicamente para la migración nueva; evita cambios de checksum entre checkouts.
- `scripts/backup.ts`: conserva la API y el modo local; agrega respaldo explícitamente autorizado de `public`, directorio privado y manifiesto de alcance limitado.
- `src/lib/snipers/upload-storage.ts`: selección cerrada test/staging/production; conserva contratos y entrada exclusiva `r2TestConfig`.
- `config/snipers-uploads.env.example`: grupos separados, vacíos y banderas false.
- `config/snipers-upload-processor.service`: StateDirectory privado; no instalación ni certificación del aislamiento Linux.
- `package.json`, `package-lock.json`: sólo metadatos Node 22.x, después de comprobar el build del campus bajo Node 22.14.0. Sin actualizaciones de paquetes.

Creados:

- `prisma/migrations/20261031000000_snipers_launch/migration.sql`.
- `scripts/snipers-launch/prepare.ts`: ensamblado offline, determinista y sin sobrescritura.
- `scripts/snipers-launch/database.ts`: perfiles explícitos, TLS/identidad, privacidad, hashes e historial.
- `scripts/snipers-launch/prisma.config.ts`: configuración alternativa sin dotenv ni conexión implícita.
- `scripts/snipers-launch/preflight.ts`: inspección de sólo lectura, invocada automáticamente antes de `migrate deploy` por esa configuración.
- `scripts/snipers-launch/restore-verify.ts`: restauración sólo en base local nueva, vacía y de identidad comprobada.
- `scripts/snipers-launch/initialize.ts`: catálogo y primer supervisor en una transacción serializable.
- `scripts/snipers-launch/launch.test.ts`: aceptación en bases nuevas dedicadas y regresión HTTP del campus compilado.
- `scripts/snipers-launch/guards.test.ts`: negativos ACL Windows e inventario completo de suites históricas.
- `scripts/snipers-launch/build.ts`: build aislado con el comando objetivo y fixture explícito de fuentes.
- `scripts/snipers-launch/regression.ts`: reutiliza suites cerradas sin editar sus lanzadores fijados a HEAD anteriores.
- `config/snipers-launch.env.example` y este documento.

## A1: migración e historial

SHA-256 del SQL nuevo:

`f4699a0c3a02da949703c3a852a5bc4d2ef8bdc8597ff87dfb7e35737af83d14`

Se ensamblan, en orden, phase1, phase3b1, phase3b2a, corrections, finalization,
retention y cleanup-guard. Los siete orígenes tienen hashes fijados en el
ensamblador. Se retiran sólo envoltorios conocidos del archivo derivado; no se
editan los originales. El enum de auditoría se crea completo, en el mismo orden
final de etiquetas. Se conservan las funciones y sus reemplazos sucesivos.

El resultado tiene una única transacción, search_path explícito y límites de
espera. Sólo crea las 13 tablas nuevas y altera esas tablas. Las FK nuevas pueden
tomar locks sobre User: la bandera false no elimina ese riesgo de migración.
La corrección autorizada agrega, antes del COMMIT, un trigger BEFORE TRUNCATE
FOR EACH STATEMENT sobre SnipersAuditEvent, que reutiliza snipers_preserve_audit.
Protege tanto el comando directo como su inclusión mediante CASCADE; INSERT
sigue permitido. Un propietario o administrador con privilegios DDL puede alterar
o deshabilitar triggers: no se declara inmutabilidad absoluta.
Una segunda generación compara bytes; un archivo distinto se rechaza, incluso
si todavía no está aplicado. No hay sobrescritura ni reparación automática.

El ensayo compara las siete fases más ese trigger autorizado: columnas/defaults mediante dump y, por separado, restricciones,
deferrability, funciones, triggers, índices y enums mediante el catálogo. La
declaración de restricciones usa el deparser pretty de PostgreSQL: un roundtrip
de pg_dump puede eliminar paréntesis redundantes de BETWEEN sin cambiar lógica.
No se eliminan paréntesis mediante reemplazos ni se ignoran restricciones.

El preflight exige identidad del destino, TLS remoto verify-full y todos los
checksums históricos exactos, sin entradas pendientes, fallidas o desconocidas.
Si falta la migración nueva, rechaza objetos Snipers ya existentes. Si está
aplicada, exige su checksum final. La configuración normal del proyecto no cambia:
no usar su `migrate deploy` como sustituto del procedimiento de lanzamiento.

El preflight **no certifica compatibilidad productiva** ni sustituye la comparación
de la copia aislada con el esquema real. No reconstruye la baseline vacía ni
ejecuta resolve, reset, db push o migraciones históricas faltantes.

## A2: respaldo y restauración son evidencias distintas

`npm run db:backup` conserva su comportamiento local. La variante nueva requiere
`--launch-profile PERFIL_PRIVADO`; cualquier lectura remota requiere además
`--allow-remote-read`. Estos parámetros son capacidades preparadas, no autorización
para utilizarlas sobre producción durante A.

El perfil no se carga desde `.env`: contiene URL e identidad esperada explícitas.
Se rechazan destinos cruzados, transaction pooling y TLS remoto sin validación
completa. Para perfiles remotos se exige archivo regular privado: modo 0600 en
Unix o ACL limitada al operador, SYSTEM y administradores en Windows.

El proceso hijo de PostgreSQL recibe un entorno acotado, sin PG heredadas ni
NODE_OPTIONS. La URL/contraseña no se pasa en argumentos. El directorio de salida
es privado antes del dump (0700/ACL del operador), y archivos/manifiestos usan 0600.
Se conservan formato custom, archivo provisional, error no cero, TOC, tamaño y hash.
Los hashes de archivos grandes se verifican en streaming. El timeout existente de
las herramientas es 60 s: un respaldo que lo exceda falla, no se declara exitoso.

La variante nueva cubre **esquema y datos de aplicación public**, incluido el
historial Prisma. No cubre roles/grants, servicios administrados auth/storage,
configuración del proveedor ni objetos R2. No es un respaldo completo de Supabase.
Extensiones se inventarían como dependencias; no se instalan automáticamente.

La restauración admite sólo `snipers_launch_restore_<8 hex>` vacío, usuario
snipers_local, 127.0.0.1:55432 y la identidad del postmaster/directorio de Fase 0/1.
No crea, elimina ni limpia bases/esquemas. Se omite únicamente CREATE SCHEMA public
del TOC porque el contenedor ya existe; nunca se omiten datos ni restricciones.
Se usa una transacción y error inmediato. Una extensión distinta de btree_gist
requiere revisión; btree_gist debe estar aprovisionada previamente en el destino.
Sólo deben restaurarse archivos de procedencia confiable.

El manifiesto original permanece inmutable con restorationTested=false. Un
informe separado vincula archivo/hash/destino con restorationSucceeded=true y
mantiene migrationCompatibilityValidated=false. Restaurar exitosamente no acredita
que una migración sea compatible ni que las ACL productivas estén reconstruidas.

## A3: inicialización coherente

Se reutilizan INITIAL_PLANS, la validación de catálogo, transacciones y advisory
locks existentes. La escritura del catálogo y concesión se agrupan en una única
transacción; no se cambia la implementación histórica de initializeCatalog.

Se exige User.id y correo exacto verificado. El CLI requiere respaldo reciente del
destino y migración acreditada. No crea usuarios, contraseñas ni verificaciones.
Una cuenta .invalid se rechaza en producción. Se conservan planes existentes,
incluidos precios/nombres/duración editados; sólo se agregan códigos faltantes.

Una concesión activa para el mismo único supervisor es un no-op. Ante supervisor
distinto, concesión revocada o evidencia ambigua se detiene sin reactivar permisos.
Se usa PERMISSION_GRANTED existente, con actor/grantor NULL para no inventar una
sesión autenticada. No se agregan permisos ni se modifica el rol general.
Ejecutar antes de arrancar el worker: catálogo y singleton comparten una clave
de lock. Ante respuesta incierta, verificar auditoría y reejecutar el mismo destino
e identidad; nunca conceder a otra cuenta para sortear el bloqueo.

## A4/A5: R2, worker y Vercel

Selección R2: test usa TEST_* y snipers-test-*; staging usa STAGING_* y
snipers-staging-*; production usa PRODUCTION_* y snipers-prod-*.
Se rechazan grupos de varios entornos, variables incompletas, buckets cruzados y
fixture fuera del contexto local anterior. Staging/producción exigen concordancia
con SNIPERS_ENVIRONMENT. No hay fallback a claves genéricas AWS/R2. Una preview
con cualquier variable productiva Snipers R2 poblada se rechaza al resolver R2.

**Los prefijos no limitan credenciales.** El operador deberá comprobar el alcance
real de cada token al bucket correcto. Las previews no deben recibir secretos
productivos desde Vercel, aunque la aplicación rechace utilizarlos. Usar buckets
privados de jurisdicción default y revisar CORS, lifecycle y acceso público en B.

Imprescindibles: Linux/systemd y sus propiedades utilizadas, Node 22 compatible,
tsx, FFmpeg, qpdf, clamscan y sigtool en /usr/bin, CVD oficiales firmadas vigentes,
directorio de validación privado y autorización restringida para ejecutar/detener
las unidades transitorias. daily.cvd debe tener como máximo 72 horas; CLD se rechaza.
Actualizar firmas es obligatorio; freshclam es una opción, no una dependencia
del ejecutor. No hacen falta clamd, Redis, Docker ni otro supervisor.

StateDirectory sólo prepara visibilidad/permisos de disco. **No valida aislamiento,
límites, montajes, ausencia de red/secretos ni muerte del cgroup.** La autorización
real para systemd-run/systemctl sigue pendiente; no conceder manage-units general
ni ejecutar todo el worker como root. No se instalaron ni arrancaron servicios.

Vercel pendiente: Node 22.x, instalación con lockfile, build sin migraciones,
variables por entorno, sesiones/URLs/SMTP y configuración de conexión/TLS. Mantener
el secreto NextAuth existente en producción; staging debe tener uno independiente.
El worker usará DATABASE_URL explícita directa o session pooling comprobado; la web
podrá usar un pool compatible. DIRECT_URL existente no modifica por sí sola Prisma.
No se inspeccionó Vercel nuevamente; el 403 previo no demuestra configuración errónea.

## Validación local y reproducción

Los siguientes comandos sólo generan artefactos o usan la instancia local
identificada. Las pruebas crean bases nuevas, conservadas para inspección. Antes
de scripts SQL se ejecuta npm run db:backup para cada destino dedicado.

```text
node --import tsx scripts/snipers-launch/prepare.ts
node --import tsx scripts/snipers-launch/build.ts baseline
node --import tsx --test --test-concurrency=1 scripts/snipers-launch/launch.test.ts
node --import tsx scripts/snipers-launch/regression.ts
node --import tsx scripts/snipers-launch/build.ts final
```

Pruebas: determinismo e inmutabilidad; orden/equivalencia SQL; rollback completo;
Prisma validate/diff; deploy nativo y repetición sin cambios; preflight negativo;
restricciones comerciales y VERIFIED; caída de conexión durante inicialización;
catálogo parcial, concurrencia, reejecución y permiso revocado; R2 sin red; respaldo,
hash corrupto, restauración, datos y secuencias; campus compilado con login real,
curso/matrícula, rutas Snipers 404 y logout. Las suites históricas se ejecutan sin
alterar sus fuentes, usando sus guardas y un respaldo previo de snipers_dev.

Build objetivo: npm run build (Prisma + Turbopack), Node 22.14.0. El fixture offline
de Google Fonts permite repetirlo sin red. No certifica descarga real de fuentes,
OAuth, SMTP, pagos, Vercel ni navegadores móviles. No se cambió el motor del build.

Evidencias privadas: `.local/snipers/launch-a/` contiene logs de intentos rojos y
verdes, inventario de bases, hashes, esquema y smoke HTTP. Los respaldos permanecen
fuera de Git. No se borran fixtures o informes previos para hacer pasar pruebas.

### Resultados anteriores a la corrección de auditoría

Se conservan como evidencia histórica; los resultados vigentes de la corrección
se documentan al final. La selección inicial de regresión omitía tres suites.

| Comprobación | Resultado |
| --- | --- |
| Aceptación A1–A6 | 13/13, sin omisiones; `test-final-privacy.log` |
| Selección inicial de regresión, 20 archivos | 261/261 dentro de esa selección; no acredita regresión histórica completa; `regression-1793539943742.log` y su JSON |
| TypeScript | `tsc --noEmit --incremental false`, salida 0 |
| ESLint del bloque y módulo Snipers | `--max-warnings=0`, salida 0 |
| Build previo a metadatos Node | `baseline-build-1793538391838.json`, aprobado |
| Build final Prisma + Turbopack | `final-build-1793539951512.json`, aprobado |
| Dependencias | 32 dependencias directas/dev coinciden con lock; árbol íntegro sin cambios |
| Preservación | 381 archivos protegidos comprobados; `final-preservation.json` |
| SQL inicial | Dump y catálogo equivalentes a siete fases; 370 restricciones públicas, 8 funciones Snipers y 17 triggers comparados antes de agregar la protección TRUNCATE |
| Prisma 7/PostgreSQL local 18.6 | validate/diff sin diferencias; deploy nativo aplica sólo la migración nueva; segundo deploy sin cambios |
| Fallo SQL antes de COMMIT | Ningún objeto nuevo persistido; esquema anterior conservado |
| Inicialización interrumpida | Excepción y terminación de conexión revierten catálogo/concesión; reejecución y concurrencia aprobadas |
| Restauración | Datos y secuencia identity verificados; compatibilidad de migración permanece como evidencia separada |
| Campus Node 22 | Login por credenciales, curso/matrícula existente, rutas Snipers 404 y logout aprobados |

Se conservan intentos rojos: el fixture Proxy de fuentes no era suficiente para
Turbopack; errores iniciales del código de preparación/fixtures fueron corregidos;
la restauración inicial intentó recrear public, corregido omitiendo sólo ese
contenedor del TOC. La ampliación de regresión con el CLI intermediario de tsx
quedó esperando la barrera SSI de Fase 2. Se cambió únicamente el runner nuevo a
Node nativo `--import tsx --test`, con timeout por archivo. La repetición completa,
incluida esa barrera y todas sus aserciones originales, pasó. No se modificaron
pruebas históricas ni se eliminaron escenarios. La causa exacta del intento
intermediario no se considera demostrada por la repetición verde.

## Clasificación, riesgos y reversión

- P0 verificado localmente: artefacto determinista; equivalencia SQL; controles de
  destino/historial; respaldo/restauración de aplicación; inicialización atómica;
  selección R2; compatibilidad Node/build y campus con bandera false.
- P0 no verificado: esquema/historial productivos reales, restauración de un respaldo
  autorizado de ese origen, dependencias del proveedor, TLS real, tokens/buckets R2,
  CORS/lifecycle, Vercel, VPS y aislamiento de analizadores. Requieren operador y
  autorización específica posterior; no se solicitan secretos por chat.
- P1 conocido y postergado: las FK restrictivas impiden eliminar usuarios vinculados;
  usar baja/suspensión conservando historial. Limpieza automática y recuperación
  operativa de cargas bloqueadas permanecen fuera de A.
- P2 postergado: nuevas pantallas, autosave, avisos, reportes, escalado y refactorizaciones.

La bandera false no protege frente a SQL incorrecto, locks, cambios de TLS/Node,
rotación de secretos ni regresiones globales. No hubo operaciones productivas.

Reversión: antes de aplicar, revertir archivos nuevos/modificados de A excluyendo
settings.json. Si una aplicación futura falla antes del COMMIT, la transacción
revierte. Tras aplicación exitosa, volver a un deployment comprobado con Snipers
desactivado y detener el worker; conservar esquema aditivo, auditoría y objetos.
No entregar down migration destructiva ni restaurar toda producción como rollback
ordinario: perdería operaciones posteriores al respaldo. Una concesión incorrecta
se corrige con gestión existente preservando un supervisor válido.

A puede pasar a auditoría independiente con las evidencias locales. No equivale
a autorización de B ni a un dictamen de lanzamiento productivo.

## Corrección focalizada posterior a la auditoría independiente

01/11/2026, Argentina. Se corrigieron exclusivamente los tres hallazgos autorizados,
sin commit ni staging. Archivos afectados por esta corrección: `database.ts`,
`prepare.ts`, `regression.ts`, `launch.test.ts`, el nuevo `guards.test.ts`, la
migración generada y este informe. Los cinco scripts pertenecen a
`scripts/snipers-launch/`. No se editaron suites históricas ni guardas de destino.

### ACL Windows

El comprobador anterior permitía salida 0 ante un error no terminante de Get-Acl.
Ahora usa StrictMode, ErrorActionPreference=Stop, Get-Acl -ErrorAction Stop y
try/catch con salida 1. Exige una ACL de filesystem verificable, DACL presente,
inspección completa de sus ACE y reglas/identidades verificables. La comparación
mantiene exclusivamente operador, SYSTEM y administradores para concesiones Allow.
Se obtienen SID directamente, sin consultar nombres de cuentas remotas. El proceso
debe devolver además un marcador de éxito exacto y tiene timeout de 10 segundos.

Los negativos ejecutados cubren la ruta inexistente reproducida por el auditor,
error no terminante de inspección, excepción de resolución de identidad inyectada
sin consultar servicios de cuentas, resultados nulos/incompletos y DACL vacía.
Una prueba de filesystem real acepta un archivo privado y rechaza una concesión
Everyone sobre un archivo sintético sin credenciales; finalmente retira esa
concesión y vuelve a comprobar su privacidad. No se relajan los requisitos previos.

### Regresión histórica

Se agregaron `phase3a/actions.test.cjs`, `phase3a/corrections.test.cjs` y
`phase3b1/actions.test.cjs`. Un test de inventario contrasta el runner con todos
los archivos `.test.ts`/`.test.cjs` originales de las fases: 23 archivos, sin
duplicados ni exclusiones. Se conservaron banderas de lanzador, identidad local,
guardas de red y respaldo previo de snipers_dev. Las tres suites se ejecutaron
con sus fuentes intactas. Resultado real ampliado: **308/308**, cero fallos,
cancelaciones u omisiones; reemplaza como evidencia completa al 261/261 inicial.

### Auditoría frente a TRUNCATE

El ensamblador agrega un único trigger `snipers_preserve_audit_no_truncate`
BEFORE TRUNCATE FOR EACH STATEMENT que reutiliza `snipers_preserve_audit`.
La referencia SQL de aceptación conserva las siete fases y agrega únicamente esa
protección explícita; compara nuevamente dump y catálogo: 370 restricciones,
8 funciones Snipers y 18 triggers. Los SQL históricos y sus siete hashes no cambian.

La prueba nueva inserta auditoría y comprueba rechazo SQLSTATE 23514 y el mensaje
exacto para UPDATE, DELETE, TRUNCATE directo y TRUNCATE del padre con CASCADE.
El padre y su FK son fixtures dentro de una transacción revertida; únicamente la
auditoría participa en ese CASCADE, por lo que los triggers de archivos no pueden
ocultar un fallo. Tras cada rechazo se comprueba que la auditoría no cambió.
El límite ante un propietario/administrador con privilegios DDL sigue vigente.

### Evidencia de validación vigente

Directorio privado de la corrección: `.local/snipers/launch-a/correction-1793541128044/`.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Respaldo previo | Identidad local verificada y npm run db:backup aprobado; `backup-before.json`; respaldos adicionales por destino de aceptación |
| Aceptación completa y focalizados | **20/20**: 14 de aceptación incluyendo TRUNCATE/CASCADE y 6 de ACL/inventario; `acceptance-final.log`, cero omitidas |
| Regresión histórica ampliada | **308/308**, 23 archivos, cero omitidas; `../regression-1793541397720.log` y su JSON; `regression-runner.log` |
| TypeScript | `tsc --noEmit --incremental false`, salida 0; `typescript-verified.log` |
| ESLint | Bloque, backup y módulo Snipers, `--max-warnings=0`, salida 0; `eslint-verified.log` |
| Build | Prisma + Turbopack, Node 22.14.0, aprobado; `build-runner.log` y `../final-build-1793541480959.json` |
| Preservación | 381/381 archivos protegidos de la baseline y 394/394 archivos ajenos a esta corrección sin cambios; `preservation.json` |
| Ensamblado | Dos preparaciones iguales; 7 hashes de origen verificados; una transacción y un trigger nuevo; `prepare-first.log`, `prepare-second.log`, `preservation.json` |

SHA-256 vigente de la migración, calculado sobre los bytes nuevos:

`f4699a0c3a02da949703c3a852a5bc4d2ef8bdc8597ff87dfb7e35737af83d14`

Se mantiene la generación determinista y el rechazo de un archivo existente
alterado manualmente. El artefacto se revisó explícitamente por esta autorización;
no se agregó una opción para sobrescribirlo ni se modificó una migración remota.

Se conservan las evidencias anteriores y el intento rojo de TypeScript de esta
corrección (`typescript.log`): al helper nuevo de pruebas le faltaba NODE_ENV en
el entorno tipado; se corrigió exclusivamente ese helper y el chequeo posterior pasó.
El trace de aceptación usa ahora un nombre único para no mezclar ejecuciones previas.

`.env`, `.env.snipers.local`, schema.prisma y SQL históricos coinciden con la
baseline. `.vscode/settings.json` también coincide con la baseline previa a A,
aunque conserva su diferencia preexistente contra HEAD: excluirlo del commit.
Las banderas persistentes siguen false; el smoke del campus compilado pasó.

Persisten los límites ya documentados: backup de aplicación public y timeout de
60 segundos; locks SQL con 5 segundos por espera y 120 segundos por sentencia,
sin presupuesto global de transacción fijado aquí; privilegios DDL capaces de
deshabilitar triggers; validaciones reales de Supabase/TLS, R2, Vercel y VPS/systemd
pendientes. No hubo operaciones productivas ni inicio de Bloque B. Se detiene el
trabajo antes del commit para una segunda auditoría independiente.

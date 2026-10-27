# Grupo de Snipers — Informe de Fase 1

Estado al **27/10/2026 (Argentina): Fase 1 implementada y verificada exclusivamente en local**.
Rama `feature/snipers-campus`, basada en `599510d`. Sin commit, push, merge ni despliegue.

## Alcance implementado

- Diez modelos Prisma: `SnipersPlan`, `SnipersMembership`, `SnipersPayment`,
  `SnipersCoveragePeriod`, `SnipersCategory`, `SnipersClass`, `SnipersResource`,
  `SnipersMeeting`, `UserPermission` y `SnipersAuditEvent`.
- Relaciones aditivas en `User`; ningún cambio de autenticación global, matrículas,
  compras, suscripciones ni lógica de los otros módulos.
- Catálogo explícito, transaccional e idempotente: `SNIPERS_LEVEL_1/2/3`, precios
  iniciales 3000/4000/5000 centavos USD y 30 días. Preserva modificaciones comerciales
  válidas; códigos ambiguos o datos inválidos producen error, sin corrección silenciosa.
- Servicios internos de permisos: supervisor implica editor y gestor. No hay elevación
  de rol global ni administración de otros módulos. `ADMIN` global no concede Snipers.
- Concesión/revocación y auditoría atómicas; comprobación de sesión y permiso actual,
  denegación ante errores, bloqueo transaccional común y protección del último supervisor.
- Bootstrap sintético exclusivamente local: cuenta `STUDENT`, correo `.invalid`,
  contraseña aleatoria bcrypt, correo verificado localmente y una única concesión
  `SNIPERS_ADMIN`. No se identifica ninguna cuenta productiva como verificada.
- Auditoría append-only con campos permitidos; sin contraseñas, tokens, URLs privadas,
  enlaces Zoom ni serialización indiscriminada de entidades.

Snipers continúa deshabilitado (`SNIPERS_ENABLED=false`). Los servicios HTTP deberán
utilizar `src/lib/snipers/server.ts`, que obtiene al actor de la sesión y rechaza el
módulo deshabilitado. El núcleo `permissions.ts` recibe un actor interno confiable;
no debe recibir identidades suministradas directamente por clientes.

No se implementaron servicios operativos de pagos, renovaciones, cortesías, anulaciones,
acceso académico, editor, pantallas, R2, cargas, URLs firmadas ni pasarelas.
Las manipulaciones comerciales de las pruebas son fixtures SQL sintéticos.

## Integridad SQL y decisiones aprobadas

Los importes son enteros. Los pagos exigen precio, duración e importe recibido positivos,
uno a tres períodos, total de lista coherente y motivo si el importe difiere. El importe
asignado a un período admite cero por la distribución futura de centavos.

Las claves compuestas vinculan cobertura con pago, membresía, plan y duración congelada.
Una segunda referencia utiliza `requiredPaymentStatus`, controlado por `CHECK`:
`REGISTERED` exclusivamente para cobertura pagada válida y NULL en los demás casos.
La relación histórica al pago se conserva aunque esa segunda referencia no aplique.

Esto impide anular un pago que todavía tiene coberturas válidas. La futura operación
deberá invalidarlas primero y anular el pago en la misma transacción, sin borrarlas.
No existe esa operación de aplicación en Fase 1. Un trigger impide reescribir condiciones
históricas del pago o eliminarlo; otro comprueba que la posición del período no supere
la cantidad comprada, bloqueando la fila del pago durante la comprobación.

La exclusión GiST se aplica solamente a coberturas con estado `VALID`, pagadas o cortesías,
por membresía y `tstzrange(inicio, fin, '[)')`. Se permiten intervalos adyacentes.
Las coberturas inválidas conservan su historial y no ocupan el intervalo; volver a validarlas
recomprueba exclusión y pago. Suspensión/baja no liberan intervalos ni congelan días.

Se utilizan instantes `timestamptz(3)`, UTC e intervalos de 24 horas por día. Con el catálogo
inicial, uno/dos/tres períodos son exactamente 30/60/90 días, incluso atravesando cambios
de mes o de horario de verano. Cambiar el catálogo o `renewalPlanId` no cambia snapshots.
El acceso futuro dependerá de cobertura válida y estado administrativo, nunca solo de
`expiresAt`; ese control permanece en Fase 2.

Contenido: una categoría opcional por clase, ningún campo de nivel comercial, recursos
MP3/PDF con claves privadas y límites de 250/25 MiB, encuentros con enlace privado.
Las relaciones restrictivas evitan cascadas destructivas. Archivado y verificación de
archivos se representan en los modelos, sin implementar los flujos de Fase 3.

## Cadena local y migraciones realmente ejecutadas

La base inicialmente vacía no podía reconstruirse con el historial heredado: baseline sin
DDL, alteraciones de `Lesson` anteriores a su creación y modelos sin creación registrada.
Ese historial no se modificó ni se reparó. No se usaron `resolve`, `db push`, resets ni
shadow database.

La configuración experimental se selecciona solo desde `npm run snipers:local -- …`.
Rechaza producción/CI, conexiones alternativas y argumentos que sustituyan la configuración.
No se incorpora a build, instalación, dev, start ni despliegues. Los comandos originales
de `package.json` y `prisma.config.ts` conservan su contenido/comportamiento anterior.
No se inspeccionaron configuraciones de despliegue externas al repositorio.

| Migración local | Origen | Ejecución comprobada |
|---|---|---|
| `000_local_development_only` | Esquema de `599510d` → SQL completo con guarda de destino y transacción | Aplicada una vez en `snipers_dev`; 23 tablas del campus |
| `001_snipers_phase1` | Copia exacta de `prisma/snipers-review/phase1.sql` | Aplicada una vez en `snipers_dev`; 10 tablas nuevas y restricciones |

La cadena ejecutable reside en `.local/snipers/phase1-migrations/`, ignorada por Git.
La inicialización completa es **exclusiva de desarrollo local; no desplegar en producción**.
El delta canónico es un **candidato de revisión, no una migración productiva aprobada**.
Repetir `migrate` no aplicó cambios; `status` informó esquema actualizado y el diff no
detectó diferencias en las características representadas por Prisma.

Se instaló `btree_gist` **1.8 únicamente en `snipers_dev`**, con el usuario limitado y
sin elevar privilegios. PostgreSQL local: 18.6, `127.0.0.1:55432`. La disponibilidad y
compatibilidad de esa extensión con el proveedor productivo siguen pendientes.

## Evidencia de preservación e aislamiento

Después de inicializar el campus y antes de aplicar Snipers se capturaron las definiciones
de las 23 tablas anteriores mediante `pg_dump --schema-only`, más sus enums ordenados.
Se eliminaron únicamente los delimitadores aleatorios `\\restrict` del dump para comparar.
La misma captura posterior y la verificación final fueron idénticas:

```text
Estructura anterior y posterior:
e854143228d6a4796b5cccbbe423ec761f23dfce805221010b2f588c4f33ca50

Inicialización local aplicada:
8d7e6b95febd4388b7babae9a474b0f985c65247a37bc9981c31bc617fe0a517

SQL aditivo, copia local y checksum registrado por Prisma:
79e79574f4b000c1c5f4c340acd103651f329ddd47c4c85e59cb45bdcbfd8cd5
```

El SQL aditivo solo crea objetos nuevos y agrega restricciones a sus propias tablas;
no altera ni elimina estructuras anteriores. Las referencias desde Snipers a `User`
no cambian la definición de esa tabla. Los nueve archivos de migración heredados están intactos.

El SHA-256 del `.env` original coincide con la evidencia de Fase 0. No se modificaron
variables productivas, ni se abrió conexión remota. Todos los usuarios de la base local
son sintéticos `.invalid`; al finalizar hay un solo `SNIPERS_ADMIN` efectivo.
Backups, perfiles, credenciales, reportes y cadenas locales permanecen ignorados por Git.

Evidencia detallada local:

- `.local/snipers/phase1-baseline.json`: captura previa de estructuras.
- `.local/snipers/phase1-migration-evidence.json`: hashes comparados y copia del delta.
- `.local/snipers/phase1-verification.json`: identidad, catálogo, migraciones y estado final.
- `.local/snipers/phase1-tests.tap`: salida de la suite.
- `backups/snipers-local/`: respaldos custom y manifiestos SHA-256 verificados antes de escrituras.

## Validación

| Comprobación | Resultado |
|---|---|
| Suite `snipers:local -- test` | **40/40 aprobadas**, 0 omitidas; incluye las 20 pruebas de Fase 0 |
| SQL directo | CHECK, importes, idempotencia, claves compuestas, referencias restrictivas y auditoría inmutable comprobados |
| Concurrencia PostgreSQL | Exclusión de intervalos y anulación/cobertura en ambos órdenes; espera de bloqueo real comprobada en `pg_stat_activity` |
| Duraciones | 30/60/90 días exactos, fin exclusivo, cambio de mes y horario de verano comprobados |
| Permisos | Matriz, herencia, denegación por rol global, autoasignación rechazada, revocación y último administrador concurrente comprobados |
| Atomicidad de auditoría | Fallo de escritura simulado: concesión y revocación revertidas íntegramente |
| Catálogo | Inicialización concurrente, repetición sin cambios, conservación comercial y detección de conflictos comprobadas |
| Prisma 7.8 | Validación, generación de cliente y diff local aprobados |
| TypeScript | `tsc --noEmit --incremental false`: aprobado |
| ESLint | `scripts/phase1` y `src/lib/snipers`: aprobado sin advertencias |
| Git | Historial heredado intacto; flujos normales conservados; sin commit ni operaciones remotas |

Los primeros intentos de pruebas corrigieron expectativas de códigos SQLSTATE: PostgreSQL
18 devuelve `23001` ante violaciones de `RESTRICT`; las restricciones funcionaban y no se
debilitaron. También se corrigió el tipado de fixtures de entorno exigido por Next.js.

Las pruebas concurrentes conservan datos sintéticos identificados. Las demás usan rollback
cuando es posible. No se borró historial para repetirlas. No se repitió la restauración
de Fase 0 sobre sus bases ya pobladas, ni se hizo una nueva restauración del dump de Fase 1.
No se ejecutó build de producción ni prueba de interfaces: no se añadieron interfaces.

## Archivos a incluir en un futuro commit

Modificados:

- `package.json`: agrega solamente `snipers:local`.
- `prisma/schema.prisma`: modelos/enums Snipers y relaciones inversas en `User`.
- `docs/PLAN-snipers.md`: plan aportado por el usuario, aún no versionado, con nota de estado actual.

Nuevos:

- `.gitattributes`: LF exclusivamente para los nuevos SQL experimentales, para preservar checksums.
- `docs/snipers-phase1.md`: este informe.
- `prisma/snipers-review/README.md` y `phase1.sql`.
- `scripts/phase1/README.md`, `cli.ts`, `guard.ts`, `evidence.ts`, `snipers.local.config.ts`.
- `scripts/phase1/catalog.ts`, `initialize.ts`, `isolation.test.ts`, `integration.test.ts`.
- `scripts/phase1/local-artifacts/pre-snipers.prisma`, `init-local.sql`, `constraints.sql`.
- `src/lib/snipers/permissions.ts` y `server.ts`.

No incluir `.local/`, `.env*`, `backups/`, reportes privados ni credenciales. No se creó commit.

## Límites y continuidad

La Fase 1 está verificada en la base sintética local; **no es un resultado apto para desplegar
directamente en producción**. Falta contrastar el esquema productivo, el historial realmente
aplicado, datos existentes, proveedor y extensiones, con autorización específica futura.

Las pruebas no sustituyen un respaldo/restauración productivo. Los operadores con acceso
administrativo directo a PostgreSQL pueden eludir controles de aplicación; no hay mecanismo
de recuperación automática de permisos. Una concesión inicial productiva requiere otro
procedimiento, verificación de identidad y autorización.

La eliminación global de un usuario con referencias Snipers ahora puede ser rechazada por
las nuevas FK restrictivas; es intencional para conservar historial. No se modificó la acción
global de eliminación y su transacción debe revertirse ante esa restricción.

No avanzar a Fases 2/3 ni desplegar sin nueva autorización. Mantener PostgreSQL iniciado
manualmente y usar únicamente los comandos locales documentados.

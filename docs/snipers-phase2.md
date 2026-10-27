# Grupo de Snipers — Informe técnico de Fase 2

Estado al **27/10/2026 (Argentina): implementación y pruebas exclusivamente locales,
pendientes de revisión final del usuario**. Rama `feature/snipers-campus`, desde
`90443d3918e948e169624173c4a2f2361bcec728`. Sin commit, push, merge ni despliegue.

## Alcance efectivamente implementado

- Alta de una membresía por usuario registrado, con plan activo y sin acceso implícito.
- Pagos manuales y renovaciones de uno, dos o tres períodos del plan persistido.
- Previsualización y confirmación explícita de fechas, importes y condiciones.
- Descuentos e importes superiores con motivo; reparto exacto de centavos.
- Cortesías sin pago; reemplazo y revocación conservando registros anteriores.
- Cambios del plan de próxima renovación, sin reescribir prepagos.
- Suspensión, baja y reapertura por gestor, con motivo y auditoría.
- Anulación íntegra de pagos y sus coberturas, sin devolución ni desplazamientos.
- Búsqueda comercial por correo, resumen de membresía e historial paginado.
- Decisión de acceso académico por cobertura efectiva o permisos de gestión.

No hay cambios de modelos, enums, restricciones SQL ni migraciones. No hay pantallas,
rutas HTTP, Server Actions públicas, cron, pasarelas ni almacenamiento de Fase 3.
No se modificaron compras, matrículas, suscripciones ni autenticación global del campus.

## Inventario de archivos

Nuevos servicios en `src/lib/snipers/`:

| Archivo | Responsabilidad |
|---|---|
| `contracts.ts` | Esquemas Zod estrictos, tipos, centavos y fechas |
| `errors.ts` | Errores operativos con códigos estables |
| `session.ts` | Conversión de sesión NextAuth confiable a actor interno |
| `preview.ts` | Serialización canónica, huellas, HKDF y HMAC |
| `operations.ts` | Operaciones transaccionales y comprobantes idempotentes |
| `queries.ts` | Consultas comerciales y autorización académica |
| `gateway.ts` | Fachada interna con sesión y configuración inyectables para pruebas |

Modificados: `permissions.ts` agrega el modo explícito de bloqueo de autorización;
`server.ts` integra la fachada y endurece validación de sesión/configuración del módulo.

Pruebas/herramientas nuevas: `scripts/phase2/cli.ts`, `unit.test.ts`,
`integration.test.ts`, `nextauth-adapter.fixture.cjs` y `README.md`. Se adapta únicamente la validación de payloads
de auditoría en `scripts/phase1/integration.test.ts`: listas permitidas por acción y
formato, conservando comprobaciones de inmutabilidad y ausencia de secretos.

Documentación: este informe, enlace de continuidad en `docs/PLAN-snipers.md` y
aclaración del commit de cierre en `docs/snipers-phase1.md`.

## Contratos y reglas comerciales

La entrada de aplicación es `snipers`, exportada desde `server.ts`, marcado
`server-only`. `gateway.ts` es una dependencia interna de esa fachada y de sus pruebas;
no es una API ni debe importarse desde clientes. Los núcleos reciben actores confiables.

Los comandos exigen UUID de operación, destino y, salvo el alta, versión esperada de
membresía. Zod rechaza campos adicionales, importes fraccionarios, coerciones y fechas
sin UTC/milisegundos. Los motivos tienen hasta 1000 caracteres; métodos hasta 100 y
referencias hasta 200. Las referencias vacías se convierten a `null`.

`previewPayment`/`previewCourtesy` devuelven `{ terms, token }`.
`confirmPayment`/`confirmCourtesy` reciben `{ command, preview }`.
El resto de comandos recibe los campos de su esquema explícito. Las respuestas
mutantes son `{ result, replayed, confirmedAt }`; `result` representa la operación
confirmada históricamente, no garantiza el estado actual de sus entidades.

`searchMembers` admite correo parcial literal, desde tres caracteres, y paginación.
`getCommercialMembership` distingue cobertura actual, futuras y próxima renovación.
`getCommercialHistory` devuelve tres listas paginadas independientemente con el mismo
`offset`/`limit`: pagos, coberturas y eventos. Ninguna incluye contraseñas, JWT,
identificadores de sesión ni claves de firma.

### Cobertura y dinero

- Intervalos `[inicio, fin)`, UTC y días de 24 horas; catálogo inicial 30/60/90 días.
- El inicio automático es el máximo entre el instante de previsualización y el final
  de todas las coberturas válidas, incluidas futuras. No rellena huecos.
- Inicio manual pasado/futuro exige motivo. `paidAt` es independiente y no admite futuro.
- Confirmar conserva exactamente las fechas propuestas; nunca sustituye el inicio por
  un nuevo “ahora”. Reintentos técnicos tampoco cambian condiciones.
- Catálogo, estado o membresía desactualizados exigen revisar otra propuesta.
- `expiresAt` es `max(endsAt)` válido o `null`, sin valor autorizante por sí mismo.
- Precio/nombre/duración del pago son snapshots. Un plan inactivo asignado permite
  renovar, pero no nuevas asignaciones ni nuevas cortesías con ese plan.
- Importe recibido positivo; motivo si difiere del total de lista. Cero corresponde
  a cortesía sin pago, no a un pago ficticio.
- División entera y resto a primeros períodos: 1 centavo/3 períodos produce `[1,0,0]`;
  2/3 produce `[1,1,0]`; 4/3 produce `[2,1,1]`. Asignación cero sigue siendo `PAID`.
- Cambiar nivel afecta exclusivamente `renewalPlanId`. Suspender no congela días.
- Se puede cobrar o conceder cortesía durante suspensión sin reactivar. `CLOSED`
  requiere reapertura previa para nueva cobertura; el gestor puede reabrir con motivo.
- Reapertura no restaura registros anulados. Reemplazo de cortesía invalida y crea;
  anulación de pago invalida todos sus períodos, sin borrar ni mover otras coberturas.

## Autenticación, autorización y bloqueos

Se inspeccionaron `src/lib/auth.ts` y las implementaciones instaladas de NextAuth
`jwt.decode` y la ruta de sesión. La estrategia real es JWT cifrado: NextAuth valida
el token y su expiración antes de ejecutar los callbacks. `Session.expires` es un
valor renovable y no prueba por sí mismo la validez criptográfica del JWT.
El adaptador real de un argumento `getServerSession(authOptions)` elimina `expires`.
La corrección posterior a la auditoría acepta su ausencia; si se recibe ese campo,
se siguen rechazando valores inválidos o vencidos. No se inventa una expiración ni
se modifica la configuración global de NextAuth. El mismo helper es utilizado por
las funciones de permisos de Fase 1 y por el gateway de Fase 2.

La fachada usa exclusivamente `getServerSession(authOptions)`, rechaza errores y
configuración incierta, y después comprueba en su transacción que existe el usuario
y que `activeSessionId` coincide cuando la sesión única está habilitada. Esto evita
heredar la tolerancia a errores de base del callback global. No consulta la tabla
`Session`, que no es el registro autorizante de esta estrategia JWT.

El modo operativo de `requirePermission(..., true)` adquiere primero `FOR SHARE` en
el usuario y luego en las concesiones activas aplicables, ordenadas por ID. Esos
bloqueos coordinan la comparación de sesión y las revocaciones; no validan el JWT.

Orden comercial: **usuario/concesiones → membresía → plan → pago → coberturas**.
Cada operación modifica una sola membresía. No hay transacciones anidadas ni consultas
por otro cliente durante la transacción. El pool de aplicación mantiene su configuración
anterior; las pruebas concurrentes usan conexiones independientes del pool local.

`changePermission` conserva su advisory lock exclusivo previo a autorización y cambios.
Las operaciones comerciales no adquieren ese advisory lock. Su bloqueo compartido de
la concesión obliga a la revocación a esperar; una concesión modificada después de la
instantánea produce serialización y revalidación. Se probaron ambos órdenes y una
instantánea antigua. Se probó también sustitución concurrente de `activeSessionId`.

La anulación bloquea primero membresía y pago, luego sus coberturas. Invalida coberturas
con `requiredPaymentStatus=NULL` y después cambia el estado del pago. Así respeta la FK
y el trigger de cobertura que adquiere `FOR SHARE` sobre el pago; no invierte el orden.

Se reutiliza `SERIALIZABLE`, con tres intentos máximos para `40001`/`40P01`. Un conflicto
comercial no se reintenta cambiando la intención. La última ejecución observó
**13 errores de serialización esperados y 0 deadlocks**. Las carreras previstas fallan
si aparece `40P01`, aunque el ejecutor consiguiera recuperarse.

Los roles globales no conceden Snipers. Editor y gestor tienen consulta académica de
gestión; solo gestor/supervisor consultan o modifican información comercial. El permiso
de edición queda separado. El control académico del alumno exige estado `ACTIVE` y
cobertura válida en ese instante, con pago registrado si procede, igual para tres niveles.

`SNIPERS_ENABLED` debe ser exactamente `true` para entrar a la fachada. Deshabilitado
rechaza antes de invocar sesión o base. Los errores de consulta académica deniegan;
ninguna autorización se conserva en caché compartida.

El instante de cobertura se obtiene con `SELECT clock_timestamp()` después de adquirir
los bloqueos de autorización y membresía, inmediatamente antes de consultar cobertura,
dentro de cada intento. No se usa `now()`/`transaction_timestamp()`, que conservan el
inicio de la transacción ([referencia PostgreSQL 18](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)). Tampoco se conserva un `Date` de antes de adquirir conexión.
El servicio productivo no recibe un argumento de reloj ni una variable de entorno para
alterarlo; las pruebas de fronteras estáticas interceptan únicamente la respuesta SQL
del reloj en su adaptador local, conservando las aserciones `[inicio, fin)`.

## Comprobantes, idempotencia y firma

### Comprobantes

La comparación de método/referencia usa `upper(btrim(...))` en PostgreSQL, tanto para
datos existentes como para entradas. Con referencia presente, la transacción consulta
todos los pagos equivalentes antes de insertar. Si encuentra uno registrado, rechaza.
La lectura de predicado en `SERIALIZABLE` evita que dos inserciones concurrentes
confirmen simultáneamente el mismo comprobante: la transacción abortada reintenta y
encuentra el duplicado. No se presume que `FOR UPDATE` bloquee una fila inexistente.

Una referencia histórica anulada exige reemplazo explícito del último eslabón, misma
membresía/método/referencia y predecesor `VOID`. El enlace se guarda en auditoría y no
se permite otro sucesor de ese predecesor. No se restaura el pago anterior. Una anulación
todavía sin commit no habilita reutilización anticipada. Sin referencia, esta unicidad
no aplica y dos comandos diferentes pueden registrar pagos distintos legítimos.

### Idempotencia

El UUID es PK del evento principal y, para pagos, también `idempotencyKey`.
El payload tiene esquema estricto y conserva tipo, huella de intención, resultado y
cambios permitidos; nunca almacena token de previsualización ni sesión.

Después de autorizar se busca el comprobante antes de comprobar versiones actuales o
firma de una propuesta pendiente. Misma clave/actor/intención devuelve el resultado
original incluso tras anulación, posteriores cambios o rotación de la clave de firma.
Otra intención, actor o tipo produce conflicto. Una nueva operación requiere otro UUID.
Los comandos sin cambio efectivo guardan un comprobante sin incrementar versión.

La PK arbitra carreras de UUID; tras `23505` se revierte y consulta el comprobante en
una transacción nueva autorizada. Si no existe un resultado coincidente, no se anuncia
éxito. Pago, coberturas, resumen y evento confirman o revierten juntos.

### Firma

HMAC-SHA256 con clave de 32 bytes derivada mediante HKDF-SHA256 del secreto existente;
salt `psicoemotrading/snipers`, info `phase2/coverage-preview/v1`. No se usa directamente
la clave de NextAuth ni su contexto criptográfico. Configuración ausente, corta, con
espacios exteriores o caracteres de control inválidos se rechaza.

El token contiene condiciones comerciales y hashes del actor/comando, no correo,
referencia, motivos, sesión ni secretos. Se compara la firma en tiempo constante.
No hay tabla de propuestas, servicio externo ni vencimiento arbitrario de 15 minutos.
La firma fija el inicio automático original; las versiones y el recálculo controlan
vigencia comercial. Alterar fechas o importes requiere otra previsualización.

## Verificaciones y evidencia

| Verificación | Resultado final |
|---|---|
| Fase 2: unitarias e integración | **36/36**, 0 fallidas, 0 omitidas |
| Regresión Fases 0/1 | **40/40**, 0 fallidas, 0 omitidas |
| TypeScript | `--noEmit --incremental false`: aprobado |
| ESLint | Archivos de servicios/pruebas afectados, `--max-warnings=0`: aprobado |
| Git diff | Sin errores de whitespace; pendiente de revisión, sin commit |

Las primeras verificaciones de TypeScript detectaron campos faltantes en fixtures JWT
y una propiedad de fixture no inferida; se corrigieron los fixtures. Dos advertencias
de imports no usados se eliminaron. Ninguna prueba de seguridad/concurrencia se quitó
ni relajó para aprobar. Las ejecuciones de suites de Fase 2 y regresión no tuvieron fallos.

Las pruebas cubren errores parciales al insertar pago/períodos/auditoría, rollback de
anulación y cortesía reemplazada, doble confirmación, recuperación tras anulación,
descuentos mínimos, snapshots, planes inactivos, huecos, fronteras exactas, separación
de permisos, módulo deshabilitado y JWT válidos/expirados/clave incorrecta con el SDK real.

Carreras controladas con varias conexiones y observación de `pg_stat_activity`:
comprobante ausente entre alumnos, reemplazos simultáneos, renovaciones distintas,
revocación/sesión, anulación/renovación y cortesía/cambio de plan en ambos órdenes.
Se comprueban después ausencia de duplicados registrados y cantidad/suma de períodos.

Cada suite que escribe pasó antes por guardas y `npm run db:backup` con perfil local.
Respaldos de las ejecuciones, manifiestos e inventarios están ignorados en
`backups/snipers-local/`. El último previo a Fase 2 es
`local-2026-10-27T22-44-12-368Z-035bc5d5.dump` para la suite corregida de Fase 2 y
`local-2026-10-27T22-45-44-137Z-43d2e8f1.dump` para regresión de Fases 0/1;
no se afirma una nueva restauración.

Evidencia ignorada: `.local/snipers/phase2-test.tap`, `phase2-regression.tap`,
`phase2-unit.tap` y `phase2-verification.json`. No incluirlas en Git.
La verificación compara hashes de `.env`, perfil local, esquema Prisma y SQL protegido,
estructura anterior del campus, usuarios sintéticos y supervisor único.
Esta comparación de estructura utiliza `pre-snipers.prisma` y cubre las 23 tablas
anteriores del campus. **No es una comparación completa de las tablas, enums,
restricciones y funciones/triggers instalados de Snipers.** Los hashes de archivos
Prisma/SQL no equivalen a verificar las definiciones vivas de esos objetos. En esta
corrección no se modifica el helper, las restricciones ni los mecanismos históricos
de evidencia; esa limitación permanece explícita.

## Corrección focalizada posterior a la auditoría

La auditoría detectó el rechazo indebido de sesiones reales sin `expires` y la captura
anticipada del reloj académico. La corrección solo modifica `session.ts`, `queries.ts`,
sus pruebas y este informe; agrega el fixture de integración de NextAuth, sin replantear
servicios ni cambiar modelos, SQL o autenticación global.

Antes de corregir los servicios se agregaron cuatro regresiones. Tres fallaron frente al
código defectuoso: adaptador real, vencimiento esperando un bloqueo y vencimiento tras
un reintento. Node informa cuatro fallos contando también el contenedor de integración.
La cuarta, revocación antes de recuperar un recibo, ya aprobaba y confirma una garantía
existente. Tras corregir, las 36 comprobaciones de Fase 2 aprueban y la regresión completa
de Fases 0/1 conserva sus 40 aprobadas. No se eliminaron pruebas ni relajaron aserciones.

- NextAuth: proceso hijo aislado con cookie JWE emitida por el SDK, `getServerSession`,
  núcleo de autenticación, callbacks de `auth.ts`, fachada `server.ts` y PostgreSQL reales.
  Solo se simulan `next/headers` (contexto de solicitud) y el marcador `server-only` para
  ejecutar en Node. No se fabrican las sesiones devueltas, no se reemplaza `AuthHandler`,
  el descifrado ni los callbacks. La sesión válida no tiene `expires` y autoriza tanto
  `requireSnipersPermission` como la consulta comercial. JWT vencido, clave incorrecta,
  sesión única sustituida y cookie ausente se rechazan por ambos recorridos.
- Espera: se mantiene un bloqueo real sobre la membresía, se observa la espera en
  `pg_stat_activity`, se deja vencer la cobertura según PostgreSQL y luego se libera.
  El resultado corregido es `NO_COVERAGE`, no un fallo de infraestructura.
- Reintento: se establece una instantánea real, se modifica el usuario sintético desde
  otra conexión y se deja vencer la cobertura. PostgreSQL produce exactamente un
  `40001`; el intento siguiente revalida sesión y deniega por `NO_COVERAGE`.
- Idempotencia revocada: se conservan pago y recibo originales con todos sus valores;
  la repetición devuelve `FORBIDDEN` antes de consultar tablas comerciales o el recibo.

La evidencia anterior se preservó en `.local/snipers/phase2-before-correction/` antes
de ejecutar. Las salidas nuevas están también en `phase2-correction-red.tap`,
`phase2-correction-green.tap` y `phase2-correction-regression.tap`, dentro del directorio
local ignorado. La habilitación positiva de la fachada real ocurre solo en el proceso
hijo de prueba; el padre y `.env.snipers.local` conservan `SNIPERS_ENABLED=false`.

## Aislamiento, límites y revisión pendiente

- Único destino de escrituras: `127.0.0.1:55432/snipers_dev`, rol `snipers_local` sin
  superusuario, creación de roles/bases, replicación ni bypass RLS.
- Se preservan `.env` original y perfil local; este último mantiene
  `SNIPERS_ENABLED=false`. La habilitación positiva se inyecta únicamente en pruebas.
- No hubo conexiones productivas, llamadas a pasarelas, cambios remotos ni despliegue.
- No hubo DDL ni ejecución de migraciones. No se creó otra concesión inicial.
- Los fixtures son sintéticos `.invalid` y permanecen en local para conservar historial.
- La unicidad comercial, cantidad completa y suma asignada requieren usar los servicios.
  SQL directo o escritores con otro protocolo pueden eludir esas garantías de aplicación.
- Sin índice específico, las búsquedas de comprobantes/auditoría pueden recorrer tablas
  y aumentar conflictos SSI. No se agrega esquema ni se asegura rendimiento productivo.
- Sin referencia o con identificaciones diferentes, no puede deduplicarse el cobro real.
- Las sesiones JWT mantienen las capacidades globales actuales: con sesión única
  deshabilitada no se inventa una lista de revocación; cerrar una cookie no invalida por
  sí solo todas las copias de un JWT. La sesión se valida al entrar a cada solicitud.
- No se inició servidor web ni se ejecutó login en navegador, prueba de interfaces o
  build productivo. Además de las pruebas con sesión inyectada, el fixture nuevo prueba
  la fachada con el adaptador y validación real de JWT de NextAuth, en contexto de
  solicitud simulado y PostgreSQL local. No acredita OAuth ni login de navegador completo.
- Compatibilidad productiva de proveedor/extensiones/migraciones sigue sin acreditarse.

No hay autorización para commit de cierre, push, Fase 3 ni producción. Esperar la
revisión final del usuario.

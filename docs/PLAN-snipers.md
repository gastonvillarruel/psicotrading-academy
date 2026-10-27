# Grupo de Snipers — Plan actualizado y preparación de Fase 0

> Estado al 27/10/2026: la Fase 0 está completada y la Fase 1 fue implementada y
> verificada exclusivamente en local. Ver [informe de Fase 0](snipers-phase0.md) e
> [informe de Fase 1, precisiones aprobadas y límites](snipers-phase1.md).
> La sección 4 conserva la inspección histórica previa a Fase 0; no describe el entorno actual.
> Para Fase 1 prevalecen las precisiones del informe: cadena local separada, supervisor
> con capacidades implícitas, bootstrap sintético local y ninguna autorización productiva.
> Continuidad: la Fase 2 fue implementada y probada exclusivamente en local;
> ver [informe técnico y revisión pendiente](snipers-phase2.md). No habilita Fase 3 ni producción.

Este plan reemplaza al anterior. Los niveles serán exclusivamente comerciales: **todos los miembros con cobertura efectiva tendrán acceso al mismo contenido publicado e histórico**.

La arquitectura general aprobada se conserva. El cambio principal es separar **plan comercial, pago y período de cobertura**, para representar correctamente prepagos, descuentos y cortesías.

## 1. Modelos Prisma y reglas de integridad

### Modelos comerciales

| Modelo | Datos y relaciones propuestos |
|---|---|
| `SnipersPlan` | `id`, código estable único, nombre, precio en centavos USD, duración en días, activo/inactivo, orden, versión y fechas de creación/actualización. Relacionado con membresías, pagos y coberturas. |
| `SnipersMembership` | Una por `User`; estado administrativo, `renewalPlanId`, vencimiento resumido y versión para concurrencia. Relacionada con pagos y coberturas. |
| `SnipersPayment` | Membresía, plan, cantidad de períodos —1, 2 o 3—, precio unitario y duración congelados, total de lista, importe efectivamente recibido, motivo de excepción, método, referencia, fecha de pago, operador, idempotencia y estado registrado/anulado. |
| `SnipersCoveragePeriod` | Membresía, plan, inicio, fin, origen `PAID` o `COURTESY` y estado válido/anulado. Una fila por período comprado; para cortesías, un intervalo explícito con motivo y otorgante. |

Se mantienen los modelos propuestos de contenido, recursos, categorías, encuentros, permisos y auditoría: `SnipersClass`, `SnipersResource`, `SnipersCategory`, `SnipersMeeting`, `UserPermission` y `SnipersAuditEvent`.

**Reglas obligatorias:**

- `SnipersMembership.renewalPlanId` representa el plan elegido para la próxima renovación no abonada. No representa necesariamente el nivel vigente hoy.
- El nivel vigente se obtiene del período que cubre el instante actual.
- Los períodos futuros ya abonados conservan su plan y condiciones.
- El vencimiento resumido no basta para autorizar: debe existir cobertura válida en ese instante, sin suspensión ni baja.
- Los intervalos utilizan fin exclusivo: uno puede terminar exactamente cuando comienza otro.
- No se permiten coberturas válidas superpuestas, incluyendo cortesías.
- Los pagos históricos conservan nombre del plan, precio, duración e importe recibido, aunque cambie el catálogo.
- Las relaciones impiden eliminar planes referenciados. La gestión habitual será desactivarlos.
- Un plan inactivo no se ofrecerá para altas o cambios nuevos, pero **permitirá renovar membresías que ya lo tengan asignado**, conforme a tu elección.
- No habrá campos de nivel en las clases ni verificaciones de nivel para acceder a archivos o encuentros.

### Inicialización de planes

La operación inicial creará:

| Código estable | Nombre inicial | Precio inicial | Duración |
|---|---|---:|---:|
| `SNIPERS_LEVEL_1` | Snipers Nivel 1 | 3000 centavos USD | 30 días |
| `SNIPERS_LEVEL_2` | Snipers Nivel 2 | 4000 centavos USD | 30 días |
| `SNIPERS_LEVEL_3` | Snipers Nivel 3 | 5000 centavos USD | 30 días |

Será una operación explícita, transaccional e idempotente: creará los códigos faltantes y no sobrescribirá modificaciones comerciales posteriores.

Estos valores pertenecerán a los datos de inicialización. **El servicio de pagos siempre consultará el plan persistido.** La inicialización no forma parte de la Fase 0.

## 2. Cambios de nivel, renovaciones y excepciones

### Representación del nivel actual y próximo

La interfaz distinguirá tres elementos:

1. **Nivel vigente:** el correspondiente a la cobertura actual.
2. **Coberturas futuras confirmadas:** períodos ya pagados o concedidos, cada uno con su plan y fechas.
3. **Plan para la próxima renovación:** `renewalPlanId`, aplicable a la siguiente cobertura todavía no abonada.

Ejemplo: un alumno pagó tres períodos de Nivel 1 y solicita Nivel 2. Los tres períodos conservan Nivel 1; la próxima renovación utilizará Nivel 2.

Si después paga anticipadamente Nivel 2 y solicita Nivel 3, la pantalla mostrará el Nivel 1 vigente, la cobertura futura confirmada de Nivel 2 y el Nivel 3 elegido para una renovación posterior.

Para simplificar el MVP:

- Habrá una única selección pendiente para la próxima renovación.
- Cambiarla no modificará períodos confirmados.
- Su fecha prevista se calculará desde la cobertura existente; no se mantendrán fechas duplicadas que puedan quedar desactualizadas.
- Cada cambio quedará registrado en auditoría con los planes anterior/nuevo, actor y contexto.
- No será necesaria una tabla adicional de programación ni un proceso cron para aplicar el nivel.
- **Los cambios inmediatos quedan postergados**, según tu elección.

### Renovación manual

El gestor elegirá uno, dos o tres períodos. Una operación utilizará un solo plan para todos sus períodos nuevos.

El servidor calculará:

- Precio de lista: precio vigente del plan × cantidad.
- Duración: duración vigente del plan × cantidad.
- Inicio: al terminar la cobertura confirmada existente; si venció, “ahora” por defecto, con fecha abonada editable.
- Vencimiento resultante y detalle individual de cada período.

Antes de confirmar se mostrarán alumno, plan, períodos, precio de lista, importe recibido, inicio y vencimiento. También se mostrarán coberturas prepagadas y cambios pendientes relevantes.

La confirmación deberá comprobar nuevamente:

- Permisos actuales.
- Versión de la membresía y del plan.
- Plan elegido para renovar.
- Ausencia de superposiciones.
- Referencia e idempotencia.

Si cambió el precio, nivel o vencimiento desde la previsualización, se exigirá revisar el nuevo resultado. No se confirmará silenciosamente otra operación.

Pago, períodos, resumen de membresía y auditoría se guardarán en una transacción serializable. Los reintentos técnicos conservarán la misma idempotencia y no aprobarán condiciones comerciales diferentes.

### Descuentos e importes excepcionales

`SNIPERS_MEMBERSHIP_MANAGER` podrá registrar excepciones con motivo obligatorio, conforme a tu elección.

- Guardar por separado total de lista e importe efectivamente recibido.
- Exigir motivo cuando difieran, tanto para descuentos como para otros importes excepcionales.
- El importe recibido deberá ser positivo; un acceso completamente gratuito se registrará como cortesía.
- Distribuir el importe entre los períodos en centavos, asignando cualquier resto a los primeros períodos, sin diferencias de redondeo.
- No modificar pagos anteriores ante cambios de nivel o precio.

El historial mostrará claramente el precio de lista, descuento o diferencia, importe recibido y motivo.

### Cortesías, anulaciones y estado administrativo

Las cortesías crearán cobertura con inicio, vencimiento, plan asociado y motivo obligatorio, **sin crear un pago de importe cero**.

- El inicio propuesto será el final de la cobertura existente o “ahora” si no hay cobertura vigente/futura.
- Cualquier fecha elegida deberá respetar la ausencia de superposiciones.
- Modificaciones o revocaciones quedarán auditadas.
- No desplazarán automáticamente períodos pagados.
- Conceder cobertura no levantará silenciosamente una suspensión.

Anular un pago anulará todos los períodos originados por esa operación, conservará el registro y exigirá motivo. No moverá otras coberturas para rellenar huecos ni implicará una devolución automática de dinero.

Se mantienen suspensión sin congelamiento, reactivación sin días adicionales y baja con conservación del historial.

## 3. Campus, permisos y alcance del MVP

### Interfaz del mentor

La pestaña **Alumnos** incorporará:

- Búsqueda de usuarios registrados por correo.
- Alta con selección de plan.
- Nivel vigente, vencimiento y estado administrativo.
- Cronología de coberturas actuales y futuras.
- Selector del plan para la próxima renovación.
- Renovación de uno, dos o tres períodos, con cálculo automático.
- Registro de importe excepcional y motivo.
- Alta y modificación de cortesías.
- Suspensión, reactivación y baja.
- Historial diferenciado de pagos, descuentos, cortesías, anulaciones y cambios de nivel.

Las confirmaciones utilizarán `ConfirmModal`. Los formularios mostrarán etiquetas comerciales, fechas e importes; no claves internas ni detalles técnicos.

La administración superior dispondrá de una pantalla sencilla para gestionar el catálogo de planes y sus permisos. El mentor podrá asignar niveles, pero no cambiar precios del catálogo ni conceder permisos administrativos.

### Permisos

| Permiso | Alcance |
|---|---|
| `SNIPERS_CONTENT_EDITOR` | Contenido, recursos, categorías y agenda. |
| `SNIPERS_MEMBERSHIP_MANAGER` | Membresías, renovaciones, pagos, descuentos y cortesías de Snipers. |
| `SNIPERS_ADMIN` | Supervisión, catálogo y asignación/revocación de permisos. |

Inicialmente se asignarán únicamente a tu cuenta verificada por `User.id`. Posteriormente, el mentor recibirá edición y gestión de membresías; `SNIPERS_ADMIN` quedará reservado a administración superior.

Los roles generales no otorgarán estos permisos automáticamente. Toda acción se autorizará en el servidor.

### Incluido en el MVP

- Seguridad, auditoría e integridad comercial.
- Tres planes configurables y cambios desde la próxima renovación no abonada.
- Renovaciones de 30/60/90 días con los valores iniciales.
- Descuentos, cortesías y anulaciones completas.
- Tarjeta y módulo en `/mi-campus/snipers`, dentro del campus actual.
- Historial completo publicado, organizado por año, mes y categoría.
- Editor visual con borradores, publicación, edición y archivado.
- Agenda privada con enlace Zoom.
- MP3 reproducibles sin descarga previa y descarga de MP3/PDF.
- R2 privado, URLs cortas autorizadas y cargas recuperables.

Se mantienen los límites acordados de 250 MiB para MP3 y 25 MiB para PDF, multipartes para archivos grandes, verificación del archivo antes de publicarlo y separación entre objetos temporales y finales.

La autorización de archivos utilizará cobertura efectiva y permisos de gestión, sin distinguir niveles. La desactivación comercial de un plan tampoco bloqueará cobertura existente.

### Postergado

- Cambios inmediatos de nivel.
- Prorrateos, créditos, devoluciones y anulaciones parciales.
- Varias programaciones de cambios todavía no abonados con fechas arbitrarias.
- Renovaciones masivas, recordatorios automáticos e informes avanzados.
- Historial completo de versiones editoriales.

Los cobros automáticos y pasarelas permanecen fuera del alcance. El vencimiento seguirá controlándose en cada solicitud, sin cron obligatorio.

## 4. Fase 0: inspección realizada y trabajo local autorizado

### Informe de la inspección de este turno

| Comprobación | Resultado |
|---|---|
| Git | `main`, commit `e178628`, sin cambios. La rama `feature/snipers-campus` todavía no existe. |
| Conexiones | `DATABASE_URL` y `DIRECT_URL` apuntan a destinos remotos. No se abrió conexión con ellos. |
| Herramientas PostgreSQL | `pg_dump`, `pg_restore` y `psql` disponibles, versión 18.4. También está disponible `initdb`. |
| Instancia local | No quedó confirmada una instancia utilizable; la inspección de puertos no estuvo disponible. |
| Contenedores | Docker y Podman no encontrados entre los comandos disponibles. |
| R2 | No hay variables `R2_*` en el `.env` inspeccionado. |
| Backups existentes | Hay 27 archivos en `backups`; no se verificó su integridad ni restauración. |
| Plantilla de entorno | `.env.example` está ignorado y no está versionado. |

El script [backup.ts](</F:/Full Scalping WEB/scripts/backup.ts>) conserva los problemas detectados: lee directamente `.env`, elimina los parámetros de consulta de la conexión, exporta sólo datos y no propaga explícitamente el fallo de `pg_dump`.

**No se crearon ramas, editaron archivos, generaron respaldos ni ejecutaron migraciones.** La Fase 0 está autorizada por vos, pero su ejecución continúa pendiente porque el modo Plan activo impide esas modificaciones.

### Cambios locales previstos para Fase 0

1. **Preparar la rama.** Crear `feature/snipers-campus` desde el estado limpio, sin modificar `main`.

2. **Preparar un perfil local separado.** Incorporar una plantilla versionada sin secretos y un archivo local ignorado. No copiar credenciales productivas. Los comandos locales deberán validar el entorno efectivo que reciben Next.js, Prisma y las herramientas.

3. **Preparar PostgreSQL aislado.** Utilizar una instancia local dedicada, con directorio ignorado, escucha únicamente en loopback, credenciales propias y puerto 55432. Si el puerto está ocupado o la instancia no puede identificarse, detenerse sin reutilizarla.

4. **Bloquear accesos externos accidentales.** Deshabilitar R2, pagos, SMTP y demás servicios externos en el perfil local hasta contar con recursos de prueba independientes. No crear buckets ni modificar servicios remotos durante esta fase.

5. **Mejorar el backup.**
   - Seleccionar explícitamente el origen y rechazar destinos remotos por defecto.
   - Evitar comandos construidos mediante shell y no imprimir credenciales.
   - Conservar parámetros compatibles de conexión y TLS; separar los específicos de Prisma.
   - Exportar esquema y datos de la aplicación en formato custom.
   - Propagar errores y no anunciar éxito ante archivos incompletos.
   - Verificar el archivo y registrar tamaño, checksum y resultado, sin secretos.
   - Mantener todos los respaldos y archivos auxiliares fuera de Git.

   El formato custom permite inspección y restauración mediante las herramientas oficiales de PostgreSQL. [Documentación de respaldo](https://www.postgresql.org/docs/18/app-pgdump.html), [restauración](https://www.postgresql.org/docs/18/app-pgrestore.html).

6. **Probar herramientas exclusivamente en local.** Comprobar rechazo de conexiones remotas, credenciales ausentes, ejecutable inexistente, fallos de exportación y archivos incompletos. Probar respaldo/restauración con datos sintéticos en bases locales desechables, sin añadir tablas Snipers.

7. **Documentar migraciones pendientes.** Registrar el posible desfase entre esquema e historial, sin editar migraciones aplicadas, ejecutar `resolve`, usar `db push` ni realizar resets. Una baseline modifica cómo se interpreta el historial y debe tratarse por separado. [Prisma 7: baselining](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining).

### Riesgos que deben resolverse antes de modificar la base del proyecto

- Destinos reales de todas las conexiones, incluidas conexiones directas y shadow databases.
- Posibles variables heredadas que vuelvan a introducir configuración productiva.
- Respaldo verificable y restauración probada.
- Diferencias entre esquema declarado, migraciones y esquema instalado.
- Compatibilidad del cliente PostgreSQL con el servidor de origen.
- Dependencias del proveedor que un dump de la aplicación no incluya.
- Separación efectiva de credenciales y almacenamiento en previews.

La Fase 0 finalizará con un informe de archivos modificados, verificaciones ejecutadas, evidencia de restauración local y bloqueos pendientes. Un respaldo productivo no se dará por realizado ni validado mediante pruebas sintéticas.

## 5. Fases posteriores y criterios de aceptación

| Fase | Entregable | Condición de avance |
|---|---|---|
| 0 | Rama, entorno local, herramientas de respaldo y reporte. | Única fase actualmente autorizada para ejecución. |
| 1 | Modelos, migración aditiva preparada, permisos y catálogo inicial. | Aprobación explícita posterior al informe de Fase 0. |
| 2 | Coberturas, niveles, renovaciones, descuentos, cortesías y auditoría. | Pruebas financieras y de concurrencia aprobadas. |
| 3 | R2 privado, editor visual y experiencia del alumno/mentor. | Pruebas de archivos y autorización aprobadas. |
| 4 | Regresión, piloto y preparación del despliegue. | Aislamiento comprobado y autorización específica antes de intervenir producción. |

Las pruebas automatizadas deberán cubrir especialmente:

- Igual acceso académico para los tres niveles.
- Renovaciones de uno, dos y tres períodos con precios obtenidos del catálogo.
- Conservación de pagos y prepagos ante cambios de precio o nivel.
- Distinción entre nivel vigente, nivel futuro abonado y próxima renovación.
- Renovación de un plan inactivo ya asignado; rechazo de nuevas asignaciones.
- Descuentos y redondeos; cortesías sin pagos ficticios.
- Doble confirmación, idempotencia, concurrencia y previsualizaciones desactualizadas.
- Anulaciones y huecos sin acceso no abonado.
- Vencimiento, suspensión y baja, incluidos accesos directos a archivos.
- Separación entre editor, gestor, supervisor y administradores generales.
- Compatibilidad con matrículas, compras, sesiones y contenido actuales.

**No se avanzará a Fase 1 sin tu aprobación explícita. La autorización de Fase 0 ya está registrada; su ejecución requiere salir del modo Plan.**

# Snipers: eliminación sencilla, Etapa 1

Implementación local del 12/11/2026. Sin commit, despliegue, activación de Cron ni cambios productivos.

## Comportamiento

- **Eliminar archivo:** una confirmación con `ConfirmModal` desvincula y archiva definitivamente el recurso en la misma transacción. Deja de admitir nuevas firmas de acceso. Se registra una tarea `CLEAN_OBJECT` por cada objeto autorizado antes de contactar R2. La solicitud intenta procesar hasta dos objetos; lo restante conserva su tarea.
- **Eliminar clase:** acción editorial `CLASS_DELETE`, exclusiva de `SNIPERS_ADMIN`, con versión e idempotencia existentes. Retira la clase, desvincula sus recursos e invalida cargas pendientes. `deletedAt` impide restauración y la clase desaparece del listado editorial. Las filas y pruebas históricas permanecen.
- **Ocultar clase:** conserva `WITHDRAW`, ahora rotulado «Ocultar clase». No descarta ni limpia sus archivos. La publicación sigue usando el mecanismo anterior.
- Los enlaces de lectura ya emitidos mantienen su vigencia restante, de hasta 120 segundos.

## Borrado y reintentos

`processPendingDeletions` reutiliza `maintainStorageOnce` y `processCleanupOnce`. No prepara, completa ni valida cargas. Cada ejecución tiene hasta 20 objetos y un presupuesto de 45 segundos; la ruta declara 60 segundos. El presupuesto impide iniciar más visitas y aborta las peticiones remotas mediante el protocolo existente; no acredita cancelación remota ni un límite absoluto para SQL.

Utiliza el mismo advisory lock singleton que el worker anterior y conserva los leases por objeto. Dos invocaciones no procesan simultáneamente el lote. Si ya hay un worker existente con ese lock, el Cron informa ocupación y conserva las tareas.

Los errores de red conservan reintentos. Los errores remotos de permisos/configuración ahora también quedan en `WAIT_RETRY`, con código `STORAGE_CONFIGURATION`, sin acreditar ausencia. Los bloqueos de identidad o procedencia permanecen bloqueados: no se transforman automáticamente en permiso de borrado. Un fallo al inicializar el adaptador deja las tareas persistidas para otra visita.

Se conservan las verificaciones de procedencia, identidad de la clave, referencias, metadatos del objeto, multipart y comprobación posterior de ausencia. El listado remoto nunca autoriza claves nuevas. Una respuesta de permisos o conexión nunca se trata como un objeto ausente.

El esquema actual asigna cada recurso a una clase y restringe referencias compartidas. La limpieza además conserva cualquier objeto referenciado por otro recurso; no se agrega una biblioteca compartida en esta etapa.

## Migración necesaria

`20261113000000_snipers_deletion_stage1` añade:

- `SnipersClass.deletedAt`, con restricción y trigger que impiden restaurar una clase eliminada.
- `SnipersResource.deletionRequestedAt` y `deletionAfter`, con intención y ventana técnica inmutables.
- Una excepción en las dos funciones SQL que aplican retención. Solo los recursos eliminados explícitamente pueden reducir esa retención, nunca por debajo de su ventana técnica.

La ventana se registra antes de cancelar los productores e incluye firmas de partes aún vigentes y leases/ejecuciones remotas, con margen para solicitudes en curso. La cancelación usa `terminateUpload` y el fencing existente; un productor anterior no puede activar el recurso después del descarte.

No se borran tablas ni historial, no se cambian pruebas de bytes ni identidades, y no se editan migraciones cerradas. Los recursos que no fueron eliminados explícitamente conservan sus reglas anteriores. La migración no descarta ni acorta plazos de recursos existentes por sí sola.

El verificador de historial de lanzamiento reconoce la nueva migración y su checksum. La ampliación puntual de `scripts/snipers-launch/database.ts` conserva las modificaciones locales anteriores de ese archivo.

## Archivos de la etapa

- Datos: `prisma/schema.prisma`, la migración nueva y `scripts/snipers-launch/database.ts`.
- Eliminación: `src/lib/snipers/resource-discard.ts`, `storage-deletions.ts`, `storage-cleanup.ts`, `storage-management-gateway.ts`.
- Clases: `src/lib/snipers/content.ts`, `content-contracts.ts`, `gateway.ts`, `server.ts`.
- Interfaz: `src/components/snipers/ClassEditor.tsx`, `DiscardResourceButton.tsx`.
- Ejecutor: `src/lib/snipers/storage-deletion-cron.ts`, `src/app/api/snipers/storage-cleanup/route.ts`, `config/snipers-deletion-cron.vercel.example.json`.
- Verificación: `scripts/snipers-storage/discard.test.ts`, `discard-browser.cjs`, `build.ts` y este documento.

## Verificación local

PostgreSQL 18.6 exclusivo en `127.0.0.1:55432`, bases nuevas identificadas como `snipers_deletion_*` y `snipers_basic_*`. Los arneses verifican destino y rol y ejecutan `npm run db:backup` antes de escrituras estructurales y fixtures. R2 simulado; sin credenciales productivas. Las conexiones externas están bloqueadas en pruebas y build.

Comandos:

```text
node --import tsx --test --test-concurrency=1 scripts/snipers-storage/discard.test.ts
node --import tsx --test --test-concurrency=1 scripts/snipers-basic-files/files.test.ts scripts/snipers-launch/history.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --import tsx scripts/snipers-storage/build.ts
node scripts/snipers-storage/discard-browser.cjs
```

ESLint se ejecuta sobre los módulos, componentes, ruta y arneses modificados con `--max-warnings 0`.

Las pruebas de servicio cubren archivo vinculado, clase con dos archivos y carga incompleta, publicación/ocultación, preservación de evidencia histórica, fallos de red/permisos/respuesta perdida, ausencia confirmada, lote limitado, invocaciones concurrentes, referencias ajenas, origen inválido, cancelación de productor y reaparición tardía de bytes. El navegador verifica las confirmaciones, cancelaciones, persistencia SQL y navegación. El borrado físico se comprueba en las pruebas de servicio con R2 simulado; el navegador no recibe credenciales R2.

Resultados finales: **9/9 pruebas de eliminación** (ocho escenarios y su suite), **46/46 de regresión de cargas e historial**, **4/4 escenarios de navegador**, sin omisiones ni errores de página. TypeScript completo y ESLint sin errores. Build aislado aprobado, 38/38 páginas estáticas y hashes de fuente coincidentes. Se corrigió el retorno al listado tras eliminar una clase: no se refresca la ruta de la clase que acaba de quedar eliminada.

Los 22 archivos preexistentes ajenos a la ampliación del verificador conservaron sus hashes. En `scripts/snipers-launch/database.ts` se comprobó que, retirando exclusivamente las líneas añadidas por esta etapa, el contenido coincide con la copia previa. El flujo de subidas y las migraciones anteriores permanecen intactos.

Evidencias privadas en `.local/snipers/deletion-stage1/` y `.local/snipers/storage-management/build-evidence.json`. El build usa una copia aislada de fuentes sin archivos `.env` y comprueba sus hashes.

## Activación futura, solo con autorización

1. Integrar esta etapa con la rama productiva actual: el checkout local y el commit productivo inspeccionado anteriormente difieren en las reglas de retiro. No sustituir esa rama por este checkout sin conciliar sus cambios.
2. Obtener un backup verificado del destino productivo con el perfil existente autorizado; revisar y aplicar la migración nueva mediante el procedimiento habitual. Las pruebas locales no acreditan su aplicación remota.
3. Publicar la aplicación correspondiente. Para el ejecutor, configurar en Vercel `CRON_SECRET` aleatorio y privado y `SNIPERS_STORAGE_CLEANUP_ENABLED=true`; conservar `SNIPERS_ENABLED=true` y el grupo R2/SQL productivo correcto. No habilitar las banderas del worker de cargas.
4. Incorporar la entrada del archivo de ejemplo a la configuración real de Vercel. Es diaria a las 06:00 UTC (03:00 Argentina; el plan puede introducir variación de horario). El ejemplo no activa nada por sí solo.
5. Comprobar autenticación, primera ejecución y resultados SQL/R2 de tareas autorizadas. `processed` cuenta visitas, no borrados confirmados. Verificar `SUCCEEDED`, ausencia y errores pendientes.

Con Cron diario, un fallo puede esperar a otra ejecución diaria. Las tareas sobreviven a pestañas cerradas y reinicios de la aplicación. Un fallo persistente de credenciales requiere corrección operativa; el mentor no tiene que conservar una sesión ni reintentar manualmente.

## Límites de Etapa 1

- Se conserva íntegro el flujo de subida con temporales, definitivos, validaciones por etapas y sus estados.
- Se conservan las revisiones posteriores de escrituras `IN_FLIGHT`/`UNCERTAIN`, incluso después de observar ausencia. Su intervalo de siete días es una revisión técnica heredada, no una conservación para restauración.
- Los temporales de cargas exitosas no descartadas mantienen su retención anterior de 24 horas. Retirarla junto con las copias corresponde a la Etapa 2.
- No se inventaría ni elimina automáticamente un objeto físico ajeno al registro SQL. Los siete pendientes y los 378,06 MB productivos siguen requiriendo conciliación y autorización específicas; esta etapa no afirma espacio recuperado.

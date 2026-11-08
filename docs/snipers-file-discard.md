# Descarte administrativo de archivos privados

08/11/2026. Implementación local, sin migraciones ni cambios productivos.

## Comportamiento

- Una operación `ADMIN_RESOURCE_DISCARD` por `resourceId`, con sesión validada y permiso `SNIPERS_ADMIN` comprobados en servidor. En la integración productiva usa un recibo estricto v6 en `SnipersAuditEvent`, con actor, recurso, clase, definitivo/fecha de retiro cuando corresponden, hash del comando e ID idempotente. Los recibos v5 de retiro ya publicados permanecen válidos. Un reintento con el mismo ID devuelve el resultado anterior; otro actor o comando no puede apropiarse del recibo.
- Un rechazado pasa a `ARCHIVED` conservando `FAILED`, el código de error, los trabajos y las fechas de las copias. Un verificado sólo puede descartarse si no está vinculado ni tiene productores pendientes.
- Para una carga pendiente se esperan leases y ventanas de ejecución vigentes. Después se usa `terminateUpload` dentro de la misma transacción serializable y con el orden de locks existente. La cancelación confirmada en SQL impide continuar/activar el productor anterior. No se acredita un abort remoto ni una eliminación física desde esta operación.
- Los archivos vinculados permanecen protegidos, también en borradores y clases archivadas. Hay que desvincularlos primero.
- Los recursos archivados desaparecen del editor y de la lista habitual. Se consultan en el filtro **Eliminados** de Administración de Archivos; la paginación conserva el filtro. El inventario y las estadísticas globales siguen incluyendo el historial.
- El botón compartido usa `ConfirmModal`, conserva el ID del intento si se pierde la respuesta y permite recuperar la operación. El editor no sobrescribe cambios locales de contenido al actualizar la lista.

## Protocolo de limpieza

No se agregó un camino directo de borrado: `maintainStorageOnce` crea/reactiva los trabajos y `processCleanupOnce` conserva exclusividad para borrar objetos. El descarte no inicializa R2.

La excepción para definitivos activados exige que su recurso esté explícitamente descartado mediante el recibo administrativo, archivado, desvinculado y retirado, y que no existan referencias de otros recursos. El limpiador valida el contrato/hash del recibo, además de la procedencia original. Repite elegibilidad y fencing antes y después de cada petición remota. Archivar una clase o encontrar un recurso históricamente archivado, sin descarte explícito, no habilita borrar su definitivo.

Se preservan `finalObjectId`, `objectKey`, `activatedAt`, las pruebas de bytes y el historial permanente. No se borran filas.

Se mantienen los plazos actuales: 24 horas para temporales exitosos y ciertos candidatos; siete días para rechazados, cancelaciones y definitivos activados retirados según las reglas actuales. Descartar no modifica fechas de objetos ya retirados. El definitivo que se retira por primera vez obtiene su plazo de siete días. No se acortan ni reinician retenciones.

Las escrituras `IN_FLIGHT`/`UNCERTAIN` siguen requiriendo revisiones posteriores incluso después de observar ausencia. Se conservan los reintentos a 15 minutos, sondeos posteriores a siete días, leases de 60 segundos, heartbeat, deadlines e incertidumbre. Los bloqueos de procedencia/configuración no se reabren automáticamente.

## Ejecutor periódico: evidencia y configuración pendiente

Investigación acotada de sólo lectura del proyecto Vercel `psicotrading-academy`:

- Production READY: `dpl_CqfRMFDYN9DuApYVPgSg3w8RXHD4`, commit `fba0d112f7e78e6a5c4d109075408815f03edac5`.
- El inventario de nombres de variables productivas, sin descifrar valores y con cero variables ocultas informadas, no incluye `SNIPERS_STORAGE_CLEANUP_ENABLED`, `SNIPERS_UPLOAD_PROCESSOR_ENABLED`, `SNIPERS_FILE_VALIDATION_ENABLED` ni `SNIPERS_PROCESSOR_MODE`.
- La búsqueda de logs `cleanup` en la ventana devuelta por Vercel, 08/11/2026 03:52–04:42 UTC, no devolvió resultados. Esto no prueba ausencia de un ejecutor externo.
- El árbol del commit desplegado contiene `scripts/phase3b2b/worker.ts` y `config/snipers-upload-processor.service`; no contiene `vercel.json`, `vercel.ts`, workflows de GitHub ni archivos con `cron` en el nombre. Esto acredita una definición versionada, no una unidad instalada.
- El conector no devolvió el árbol de archivos del deployment (404). No se usó esa respuesta para concluir que no existe un programador. Sus vistas de proyecto/deployment no permitieron certificar una configuración de cron externa al repositorio.
- No hay acceso acreditado a un host systemd ni evidencia de su servicio en ejecución. No se consultó la base productiva, no se recuperaron secretos y no se cambió configuración.

**Estado: automatización productiva no acreditada.** No se afirma que la limpieza esté activa.

Se preparó un modo exclusivo en el mismo worker y con el mismo lock singleton. Mantiene el ciclo existente: selección de mantenimiento cada minuto y ejecución de trabajos elegibles, sin depender de visitas a la pantalla. En modo `cleanup` nunca se llama a preparación/completado de cargas ni a validación, incluso si sus banderas anteriores están activadas por error. No se inicializa el analizador.

Pasos pendientes, únicamente para un operador con acceso y tras autorización productiva:

1. Identificar si ya está instalado el servicio `snipers-upload-processor.service` o un ejecutor equivalente que llame a este worker. Verificar su `ExecStart`, directorio de trabajo y `EnvironmentFile`. El archivo versionado apunta a un perfil **de prueba**; no reutilizarlo como perfil productivo sin comprobar el destino. No instalar otro servicio ni crear un VPS por defecto.
2. Tras aprobar/publicar esta versión por el procedimiento habitual, configurar **en el perfil privado de ese ejecutor existente**:

   ```dotenv
   SNIPERS_PROCESSOR_MODE=cleanup
   SNIPERS_STORAGE_CLEANUP_ENABLED=true
   SNIPERS_UPLOAD_PROCESSOR_ENABLED=false
   SNIPERS_FILE_VALIDATION_ENABLED=false
   ```

   Conservar su conexión PostgreSQL y grupo único de credenciales R2 del entorno correcto. Cambiar estas variables sólo en Vercel no inicia el script: no hay ruta cron nueva en esta entrega.
3. Reiniciar el ejecutor existente mediante su administrador habitual. Verificar el mensaje de inicio `modo sólo limpieza`, la continuidad del proceso y sus visitas periódicas. El singleton impide que dos instancias del mismo worker operen simultáneamente.
4. Comprobar trabajos `CLEAN_OBJECT`, fechas y eventos `CLEANUP_QUIESCENT`/`CLEANUP_RETRY` correspondientes. El mensaje de visita y el booleano del procesador **no acreditan borrado**. Si todos los objetos siguen en conservación, esperar su elegibilidad; no acortar plazos para obtener evidencia.
5. Si no existe ejecutor reutilizable, detener la activación y decidir el programador sobre la infraestructura disponible. Esta entrega no instala servicios permanentes ni declara resuelta esa dependencia externa.

## Archivos de implementación

- Servicio/contratos: `src/lib/snipers/resource-discard.ts`, `storage-management-contracts.ts`, `storage-management-gateway.ts`, `src/app/actions/snipers-storage.ts`.
- Protección/consultas: `src/lib/snipers/resource-retirement-proof.ts`, `resource-retirement.ts`, `storage-management.ts`, `content.ts`. La integración reutiliza `storage-cleanup.ts` sin modificarlo respecto de producción; no incorpora el predicado paralelo `storage-protection.ts` del commit original.
- Interfaz: `src/components/snipers/DiscardResourceButton.tsx`, `ClassEditor.tsx`, `StorageManagement.tsx`; páginas de edición de clase y gestión de archivos.
- Ejecución: `scripts/phase3b2b/worker.ts`, `worker-cycle.ts`. La plantilla pública `config/snipers-uploads.env.example` corresponde a esta mejora, pero queda fuera del commit de cierre por la restricción de no incluir archivos de entorno.
- Validación: `scripts/snipers-storage/discard.test.ts`, `discard-browser.cjs`, `actions.test.cjs`, `build.ts`.

## Validación local

PostgreSQL local aislado en `127.0.0.1:55432`, base `snipers_dev`, rol restringido y versión verificados por el guard existente. Backup mediante `npm run db:backup` antes de los cambios y desde cada arnés que escribe fixtures. R2 simulado; sin objetos reales.

Comandos reproducibles desde el repositorio, con esa instancia local disponible:

```text
node --import tsx --test --test-concurrency=1 scripts/snipers-storage/discard.test.ts scripts/snipers-storage/actions.test.cjs
node --import tsx --test --test-concurrency=1 scripts/snipers-storage/management.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js <archivos afectados> --max-warnings 0
node --import tsx scripts/snipers-storage/build.ts
node scripts/snipers-storage/discard-browser.cjs
```

El build usa el arnés existente: copia aislada de fuente/configuración pública, sin perfiles privados, fuentes offline y red limitada a loopback. Comprueba hashes de los archivos implementados; el navegador exige probar esa misma versión. Resultados finales y capturas en `.local/snipers/storage-management/`.

Resultados: **9/9 escenarios nuevos de servicio**, **11/11 regresiones del limpiador existente** y prueba de acciones públicas con NextAuth/JWE aprobadas. **5/5 escenarios de navegador**, sin errores de página y sin desbordamiento horizontal móvil. TypeScript y ESLint sin errores; build final aprobado con `sourceUnchanged=true`. Se cubren rechazados, verificados desvinculados, vinculados, carreras de vinculación/descarte, lease vigente/vencido, cancelación por otro administrador, recibos repetidos, filtros, retenciones, pérdida de respuesta, reintentos y reaparición tardía de objetos inciertos. El ciclo exclusivo de limpieza usa trabajos reales locales y R2 simulado; falla la prueba si intenta transferir o validar.

Los servidores de navegador se cerraron. PostgreSQL estaba detenido al comenzar; se volvió a detener después de verificar cero conexiones de otros clientes. Las capturas finales de confirmación e historial móvil se inspeccionaron visualmente.

No se modificaron membresías, pagos, esquema Prisma, migraciones, reglas de R2 ni cambios locales ajenos. El cierre posterior autorizado se limita a un commit local de código, pruebas y documentación, excluyendo archivos de entorno. Sin push, merge, deploy ni activación productiva de la limpieza.

## Integración aislada sobre producción

Base comprobada mediante `git fetch --no-tags origin main` y el deployment productivo READY: `fba0d112f7e78e6a5c4d109075408815f03edac5`, rama remota `main`. El `main` local del checkout original está 20 commits atrás; no se modifica ni se usa como base. Se aplica exclusivamente `da2bc95936fc7e9165930ed37ff617e6d5f5ea04` en `release/snipers-file-discard`, worktree `.local/snipers/release-file-discard`.

Producción ya incluye retiro definitivo, ausente de la base de aquel commit. Se resuelven únicamente esos conflictos: se mantienen las acciones y los contratos v5 anteriores, se comparte la transición SQL del definitivo (identidad, locks, operaciones pendientes, timestamp idéntico y conservación), y el reconocimiento estricto de retiro acepta además el recibo v6 de descarte. El limpiador publicado mantiene sus comprobaciones y su protocolo. La interfaz pasa a la acción única aprobada. No se fusiona la rama de desarrollo completa.

Validación de la versión integrada: TypeScript y ESLint sin errores; build Next.js 16.2.6 aprobado con fuentes offline, entorno local y guard de red limitado a loopback. Dependencias y esquema idénticos a producción; se reutiliza el cliente Prisma generado compatible, sin regenerarlo sobre dependencias compartidas ni ejecutar migraciones. El build conserva hashes de la fuente en `.local/snipers/file-discard-integration/build-evidence.json`.

Pruebas focalizadas sobre los módulos del worktree, con su propio tsconfig: 9 escenarios del descarte, 8 del retiro ya publicado y la prueba de acciones públicas autenticadas, todos aprobados (20 entradas TAP incluyendo grupos). Cubren también entrega privada de un archivo no retirado, publicación/vinculación, recibos anteriores, concurrencia y reintentos. Los módulos de cargas, validación MP3/M4A/PDF y la corrección C2PA no cambian respecto de `fba0d112`; tampoco pagos, membresías, Prisma, dependencias ni archivos de entorno/configuración productiva.

Publicación preparada por el mecanismo Git ya observado en Vercel (`source=git`, `githubCommitRef=main`, proyecto `psicotrading-academy`). Tras aprobación explícita, volver a comprobar el tip remoto y publicar exclusivamente la rama integrada sobre `main` mediante avance rápido, sin force: `git push origin release/snipers-file-discard:main`. Ese push puede iniciar automáticamente el build/deploy productivo de Vercel. No ejecutar además un deploy por CLI ni modificar variables. Si `main` cambió, detener ese paso y actualizar la integración antes de publicar.

Esta preparación no realiza push ni deploy, no abre una PR remota, no activa el worker y no opera sobre R2 productivo. La solicitud de aprobación corresponde a la instrucción explícita del usuario de detenerse antes de publicar.

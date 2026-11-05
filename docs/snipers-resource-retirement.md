# Retiro definitivo de MP3/PDF privados de Snipers

Implementación local sobre `origin/main` publicado: `a1e8a2ee3fdaa5647b49d5bf7050d7956f07d3b7`.
Worktree: `.local/snipers/work-resource-retirement`, rama `feature/snipers-resource-retirement`.

## Transición y límites

No requiere Prisma ni migraciones. Se reutilizan `SnipersResource.ARCHIVED`, `archivedAt`, el retiro irreversible del objeto definitivo (`retiredAt`), sus plazos existentes y `SnipersAuditEvent.FILE_FOUNDATION_CHANGED`. Se mantienen el definitivo seleccionado, su clave, activación, checksum, prueba de bytes y procedencia. No se simula que el definitivo sea un objeto temporal.

La operación administrativa sólo acepta un recurso verificado y desvinculado, con origen e integridad acreditados y sin productores pendientes ni leases de limpieza activos. Archivar o despublicar una clase no desvincula sus archivos. El modelo vigente asigna cada recurso a una sola clase: no existe una asociación de varias clases que pueda omitirse. Además se comprueban referencias de otros recursos a sus objetos. Una asociación a otra clase es rechazada por el servicio existente y la identidad inmutable de SQL.

El retiro se confirma bajo autorización `SNIPERS_ADMIN`, transacción serializable y orden de locks existente: clase → recurso → carga → objetos → trabajos. Compite con la vinculación y la entrega bajo esos mismos locks. El estado archivado impide nuevas vinculaciones y nuevas entregas mediante la prueba compartida de disponibilidad existente. Los enlaces firmados previamente pueden conservar su validez hasta dos minutos; la retención de siete días permanece intacta.

La copia final conserva al menos siete días desde la solicitud y cualquier plazo previo mayor. No se fuerza un borrado durante la retención. Archivos archivados sin intención administrativa explícita siguen protegidos; los bloqueos de integridad, procedencia o configuración tampoco se omiten.

## Una operación para ambas pantallas

`requestSnipersResourceRetirement` es la única mutación nueva, compartida por el inventario y la edición de clase mediante `ResourceRetirement`. Acepta exclusivamente `{operationId, resourceId}`. El servidor selecciona como máximo una copia elegible y conserva esa selección en un recibo estricto v5 junto al actor, definitivo y fecha de retiro. El recibo v4 de limpieza sigue identificando exactamente el objeto y su generación inicial; se conserva toda la auditoría técnica v3. Repetir una solicitud sólo recupera esa visita, nunca elige una copia distinta ni reabre una visita terminada. Otra ejecución explícita tiene un nuevo ID y vuelve a comprobar las condiciones.

El limpiador existente es la única vía destructiva. Sólo la prueba completa del retiro administrativo permite liberar la referencia histórica del propio recurso; una referencia diferente sigue bloqueando. La selección de mantenimiento es una preselección, no una autorización: se valida de nuevo bajo locks antes de programar, reclamar y ejecutar cada llamada remota. Se conservan 30 segundos por visita, 10 por petición, leases de 60 segundos, heartbeat y recuperación existentes.

Las dos páginas ya tienen `maxDuration=60`; no se cambia la duración global ni la configuración productiva. No hay nuevas dependencias, variables, servicios ni infraestructura.

La interfaz usa `ConfirmModal`, distingue retiro de desvinculación y advierte que el borrado completado es irreversible. Muestra protegido, disponible para retirar, pendiente, en curso, bloqueado y eliminado. El último estado exige ausencia persistida de todas las copias, trabajos concluidos y ausencia de sondeos pendientes por escrituras inciertas. Una respuesta perdida conserva el intento en `sessionStorage`, recuperable desde ambas pantallas. No se interpreta `ok` del comando ni el booleano del procesador como eliminación completada.

## Limpieza periódica: comprobación de sólo lectura

Los temporales exitosos mantienen su retención mínima de 24 horas y los horizontes de firmas pendientes; los demás casos conservan sus reglas existentes. Cumplir la retención no ejecuta un proceso por sí solo.

El único bucle periódico identificado en este repositorio continúa en `scripts/phase3b2b/worker.ts`: requiere `SNIPERS_UPLOAD_PROCESSOR_ENABLED=true`; `SNIPERS_STORAGE_CLEANUP_ENABLED=true` habilita mantenimiento cada minuto y llamadas al limpiador. La web sólo realiza visitas administrativas explícitas. No hay configuración de cron ni workflow de ejecución en el árbol publicado.

Se consultaron el deployment Production READY `dpl_Ecc61DtZX9HYeGtKhKZTZDqnoyYb`, su SHA publicado, el proyecto `psicotrading-academy` y su inventario de variables mediante Vercel, sin descifrar secretos. No aparecen las banderas de limpieza/procesador/validación, y el conector informa cero variables productivas ocultas. La respuesta del proyecto no expone un campo de crons; no se interpreta esa omisión como prueba de ausencia de cualquier ejecutor.

**Clasificación: no verificable con los accesos disponibles; sin ejecutor periódico identificado en Vercel.** No hay evidencia nueva de trabajos o eventos reales ni acceso verificado al inventario SQL productivo. Un posible ejecutor externo y un eventual atraso no pueden confirmarse. No se activa automatización ni se realizan eliminaciones productivas. Hasta verificar un ejecutor operativo, completar o reintentar el retiro requiere una visita administrativa cuando corresponda.

## Archivos principales

- `src/lib/snipers/resource-retirement{,-contracts,-proof}.ts`: transición, recibo, estado y autorización específica del retiro.
- `src/lib/snipers/storage-management.ts`, `storage-cleanup.ts`: mismo read model y protocolo, con selección exacta y reconocimiento del retiro acreditado.
- `src/lib/snipers/content.ts`: comparte la prueba inmutable; conserva las condiciones de disponibilidad para vinculación/entrega.
- Gateway y acciones `snipers-storage`: sesión, autorización y operación común.
- `ResourceRetirement.tsx`, `StorageManagement.tsx`, `ClassEditor.tsx` y página de edición: controles administrativos compartidos.
- `scripts/snipers-storage/retirement*`, `actions.test.cjs`: fixtures históricos, aceptación focalizada, acciones con NextAuth/JWE y navegador con SDK contra HTTP local.

## Validación local

PostgreSQL 18.6 local (`127.0.0.1:55432/snipers_dev`), R2 simulado, respaldo verificado antes de cada corrida con escrituras. Las fixtures históricas se crean con fechas iniciales anteriores y pasan por el validador y todas las restricciones SQL vigentes: no se reducen plazos persistidos ni se incorporan relojes de prueba al código productivo.

Pruebas focalizadas: autorización directa y NextAuth/JWE, referencia de clase en borrador/publicada/archivada, rechazo de asociación a otra clase, retiro explícito auditado, retención, prohibición de revincular/entregar, otros recursos intactos, ausencia de intención o recibo incompleto, selección exacta, concurrencia con vinculación, replay, leases, transferencia pendiente, error/timeout de R2 y reintento con ausencia persistida. Las fases anteriores no se auditan nuevamente.

Evidencia local en `.local/snipers/validation/` dentro del worktree: `tests.json`, `tsc.log`, `build.log`, trazas de red restringidas a loopback y comprobación visual. El build usa el worktree completo, sin perfiles productivos, PostgreSQL en sólo lectura y fuentes offline; conserva el código y las dependencias de producción. La advertencia de múltiples lockfiles corresponde al worktree anidado.

Resultados: **10/10 pruebas aprobadas**, TypeScript y ESLint sin errores, build de producción local correcto. El manifiesto de funciones confirma 60 segundos en las dos rutas. Navegador: **5 escenarios aprobados**, sin errores de página ni desbordamiento móvil; incluye pérdida de respuesta y recuperación tras recarga tanto en la clase como en el inventario, y ausencia de DELETE duplicado. Capturas: `retiro-confirmacion.png`, `retiro-clase-pendiente.png`, `retiro-eliminado.png` y `retiro-mobile.png`; detalle en `browser.json` y `final-evidence.json`.

La validación se ejecutó desde el repositorio original para reutilizar el perfil y la identidad verificada del PostgreSQL local, apuntando `TSX_TSCONFIG_PATH` al `tsconfig.json` del worktree. Los comandos de aceptación son `node --import tsx --test --test-concurrency=1` con `retirement.test.ts` y `actions.test.cjs` de este worktree; el navegador ejecuta `retirement-browser.cjs`. TypeScript usa `--noEmit --incremental false`; el build, `next build --webpack`, con el entorno aislado y guardia de red existentes. No se copian variables productivas al worktree.

Los 19 archivos ajenos del repositorio original conservan sus hashes SHA-256, estado Git y HEAD. Los servidores HTTP de prueba se cerraron; PostgreSQL se devuelve al estado detenido inicial después de comprobar que no quedan otras conexiones locales.

No se actualiza `PSICOEMOTRADING_ESTADO.md`, ni se crea commit, push, merge o despliegue.

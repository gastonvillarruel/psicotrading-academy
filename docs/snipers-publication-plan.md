# Publicación conjunta de Snipers, Etapas 1 y 2

Solo preparación local. No autoriza push, integración, migraciones, variables, despliegue, pruebas con escritura productiva ni activación del Cron.

## Condiciones comprobadas

- Etapa 1: `21d67afa1106059e6ec3110be261f1dbdae9d9d1`; Etapa 2: `bfe0b806c184e8076479b1b1394ba79a92099f44`, cerradas en `feature/snipers-campus`.
- La referencia `origin/main` se actualizó mediante fetch y permanece en `0a1b7f8869521dd9a100b52c508d917e731132b2`. El `main` local permanece intacto en `e178628a`.
- La integración local está en `integration/snipers-files-v5-v6`, basada en ese `origin/main`, sin commits nuevos. Conserva retiro v5 y descarte v6 productivos, admite los descartes v5 de desarrollo y emite descartes v6. Véase `docs/snipers-integration-v5-v6.md` para validación y archivos. No aplicar nuevamente los dos commits encima del resultado conciliado.
- La migración de Etapa 2 depende de la de Etapa 1. Ninguna modifica claves R2 ni requiere volver a subir los archivos existentes.
- El Cron se corrigió para excluir históricos anteriores sin una nueva eliminación explícita. No se autoriza una limpieza masiva ni un inventario correctivo del bucket.

## Procedimiento mínimo, tras autorización

1. **Cerrar y publicar la integración revisada.** Tras autorización para crear el commit, revisar y confirmar el diff preparado en la rama aislada. Actualizar referencias antes de integrar remotamente; si main avanzó desde `0a1b7f88`, conciliar únicamente esas diferencias y repetir las comprobaciones afectadas. Preservar el árbol de desarrollo y sus cambios ajenos. Publicar el resultado conciliado, sin volver a aplicar los commits de las etapas sobre él.

2. **Respaldar PostgreSQL del destino exacto.** Usar el acceso y la herramienta de backup autorizados del operador; no depender de los scripts privados/modificaciones ajenas que quedaron fuera de estos commits. Comprobar proyecto, base, rol y TLS; conservar archivo, tamaño, hash y listado verificable con `pg_restore --list`, o evidencia equivalente de un respaldo restaurable. No migrar si no se acredita el respaldo. Un backup SQL no respalda los objetos R2.

3. **Comprobar pendientes y migrar.** En una ventana controlada sin nuevas cargas, verificar historial/checksums y que las únicas migraciones nuevas pendientes sean:
   - `20261113000000_snipers_deletion_stage1`.
   - `20261114000000_snipers_single_object`.
   Aplicarlas mediante el procedimiento Prisma habitual en ese orden. Verificar finalización y esquema; detenerse ante otros pendientes, lock timeout o diferencias de checksum. No resolver ni reparar automáticamente el historial. No activar todavía limpieza automática.

4. **Publicar la aplicación conciliada.** Desplegar exactamente el commit revisado, con Cron deshabilitado durante la comprobación inicial. Confirmar la versión activa. Comprobar que no haya un worker antiguo incompatible procesando las cargas nuevas o reteniendo el singleton; no instalar otro ejecutor.

5. **Verificar el producto con material de prueba.** Como mentor autorizado, crear una clase de prueba, subir MP3/M4A/PDF y comprobar progreso, validación y un único objeto por archivo nuevo. Publicar y probar un alumno autorizado y otro sin acceso; ocultar y comprobar que retira acceso sin borrar objetos; volver a publicar. Probar eliminar un archivo vinculado y eliminar la clase con una carga pendiente. Usar solo ese material para las eliminaciones. Comprobar tiempos con un archivo grande admitido antes de afirmar que los 250 MiB funcionan en el alojamiento real; las pruebas anteriores fueron locales.

6. **Comprobar los dos archivos anteriores.** Sin desvincular, ocultar ni eliminar su clase, verificar reproducción/descarga del M4A «La Arquitectura del Trader» y descarga/apertura del PDF «Reingeniería del Trading», mediante acceso académico autorizado. Sus claves deben seguir siendo las originales.

7. **Configurar y activar el Cron diario.** Tras aprobar las comprobaciones anteriores, configurar en Vercel un `CRON_SECRET` privado y aleatorio y `SNIPERS_STORAGE_CLEANUP_ENABLED=true`, conservando el grupo SQL/R2 productivo correcto. Incorporar la entrada de `config/snipers-deletion-cron.vercel.example.json` a la configuración efectiva: `GET /api/snipers/storage-cleanup`, `0 6 * * *` UTC, aproximadamente 03:00 Argentina. Publicar la configuración por el flujo autorizado. No habilitar el worker de subidas ni agregar servicios.

8. **Acreditar ejecución y reintento reales.** Verificar rechazo sin Bearer correcto y una invocación autenticada; después observar al menos una ejecución diaria registrada por Vercel, sin una pestaña abierta. Usar una eliminación de material de prueba cuyo trabajo quede diferido por la ventana técnica. Comprobar transición del trabajo, intento, ausencia confirmada, desaparición R2 y multipart vacío cuando corresponda; `processed` solo cuenta visitas.
   Para acreditar específicamente `WAIT_RETRY`, observar una tarea de prueba que haya fallado realmente. Si no ocurre ningún fallo, preparar bajo autorización SQL específica una simulación acotada de `WAIT_RETRY` sobre un único trabajo pendiente de ese material, sin cambiar claves, pruebas, leases, contadores, protecciones ni acortar plazos. Documentar que se simula el estado, no un fallo real de R2. Verificar que una ejecución posterior lo retoma y completa. No provocar fallos globales de credenciales o permisos ni considerar una respuesta 200 como prueba de reintento.

9. **Contingencia.** Ante fallos significativos, deshabilitar el Cron y detener el uso afectado antes de nuevas operaciones destructivas. Preferir corrección hacia adelante. Si se revierte la aplicación, usar una versión compatible con `singleObject` cuando ya existan cargas nuevas: el código anterior puede no servirlas correctamente. Conservar las migraciones aditivas; no ejecutar down migrations automáticas. Una restauración SQL exige una decisión separada y conciliación de escrituras posteriores; no recupera objetos R2 eliminados ni debe resucitar referencias a archivos ausentes.

## Autorizaciones y bloqueos

La conciliación y validación local están documentadas en `docs/snipers-integration-v5-v6.md`. No se acredita aquí acceso productivo, respaldo restaurable, historial remoto de migraciones, rendimiento R2/Vercel ni un Cron activo. Son puertas de verificación para el operador, no fallos productivos supuestos.

La incompatibilidad de contratos quedó resuelta en la integración local. La exclusión de históricos del Cron se conserva y se verifica con comprobantes productivos v5/v6 simulados localmente. No se identificaron bloqueos técnicos locales pendientes.

Requieren autorización posterior: publicación/integración remota, backup con lectura productiva, migraciones, despliegues, variables/Cron y pruebas de creación/eliminación sobre material productivo de prueba. La preparación de una simulación SQL de reintento requiere aprobación específica de su consulta e ID objetivo. La conciliación y limpieza del inventario histórico permanecen fuera de esta publicación.

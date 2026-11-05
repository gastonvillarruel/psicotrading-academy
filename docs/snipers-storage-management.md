# Gestión administrativa de archivos privados de Snipers

Implementación y validación local: 05/11/2026, Argentina. Sin despliegue ni cambios productivos.

## Implementación

- Ruta `/mi-campus/snipers/gestion/archivos`, enlace visible sólo para `SNIPERS_ADMIN` y autorización repetida en el servidor. No depende del rol general `ADMIN` del campus.
- Páginas de 25 recursos, con utilización, estado editorial y estado del archivo separados. El detalle explica protección, conservación, operaciones pendientes, elegibilidad, ejecución, incertidumbre y ausencia comprobada.
- Estadísticas globales del inventario: recursos, tamaño lógico declarado, objetos, bytes verificados, tamaños desconocidos, ausencia observada y recursos sin objetos. Los bytes verificados incluyen historial; no representan ocupación física ni facturación de R2.
- Limpieza individual, confirmada con `ConfirmModal`, por ID de objeto. No se admiten claves R2, selección masiva ni eliminación de definitivos protegidos.
- `maintainStorageOnce` admite un selector opcional de objeto; sin ese selector conserva su comportamiento de mantenimiento general. `processCleanupOnce` sigue siendo la única vía destructiva.
- Solicitud administrativa auditada con actor, ID idempotente y generación inicial, en un payload estricto v4 de `FILE_FOUNDATION_CHANGED`. Los eventos técnicos v3 permanecen intactos. Repetir una solicitud completada no abre otra visita; una solicitud interrumpida antes del procesamiento puede recuperarse.
- Los resultados se consultan en la base. El booleano del procesador no acredita éxito. El navegador conserva el intento incierto en `sessionStorage` para recuperarlo tras una recarga, sin almacenar claves ni URLs de R2.
- Duración configurada sólo en la página nueva: 60 segundos. El manifiesto generado de Next confirma ese valor.

### Corrección focalizada de deadlines

La prueba de una petición que nunca responde descubrió un problema en Node 22.14: la señal temporal inline de `AbortSignal.any([..., AbortSignal.timeout(...)])` podía perderse antes de vencer. Se reprodujo también fuera del protocolo: una señal temporal conservada abortaba y la señal inline combinada permanecía sin abortar.

El limpiador mantiene ahora sus controladores vivos mediante temporizadores explícitos y los libera al finalizar. Se conservan exactamente 30 segundos por visita, 10 por petición, lease de 60 segundos, heartbeat de 20 segundos y recuperación existente. No se cambiaron protección, retención, procedencia ni política de borrado.

## Archivos afectados

| Archivo | Cambio |
| --- | --- |
| `src/app/mi-campus/snipers/gestion/archivos/page.tsx` | Nueva pantalla y duración máxima |
| `src/app/mi-campus/snipers/layout.tsx` | Enlace exclusivo de administrador |
| `src/components/snipers/StorageManagement.tsx` | Inventario, detalle, confirmación y recuperación |
| `src/app/actions/snipers-storage.ts` | Acciones autenticadas de consulta y limpieza |
| `src/lib/snipers/storage-management-contracts.ts` | Entradas estrictas, DTOs y recibo administrativo |
| `src/lib/snipers/storage-management.ts` | Consultas, estadísticas y solicitud individual |
| `src/lib/snipers/storage-management-gateway.ts` | Sesión, bandera y frontera de dependencias |
| `src/lib/snipers/storage-management-server.ts` | Integración con NextAuth, pool y adaptador existente |
| `src/lib/snipers/storage-cleanup.ts` | Selector exacto, inspección compartida y deadlines |
| `scripts/snipers-storage/fixtures.ts` | Fixtures locales y R2 simulado |
| `scripts/snipers-storage/management.test.ts` | Seguridad, protocolo, concurrencia y estadísticas |
| `scripts/snipers-storage/actions.test.cjs` | Acciones públicas con NextAuth/JWE y SQL reales |
| `scripts/snipers-storage/build.ts` | Build aislado sin perfiles ni evidencias privadas |
| `scripts/snipers-storage/browser.cjs` | Navegador, SDK contra HTTP local y capturas |
| `docs/snipers-storage-management.md` | Esta entrega y su evidencia |

No se modificaron esquema Prisma, migraciones, políticas comerciales, permisos existentes, worker, adaptador R2 ni `PSICOEMOTRADING_ESTADO.md`. Se conservaron las modificaciones locales preexistentes; no se ejecutaron operaciones de Git que alteren ramas o historial.

## Verificación productiva de sólo lectura

Se consultó el proyecto Vercel `psicotrading-academy`, despliegue productivo `dpl_Tcr9PUKcpUHcE9yGea2HrpQuQ61o`, commit `4e23a0e48316a03684c4a279636db9335f60936b` de `main`.

- El código local del limpiador, su integración web de subidas y el worker coincidían con ese commit antes de esta mejora.
- `SNIPERS_STORAGE_CLEANUP_ENABLED` continúa controlando exclusivamente el bucle del worker existente. El flujo web de subidas no ejecuta limpieza automática. La acción manual de este MVP es independiente de esa bandera.
- El inventario completo de variables productivas consultado no incluía `SNIPERS_STORAGE_CLEANUP_ENABLED`, `SNIPERS_UPLOAD_PROCESSOR_ENABLED` ni `SNIPERS_FILE_VALIDATION_ENABLED`; el conector informó cero variables productivas ocultas. No se descifraron valores.
- La búsqueda acotada de logs `cleanup` del despliegue no devolvió resultados en la ventana informada por Vercel: 05/11/2026 17:23–18:13, hora argentina. Esto no prueba que no exista un ejecutor fuera de Vercel.
- La API de archivos del despliegue devolvió 404; no se usó esa respuesta para concluir que un archivo o ejecutor no existe.
- Se intentó consultar trabajos, eventos y pendientes con el transporte existente y una transacción explícita `READ ONLY`. El perfil privado no pudo abrirse (`EACCES`), antes de conectar. No se cambiaron permisos ni se eludió la restricción.

**Clasificación: no verificable con los accesos disponibles.** Hallazgo parcial: **sin ejecutor identificado en Vercel**. La actividad de un posible ejecutor externo y los trabajos/eventos/objetos pendientes productivos no pudieron verificarse. No hay evidencia suficiente para afirmar limpieza operativa ni cuantificar un atraso. Es un hallazgo independiente del MVP; no se agregó automatización.

No se cambiaron variables, no se activaron ejecutores y no se realizaron eliminaciones ni escrituras productivas.

## Validación local

PostgreSQL 18.6 en `127.0.0.1:55432`, base `snipers_dev`, rol restringido verificado. `npm run db:backup` se ejecutó antes de cada corrida que escribe sobre esa base. Las pruebas agregan fixtures identificados como locales; conservan el historial permanente.

Pruebas de servicio y acciones públicas: **13/13 aprobadas**, sin omisiones. Cubren sesión, roles, acceso directo, definitivos desvinculados/archivados, retención, procedencia, productores, leases, identidad, selección exacta, auditoría, doble ejecución, solicitudes interrumpidas, errores, paginación, estadísticas y tamaños desconocidos. La petición que nunca responde terminó en aproximadamente 10,4 segundos; una secuencia de peticiones válidas se cortó en aproximadamente 30,2 segundos. Ninguna acreditó ausencia.

Comandos reproducibles:

```text
node --import tsx --test --test-concurrency=1 scripts/snipers-storage/management.test.ts scripts/snipers-storage/actions.test.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/snipers/storage-management*.ts src/lib/snipers/storage-cleanup.ts src/app/actions/snipers-storage.ts src/app/mi-campus/snipers/gestion/archivos/page.tsx src/components/snipers/StorageManagement.tsx src/app/mi-campus/snipers/layout.tsx scripts/snipers-storage --max-warnings 0
node --import tsx scripts/snipers-storage/build.ts
node scripts/snipers-storage/browser.cjs
```

TypeScript y ESLint sin errores. El build directo del repositorio encontró `EPERM` al recorrer evidencias privadas de `.local`; se validó mediante copia aislada de `src`, `public` y configuración pública, sin `.env`, con fuentes offline y conexiones salientes restringidas a loopback. El arnés conserva hashes de los archivos implementados y exige que el navegador pruebe el mismo código.

Navegador sobre el build final: **7 escenarios aprobados**, sin errores de página. Se verificaron acceso y rechazo directo, 25 recursos por página y navegación sin duplicados, ausencia de botón para definitivos protegidos, cancelación de confirmación sin DELETE, SDK real contra HTTP local, pérdida deliberada de la respuesta y recuperación después de recargar sin repetir DELETE. El detalle conserva las otras copias del recurso y la vista móvil no tiene desbordamiento horizontal.

Los servidores HTTP de prueba se cerraron. PostgreSQL, inicialmente detenido, se devolvió a ese estado después de comprobar que no quedaban otras conexiones locales.

Evidencias y capturas en `.local/snipers/storage-management/`: `test-evidence.json`, `build-evidence.json`, `build.log`, `browser-evidence.json`, `browser-server.log`, `archivos-desktop.png`, `archivos-confirmacion.png`, `archivos-resultado.png` y `archivos-mobile.png`.

## Límites vigentes

- La limpieza es manual y requiere otra visita para reintentos o sondeos futuros; no se añadió cron, worker ni servicio externo.
- Los definitivos activados o seleccionados siguen protegidos. Los trabajos bloqueados no se reabren desde esta pantalla.
- No se realiza un inventario de objetos ajenos al registro SQL, ni se miden multipart facturables o consumo físico del bucket.
- La prueba visual usa datos locales, R2 simulado y sustitución offline de fuentes. No certifica permisos efectivos de R2 productivo ni un despliegue nuevo en Vercel.
- Sin migraciones nuevas, commit, push, merge ni deploy. La entrega se detiene para revisión local.

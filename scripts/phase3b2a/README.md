# Fase 3B-2A — Persistencia y contratos locales

Sólo fundación. No hay worker operativo, supervisor, R2, multipart real, analizadores,
URLs firmadas, reproductor ni limpieza remota. No hay nuevas acciones o rutas públicas.

## Entorno y preservación

- Rama `feature/snipers-campus`, HEAD `c9132806f52f5be499471b72e0ee6943a9bd94b9`.
- PostgreSQL ya preparado en `127.0.0.1:55432/snipers_dev`, rol `snipers_local`.
- Perfil existente `.env.snipers.local`, persistentemente `SNIPERS_ENABLED=false`.
- Reutiliza las guardas de Fases 0/1 y el preloader de red 3A, sin modificarlos.
- El lanzador verifica identidad, privilegios, rama, HEAD, checksums de la cadena,
  perfiles y hashes de todos los archivos anteriores salvo los tres cambios autorizados:
  esquema Prisma, ampliación de la prueba de auditoría y canonicalización del arnés 3A.
- `snapshot`, `migrate`, `test`, `regression` y `browser` respaldan mediante el comando
  existente. Se verifica independientemente tamaño y SHA-256 del dump contra el
  manifiesto; el procedimiento existente verifica formato custom y TOC. No se afirma
  una nueva restauración. Cada grupo de regresión y cada navegador tiene su backup.

## Reproducción

Usar sólo el lanzador. No ejecutar fixtures directamente ni fabricar variables de runner.
No ejecutar simultáneamente dos acciones que escriban datos.

```powershell
node node_modules/tsx/dist/cli.mjs scripts/phase3b2a/cli.ts check
node node_modules/tsx/dist/cli.mjs scripts/phase3b2a/cli.ts test
node node_modules/tsx/dist/cli.mjs scripts/phase3b2a/cli.ts regression
node node_modules/tsx/dist/cli.mjs scripts/phase3b2a/cli.ts build
node node_modules/tsx/dist/cli.mjs scripts/phase3b2a/cli.ts browser
node node_modules/tsx/dist/cli.mjs scripts/phase3b2a/cli.ts browser3b1
node node_modules/tsx/dist/cli.mjs scripts/phase3b2a/cli.ts typecheck
node node_modules/tsx/dist/cli.mjs scripts/phase3b2a/cli.ts lint
node node_modules/tsx/dist/cli.mjs scripts/phase3b2a/cli.ts validate
node node_modules/tsx/dist/cli.mjs scripts/phase3b2a/cli.ts diff
```

La baseline `.local/snipers/phase3b2a/baseline.json` ya existe y se creó antes de
editar Prisma. No repetir `snapshot`: utiliza creación exclusiva. Este lanzador no
inicializa una base nueva ni prepara producción.

La cadena local conserva `000`/`001`/`002` y agrega, en orden:

1. `003_snipers_phase3b2a`: delta generado + restricciones iniciales.
2. `004_snipers_phase3b2a_corrections`: corrección de funciones, incluida la referencia
   SQL ambigua descubierta por las pruebas, redondeo de lease y retenciones mínimas.
3. `005_snipers_phase3b2a_finalization`: coherencia diferida de resultados y fases.
4. `006_snipers_phase3b2a_retention`: extensiones de retención y fencing/reprogramación.
5. `007_snipers_phase3b2a_cleanup_guard`: bloqueo del destino y elegibilidad de limpieza.

Los cinco candidatos están en `prisma/snipers-review/`; no son migraciones productivas.
Los archivos ya aplicados no se reescriben. `migrate` copia por hash a la cadena ignorada
y usa exclusivamente la configuración experimental existente. Repetirlo sólo valida
y aplica deltas pendientes; no usa reset, `db push` ni resolve.

`prepare` sirve sólo antes de aplicar `003`. `harden` materializa las funciones de la
plantilla `constraints.sql` en `004` y rechaza una corrección distinta ya existente.
Los candidatos versionables y sus copias/checksums son la cadena reproducible completa;
la plantilla no reemplaza esa cadena ni incluye por sí sola los complementos `005`–`007`.

## Límites de contratos y pruebas

- `file-contracts.ts`: enums, límites, manifiesto, observaciones y auditoría estricta.
- `file-receipts.ts`: combinador interno, con autorización vigente antes de buscar
  recibo y conciliación después de rollback por unicidad. El callback sólo puede usar
  el `PoolClient` recibido; debe bloquear su agregado y no hacer I/O remoto ni BEGIN.
- El combinador no implementa comandos de carga, retiro o publicación. No está
  incorporado a la fachada HTTP. Un recibo histórico no prueba estado actual.
- El SQL exige SERIALIZABLE en tablas nuevas y cambios relacionales de recursos;
  conserva el fixture PENDING histórico bajo READ COMMITTED.
- La evidencia de bytes es sintética: estas pruebas certifican coherencia SQL, no
  lectura de objetos R2 ni ejecución de antivirus.
- Los fixtures confirmados permanecen; no se borra historia para repetir pruebas.
- El preflight aborta ante recursos históricos VERIFIED/ARCHIVED sin evidencia nueva;
  no los convierte ni repara automáticamente.
- La suite prueba SQL directo, FKs, CHECK, triggers, rollback al COMMIT, wait de locks
  observado en `pg_stat_activity`, takeover y CAS obsoleto con conexiones independientes.
- Las correcciones añaden write skew con escrituras en filas distintas, una barrera
  que fuerza `23505` real observado durante la conciliación, UUID entre dos editores
  autorizados, unicidad aislada y extensión vs claim de limpieza en ambos órdenes.
- El wrapper de observación del recibo sólo registra errores reales de `pg`: no
  fabrica resultados, conexiones, errores ni commits.
- El costo usa un recurso sintético con 1/10/50/100/200 generaciones y destinos
  retirados, siete muestras por nivel y mediana de comprobación/COMMIT diferido.
  Guarda datos crudos en `history-cost.json`; no es una prueba de capacidad productiva.
- Futuros cleaners deben bloquear objeto antes de trabajo, revalidar plazos y usar
  CAS de generación/token. Una extensión invalida el token anterior y reprograma el
  mismo trabajo. La coordinación de I/O remoto permanece fuera de esta subfase.

Evidencia ignorada en `.local/snipers/phase3b2a/`: baseline, SQL generado, logs rojos y
verdes, dumps de estructura y manifiestos de cada acción. El navegador preserva sus
artefactos anteriores antes de ejecutar las suites originales de 3A y 3B-1.

Detenerse después de esta subfase para auditoría independiente. Sin commit, push,
merge, despliegue ni autorización de 3B-2B–3B-2E.

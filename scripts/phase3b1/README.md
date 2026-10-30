# Fase 3B-1 — ejecución exclusivamente local

Entrega editorial: biblioteca, categorías, Tiptap, publicación, agenda Zoom y auditoría.
No incluye cargas, vinculación operativa de archivos, R2, multipart, antivirus ni worker.

## Requisitos y guardas

- Rama `feature/snipers-campus`, HEAD de cierre 3A `6d7d727edc40f5cfe47f598121e231c3bff823cf`.
- PostgreSQL dedicado iniciado manualmente: `127.0.0.1:55432/snipers_dev`, rol `snipers_local` limitado.
- Perfil existente `.env.snipers.local`, sin modificarlo y con `SNIPERS_ENABLED=false`.
- Estado de Fases 0–3A ya preparado. No usar estos comandos para inicializar producción.

Antes de la primera modificación, `snapshot` verifica instancia, rama y HEAD, ejecuta
`npm run db:backup -- --env-file .env.snipers.local` mediante el helper existente y
registra hashes protegidos, el dump completo de estructura y las 23 tablas anteriores
del campus. El archivo de baseline usa creación exclusiva: nunca se sobrescribe.

```powershell
node node_modules/tsx/dist/cli.mjs scripts/phase3b1/cli.ts snapshot
node node_modules/tsx/dist/cli.mjs scripts/phase3b1/cli.ts check
node node_modules/tsx/dist/cli.mjs scripts/phase3b1/cli.ts migrate
node node_modules/tsx/dist/cli.mjs scripts/phase3b1/cli.ts validate
node node_modules/tsx/dist/cli.mjs scripts/phase3b1/cli.ts diff
```

En este entorno la baseline ya existe; no repetir `snapshot`. `migrate` copia el
candidato canónico a `002_snipers_phase3b1` en la cadena ignorada y rechaza una copia
distinta. Las migraciones previas no se editan. No utiliza `db push`, reset ni resolve.

## Verificación

```powershell
node node_modules/tsx/dist/cli.mjs scripts/phase3b1/cli.ts test
node node_modules/tsx/dist/cli.mjs scripts/phase3b1/cli.ts build
node node_modules/tsx/dist/cli.mjs scripts/phase3b1/cli.ts browser
node node_modules/tsx/dist/cli.mjs scripts/phase3b1/cli.ts typecheck
node node_modules/tsx/dist/cli.mjs scripts/phase3b1/cli.ts lint
node node_modules/tsx/dist/cli.mjs scripts/phase2/cli.ts regression
node node_modules/tsx/dist/cli.mjs scripts/phase2/cli.ts test
node node_modules/tsx/dist/cli.mjs scripts/phase3a/cli.ts test
node node_modules/tsx/dist/cli.mjs scripts/phase3a/cli.ts browser
```

Las operaciones que escriben (`migrate`, `test`, `browser`) respaldan y verifican
antes de continuar. No ejecutar fixtures directamente ni fabricar marcas del runner.
No ejecutar dos suites con escrituras o dos navegadores simultáneamente.

El preloader de red de 3A se reutiliza sin modificarlo; la marca correspondiente se
inyecta sólo desde este lanzador después de verificar el contexto local. Rechaza
TCP/TLS fuera de loopback y las credenciales externas quedan vacías. Build utiliza
Webpack y respuestas locales para fuentes. El navegador usa Edge headless instalado,
Playwright local de 3A, puerto libre y PID del listener verificados; fuentes y banderas
públicas reciben respuestas locales. No se visita Zoom: se comprueba el redirect sin
seguirlo. La habilitación positiva sólo ocurre en procesos hijos de prueba.

La evidencia finita compara hashes protegidos y dump SQL antes/después. Sólo `migrate`
permite un cambio de estructura; en todo caso se conservan las 23 tablas anteriores.
Las pruebas son sintéticas `.invalid`; no se elimina su historial.

## Contratos y límites

- Todo comando editorial usa UUID y, para registros existentes, versión esperada.
- Texto y transiciones son comandos separados; guardar no publica ni restaura.
- Locks: usuario/concesiones → entidad → categoría, si cambia asignación.
- Serialización conserva la intención y versión original; no hace rebase automático.
- Auditoría y cambios confirman juntos; replay no reaplica estados históricos.
- Los recibos devueltos no sustituyen la consulta actual del registro.
- Los documentos usan una lista cerrada de nodos/marcas y lectura React escapada.
- Zoom sólo se revela al editor o mediante acceso académico reautorizado.
- Autorización académica y lectura privada usan el mismo `PoolClient` y la misma
  transacción serializable. Conservan los locks de usuario/concesiones/membresía hasta
  terminar la lectura; una revocación posterior espera y las lecturas siguientes deniegan.
- Categorías y encuentros conservan campos y versión base ante `router.refresh()`.
  Cargar una revisión remota requiere confirmación y reemplaza ambos juntos.
- La recarga de una clase sólo aplica automáticamente la revisión confirmada por su
  propio recibo. Una revisión posterior se ofrece para comparación y carga explícita;
  `editorKey` sincroniza Tiptap, formulario y versión al aceptarla.
- `DUPLICATE_SLUG` identifica el rechazo definitivo por `SnipersCategory_slug_key`:
  permite corregir el campo y emitir otro UUID. Primero se concilia el recibo original,
  conservando replay y rechazo de otra intención bajo un UUID confirmado.
- `resources: []` es el contrato de lectura de esta entrega; no se crean archivos ficticios.

Las cargas y sus invariantes C1/C2/C3 se reservan para 3B-2. La edición no tiene
autosave ni persistencia local del cuerpo. Un envío incierto puede repetirse exactamente
mientras la pantalla sigue abierta; cerrar la pestaña pierde ese sobre en memoria.
Los borradores ya confirmados y la auditoría permanecen en PostgreSQL.

Logs, reportes, capturas, perfiles y backups quedan ignorados. No hacer commit,
push, merge, deploy ni comenzar 3B-2 sin autorización posterior.

Corrección autorizada del 30/10/2026: `queries.ts` extrae la comprobación académica
existente para reutilizarla dentro de la lectura. Sus reglas permanecen iguales.
El lanzador conserva el hash histórico en la evidencia y comprueba que la revisión
actual de ese archivo no cambie durante cada ejecución. Las demás guardas originales
y las aserciones de pruebas anteriores se conservan.

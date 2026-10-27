# Fase 2 — ejecución local aislada

Desde `feature/snipers-campus`, con la instancia de Fases 0/1 iniciada manualmente:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/phase2/cli.ts check
node node_modules/tsx/dist/cli.mjs scripts/phase2/cli.ts unit
node node_modules/tsx/dist/cli.mjs scripts/phase2/cli.ts test
node node_modules/tsx/dist/cli.mjs scripts/phase2/cli.ts regression
node node_modules/tsx/dist/cli.mjs scripts/phase2/cli.ts typecheck
node node_modules/tsx/dist/cli.mjs scripts/phase2/cli.ts lint
```

El lanzador valida entorno fuera de producción/CI, rama, perfil, destino y privilegios.
Solo permite `127.0.0.1:55432/snipers_dev` con el rol limitado de Fase 1 y perfil
`SNIPERS_ENABLED=false`. No toma la configuración productiva del proyecto.

`unit` no escribe SQL. `test` y `regression` respaldan previamente mediante
`npm run db:backup -- --env-file .env.snipers.local` y detienen la ejecución si falla.
Las pruebas de integración vuelven a comprobar las guardas antes de crear fixtures.
No ejecutar los archivos de integración directamente ni falsificar marcas del lanzador.

`test` ejecuta unitarias y servicios de Fase 2. `regression` conserva las suites de
Fases 0/1; su comprobación de bootstrap solo verifica que una repetición se rechaza.
No se ejecutan inicializaciones ni migraciones desde este lanzador.

La fachada real es `src/lib/snipers/server.ts`; el núcleo y la fábrica de gateway son
dependencias internas para servidor/pruebas, no funciones públicas para recibir actores.
Las pruebas positivas inyectan habilitación en su propio proceso y no editan perfiles.

Los escenarios concurrentes emplean conexiones reales, barreras y observación de esperas.
Cada ejecución conserva nuevos fixtures `phase2-test-…@local.invalid`, pagos y auditoría.
No limpiar historial, restaurar sobre la base poblada ni reiniciar bootstrap para repetir.

Salidas TAP y evidencia: `.local/snipers/phase2-*.tap` y
`.local/snipers/phase2-verification.json`, ignoradas por Git. Ver
`docs/snipers-phase2.md` para contratos, resultados y limitaciones.

# Fase 1 — herramientas exclusivamente locales

No importar estos módulos desde la aplicación, builds, seeds generales ni despliegues.
La configuración `snipers.local.config.ts` solamente se selecciona explícitamente.
La cadena de migraciones ejecutable se prepara en `.local/snipers/phase1-migrations/`.
El esquema congelado y su SQL de inicialización NO son migraciones productivas.
El SQL aditivo de `prisma/snipers-review/` es un candidato sin compatibilidad productiva verificada.

Desde la raíz, con PostgreSQL iniciado manualmente:

```powershell
npm.cmd run snipers:local -- check
npm.cmd run snipers:local -- validate
npm.cmd run snipers:local -- status
npm.cmd run snipers:local -- test
npm.cmd run snipers:local -- typecheck
npm.cmd run snipers:local -- lint
```

`prepare` genera los artefactos desde el esquema congelado de `599510d`, y rechaza cambios
en ese esquema. `migrate` aplica la cadena local con respaldo previo; rechaza una copia
de SQL distinta de la ya materializada. No modifica migraciones existentes.
La inicialización SQL valida destino antes del DDL y contiene su propia transacción.

`catalog` crea solamente códigos faltantes, con respaldo previo y auditoría transaccional.
`bootstrap` ya se ejecutó: no repetirlo ni borrar su archivo/evento para habilitar otra ejecución.
Los comandos de escritura y las pruebas respaldan antes de continuar. Un error detiene el comando.

Las pruebas SQL usan transacciones con rollback cuando es posible. Los escenarios concurrentes
conservan fixtures identificados por correos `phase1-test-…@local.invalid`, con auditoría;
no borran historial ni restauran/resetearán la base. Cada ejecución agrega fixtures sintéticos.
El único administrador efectivo al terminar debe ser el supervisor sintético inicial.

El bootstrap guarda primero un archivo privado local para evitar perder la contraseña al
confirmar. Si falla posteriormente, conserva ese archivo como evidencia y bloquea nuevos intentos.
Requiere inspección manual; no existe bypass, recuperación automática ni promoción por correo.

Ver el procedimiento, inventario, evidencia y límites en `docs/snipers-phase1.md`.

# Grupo de Snipers — Informe de Fase 0

Estado al 26/10/2026 (Argentina): **Fase 0 de aislamiento local y respaldo completada**.
PostgreSQL 18.6 está activo en `127.0.0.1:55432` y la restauración sintética pasó.
El arranque debe realizarse desde la PowerShell normal del usuario: el sandbox de Codex sigue
fallando al crear el token de arranque. Las consultas, respaldos y restauraciones sí funcionan desde Codex.
Rama: `feature/snipers-campus`, creada desde `main` en `e178628`.
No se implementaron modelos ni funcionalidades de Snipers. No se accedió a bases remotas.

## Resultado final de la Fase 0

El usuario inició el servidor como `DESKTOP-AVG2A1K\gasnv` desde una PowerShell sin elevar
permisos. PID inicial: `13456`. No se creó servicio de Windows. Se verificaron mediante SQL
la versión 18.6, el directorio `F:/Full Scalping WEB/.local/snipers/postgres` y la escucha
exclusiva en `127.0.0.1:55432`. El identificador del clúster quedó registrado localmente en
`.local/snipers/server-identity.json`.

Se completó `npm run db:local -- provision`, una acción que utiliza el clúster **ya iniciado**:
verifica su identidad y la ausencia de perfiles, usuario y bases de trabajo; respalda `postgres`
y luego crea el usuario limitado y las bases. No ejecuta `initdb`, no inicia procesos y no reutiliza
automáticamente una provisión parcial. Conserva credenciales de recuperación si falla entre pasos.
Un segundo intento de `provision` fue rechazado antes de escribir, sin sobrescribir perfiles.

| Elemento | Resultado comprobado |
|---|---|
| `snipers_local` | Sin superusuario, creación de roles/bases, replicación ni bypass de RLS. |
| `snipers_dev` | Vacía: 0 tablas de aplicación. |
| `snipers_backup_source` | Una tabla sintética con 2 filas Unicode/JSON y secuencia identity. |
| `snipers_restore_test` | Restauración coincidente; una tercera fila obtuvo el ID 3. |
| Backups reales | 6 archivos custom; cabecera, listado, versiones 18.6 y SHA-256 comprobados; sin archivos `.part`. |
| Restauración real | Se restauró el dump con los fixtures; pasó la comparación de filas y continuidad de la secuencia. Los demás dumps se validaron mediante listado y checksum. |
| Aislamiento | Perfiles loopback, credenciales nuevas distintas de las originales y servicios externos sin credenciales en el entorno aislado. |
| `.env` original | SHA-256 sin cambios respecto del registro anterior a la inicialización. |

Comandos comprobados: `db:local -- provision`, `db:local -- status`, `local:check`,
`test:phase0` (20/20), `test:backup:local`, TypeScript y ESLint de las herramientas.
El estado autenticado devuelve `snipers_dev|127.0.0.1|55432|snipers_local|f|18.6`.
Desde el sandbox, `pg_ctl status` devolvió 3 aunque el servidor estaba activo y aceptaba SQL;
el comando de estado ahora usa una conexión autenticada en vez de esa comprobación de proceso.

Los dumps están en `backups/snipers-local/`. Los perfiles, la evidencia de aislamiento
(`phase0-completion.json`) y el resultado de restauración (`restore-verification.json`)
están en `.local/snipers/`, salvo `.env.snipers.local` en la raíz; todos están ignorados por Git.
No se imprimieron contraseñas ni se copiaron credenciales productivas a esos perfiles.

Cambios de esta última continuación: `scripts/phase0/database.ts` (provisión del clúster
existente y estado por SQL), este informe y los artefactos locales ignorados. El servidor
permanece iniciado por el usuario; no se lo reinició ni detuvo. No se modificaron `src`,
Prisma, integraciones, matrículas ni `main`. No se ejecutaron migraciones ni seeds del campus.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `.gitignore` | Ignorar todo `backups/` y `.local/`, incluidos manifiestos, credenciales y datos del motor. |
| `package.json` | Inicio local protegido y comandos de preparación, comprobación y pruebas. Sin dependencias nuevas. |
| `scripts/backup.ts` | Backup local explícito, formato custom, esquema y datos, checksum, errores propagados. |
| `scripts/phase0/local.ts` | Validación de conexiones, aislamiento de variables, ejecución sin shell y errores sin credenciales. |
| `scripts/phase0/database.ts` | Preparación, provisión del clúster existente y estado autenticado de instancia dedicada. |
| `scripts/phase0/dev.ts` | Lanzador Next local que bloquea el arranque sin perfil aislado. |
| `scripts/phase0/verify.ts` | Prueba preparada de backup/restauración con bases y datos exclusivamente sintéticos. |
| `scripts/phase0/phase0.test.ts` | Pruebas automatizadas de seguridad, fallos de respaldo y aislamiento. |
| `config/snipers.env.example` | Plantilla versionada sin credenciales reales. |
| `README.md` | Actualización de comandos, guardas y limitaciones. |
| `docs/snipers-phase0.md` | Este informe y procedimiento de continuación. |

## Uso y aislamiento

`npm run dev` y `npm run dev:snipers` ahora exigen `.env.snipers.local`, generado por el setup.
No recurren al `.env` remoto si falta el perfil. Antes de iniciar Next se vacían credenciales
externas heredadas y de los archivos `.env*`; las variables vacías impiden que Next/dotenv
las vuelva a completar. El `.env` original no se modifica.

El arranque exige `snipers_dev`, usuario `snipers_local`, en `127.0.0.1:55432`.
OAuth, SMTP, Supabase Storage, Bunny, pasarelas, R2 y terminal quedan sin credenciales.
Snipers permanece deshabilitado. La plantilla de `config/` no es una credencial utilizable.

Comandos para comprobar el entorno con el servidor local ya iniciado:

```powershell
npm.cmd run db:local -- status
npm.cmd run local:check
npm.cmd run db:backup
npm.cmd run test:phase0
```

`npm run test:backup:local` ya pasó una vez; sus bases conservan las tablas sintéticas y un
nuevo intento se rechaza para no borrar contenido. No ejecutar resets para repetirlo.
`npm run db:local -- provision` también ya se completó; no es un comando de arranque habitual.
**No ejecutar `setup --resume`**: el clúster existente y sus perfiles deben conservarse.

Para futuros arranques, usar el bloque de PowerShell normal de este informe cuando el servidor
esté detenido. Para detener exclusivamente esta instancia, desde esa misma consola normal:

```powershell
& 'F:\PostgreSQL-Snipers\pgsql\bin\pg_ctl.exe' stop `
    -D 'F:\Full Scalping WEB\.local\snipers\postgres' -m fast -w -t 20
```

El setup respalda la base de mantenimiento recién inicializada mediante `npm run db:backup`
antes de crear el usuario limitado y las bases de trabajo. El bootstrap del motor precede
necesariamente al primer respaldo porque aún no existe una base. Luego respalda el desarrollo vacío.

La base de desarrollo permanece vacía hasta fases posteriores: sin migraciones, seeds ni tablas
del campus. No será un campus funcional todavía. Las pruebas de restauración usan solamente
`snipers_backup_source` y `snipers_restore_test`; rechazan bases con tablas existentes y no borran
contenido para poder repetirse. Conservan sus fixtures para inspección.

## Herramienta de respaldo

`npm run db:backup` usa `.env.snipers.local` por defecto. Acepta `--env-file PERFIL_LOCAL`.

- Exige entorno local, loopback literal, puerto y credenciales explícitos; valida también las URLs secundarias.
- Rechaza destinos remotos y parámetros de redirección libpq antes de ejecutar herramientas.
- Conserva parámetros TLS compatibles y separa parámetros exclusivos de Prisma.
- Ejecuta sin shell ni contraseñas en argumentos; omite secretos de los diagnósticos.
- Exporta esquema y datos en formato custom; verifica cabecera y listado con `pg_restore`.
- Genera tamaño y SHA-256; el manifiesto no confunde listar un archivo con probar su restauración.
- Propaga fallos y elimina el archivo parcial si falla la exportación o validación.
- No modifica ni elimina respaldos anteriores. Los archivos auxiliares también quedan ignorados.

El comando ahora **rechaza respaldos remotos**. Su uso productivo necesita revisión posterior;
ninguna prueba sintética equivale a un backup de producción. No incluye archivos R2 ni estado global del proveedor.

## Historial de pruebas anterior al arranque manual

- `npm run test:phase0`: **20 pruebas aprobadas**. Incluyen URL remota, host/service alternativo,
  parámetros no admitidos, TLS conservado, perfiles ausentes, URL secundaria remota, carga real de
  variables mediante `@next/env`, archivos vacíos/corruptos, fallo de exportación/listado y checksum.
- TypeScript (`tsc --noEmit --incremental false`) y ESLint de las herramientas: **aprobados**.
- Los chequeos anteriores de `local:check` y `db:backup` rechazaron correctamente la falta de perfil; no hay fallback remoto.
- Con 18.6, `db:backup -- --env-file .local/snipers/bootstrap.env` se intentó antes del setup:
  falló por conexión rechazada exclusivamente en `127.0.0.1:55432`, donde aún no había servidor.
- `db:local setup --resume` con 18.6: `initdb` terminó correctamente; `pg_ctl start` falló
  antes de iniciar el servidor. Se detuvieron los intentos, sin elevar permisos ni cambiar servicios.
- Restauración real con `test:backup:local`: **pendiente**. Se invocó el comando y rechazó
  la falta de perfil antes de abrir una conexión; no se ejecutó restauración ni SQL.
- No se ejecutaron build, seeds, migraciones, `db push`, resets ni consultas a bases remotas.

## Antecedente: distribución 18.4 incompleta

Los clientes y binarios PostgreSQL reportan 18.4, pero `initdb` falla con:

```text
could not create restricted token: error code 87
could not re-execute with restricted token: error code 3
file "C:/Program Files/PostgreSQL/18/share/postgres.bki" does not exist
```

Se comprobó que faltaba `postgres.bki`. Ese intento no creó un clúster ni inició un servidor.
El usuario descargó y extrajo posteriormente una distribución completa, sin reparar la instalación existente.

## Historial: reanudación con PostgreSQL 18.6 y bloqueo de arranque en Codex

Ubicaciones verificadas:

- `F:\PostgreSQL-Snipers\pgsql\bin\initdb.exe`
- `F:\PostgreSQL-Snipers\pgsql\bin\pg_ctl.exe`
- `F:\PostgreSQL-Snipers\pgsql\share\postgres.bki`

`initdb`, `pg_ctl`, `postgres`, `psql`, `pg_dump` y `pg_restore` reportan **18.6**.
El valor predeterminado de las herramientas, la plantilla y el `PG_BIN` del perfil bootstrap
se cambiaron a `F:/PostgreSQL-Snipers/pgsql/bin`. Los ejecutables se invocan por ruta explícita;
no se mezclan con 18.4 ni se modifica el PATH del sistema. El perfil bootstrap conserva sus secretos locales.

El único intento de setup con esa distribución completó `initdb` y falló al arrancar:

```text
pg_ctl falló (código 1). pg_ctl: could not create restricted token: error code 87
pg_ctl: could not start server: error code 3
```

Se conservaron `PG_VERSION` (18), `global/pg_control`, `postgresql.conf` y `pg_hba.conf`.
No existe `postmaster.pid` y no se creó `postgres.log`. En la comprobación posterior no se
observaron procesos `postgres`, escuchas TCP en 55432 ni servicios PostgreSQL registrados.
El fallo observado corresponde a la creación del token restringido con el que `pg_ctl` intenta
lanzar el servidor; **no se determinó la causa específica de esa restricción de Windows**.
En esa reanudación no se probó otro contexto de permisos, un arranque directo ni un segundo intento.

El script se detuvo antes del primer backup del clúster, antes de crear `snipers_local` y antes
de crear `snipers_dev`, `snipers_backup_source` o `snipers_restore_test`. No existe
`.env.snipers.local`; el archivo temporal de contraseña fue eliminado. No hay dumps reales
ni restauración verificada. Las pruebas sintéticas de integración siguen pendientes.

Se verificó sin conexiones remotas que:

- El SHA-256 del `.env` original coincide con el registrado antes del intento.
- Las dos URLs bootstrap apuntan a `127.0.0.1:55432/postgres`; sus credenciales son locales,
  distintas de las contraseñas de las URLs originales y del secreto de sesión original.
- El entorno aislado elimina las variables externas del `.env`; libpq recibe host, puerto,
  base y usuario locales explícitos. Las 20 pruebas de seguridad y respaldo siguen aprobadas.
- TypeScript y ESLint de las herramientas terminaron sin errores.

Los resultados sin secretos se conservaron en `.local/snipers/phase0-18.6-result.json` (ignorado).
No se crearon servicios de Windows, no se modificó la distribución extraída ni la instalación 18.4,
y no se ejecutaron migraciones ni consultas remotas. Los archivos versionables ajustados en
esta reanudación son `scripts/phase0/local.ts`, `config/snipers.env.example` y este informe.

## Historial: diagnóstico controlado del token de Windows

En la investigación posterior se hicieron consultas de solo lectura y **un único intento**
de arranque con `pg_ctl.exe` invocado directamente desde PowerShell, sin el lanzador de Node.
Antes se confirmó que no había procesos `postgres`, `postmaster.pid` ni escuchas en 55432.
El intento de respaldo previo volvió a recibir conexión rechazada únicamente en `127.0.0.1:55432`.

Contexto observado mediante `whoami` y consultas de las API de Windows (sin crear ni modificar tokens):

| Propiedad | Resultado |
|---|---|
| Usuario efectivo | `DESKTOP-AVG2A1K\CodexSandboxOffline` |
| Integridad | Media (`S-1-16-8192`) |
| Administrador / token elevado | No / no |
| Token restringido (`IsTokenRestricted`) | Sí |
| SIDs de restricción del token | 5 |
| Privilegios presentes | Solo `SeChangeNotifyPrivilege`, habilitado |
| Proceso dentro de un Job Object | Sí |
| AppContainer | No |
| PowerShell | 5.1, lenguaje `FullLanguage` |
| Variables `PG*` heredadas | Ninguna |

El directorio de datos pertenece a `CodexSandboxOffline`. Sus ACL permiten modificación a
`Authenticated Users`; no se cambiaron ACL. La lectura del clúster con
`postgres.exe -C data_directory -D ...` devuelve la ruta local esperada. Esa opción **solo lee
configuración**: no prueba que el servidor pueda arrancar. `pg_ctl status` confirma que está detenido.

El intento directo desde PowerShell devolvió:

```text
pg_ctl: could not create restricted token: error code 87
pg_ctl: could not start server: error code 3
CONTROLLED_START_EXIT=1
```

No creó log ni PID del servidor. El código oficial de PostgreSQL 18.6 sitúa el primer mensaje
en el fallo de `CreateRestrictedToken`, antes de `CreateProcessAsUser` y antes de configurar
el Job Object del servidor. Windows define 87 como `ERROR_INVALID_PARAMETER`. El código 3
posterior no demuestra que falte una ruta: se consulta después de operaciones de limpieza
que pueden alterar el último error de Windows. La ruta de datos y los ejecutables sí existen.

`pg_ctl` es el controlador que prepara un token reducido y lanza `postgres`. El ejecutable
`postgres` implementa el servidor y rechaza ejecución administrativa en Windows. No se usó
su arranque directo para evitar el paso que falla, ni se establecieron variables que omitan
la creación del token. Solo se comparó su lectura de configuración con el arranque de `pg_ctl`.

**Conclusión comprobada:** el fallo también ocurre sin Node, dentro de la sesión de PowerShell
del sandbox; el mismo clúster sí arrancó desde la cuenta habitual del usuario. La comparación
acota el bloqueo al contexto de ejecución de Codex. No se conoce qué validación interna
exacta de Windows produce el 87. El Job Object existe, pero el fallo sucede antes del código
de PostgreSQL que configura ese objeto. No hay evidencia que justifique cambios de antivirus,
políticas globales o permisos administrativos.

Fuentes primarias consultadas:

- [Código de pg_ctl en PostgreSQL 18.6](https://github.com/postgres/postgres/blob/REL_18_6/src/bin/pg_ctl/pg_ctl.c).
- [Entrada del servidor postgres en PostgreSQL 18.6](https://github.com/postgres/postgres/blob/REL_18_6/src/backend/main/main.c).
- [Microsoft: CreateRestrictedToken](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken).
- [Microsoft: códigos de error del sistema](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes--0-499-).
- [OpenAI Docs: sandbox de Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox), que describe usuarios dedicados de menor privilegio y límites del entorno.

### Comprobación manual desde Windows, sin elevar permisos

1. Abrir **Windows PowerShell desde Inicio**, con la cuenta habitual, sin elegir «Ejecutar como
   administrador». Una consola hija abierta por las herramientas de Codex conserva su contexto;
   esta prueba debe hacerse desde Windows fuera de ese entorno.
2. Pegar el bloque completo siguiente. Comprueba la identidad, el puerto y el clúster antes de
   hacer **un solo intento**. No pide contraseñas, no lee `.env`, no crea servicios y no reinicializa datos.

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $snipersIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $snipersPrincipal = New-Object Security.Principal.WindowsPrincipal($snipersIdentity)
    Write-Output $snipersIdentity.Name
    if ($snipersIdentity.Name -match 'CodexSandbox' -or
        $snipersPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Usá una PowerShell normal de tu usuario, fuera de Codex y sin elevar permisos.'
    }
    $snipersData = 'F:\Full Scalping WEB\.local\snipers\postgres'
    $snipersCtl = 'F:\PostgreSQL-Snipers\pgsql\bin\pg_ctl.exe'
    if ((Get-Content -LiteralPath "$snipersData\PG_VERSION" -Raw).Trim() -ne '18') {
        throw 'Versión de clúster inesperada.'
    }
    if ((Test-Path -LiteralPath "$snipersData\postmaster.pid") -or
        @(Get-Process postgres -ErrorAction SilentlyContinue).Count -gt 0) {
        throw 'Hay un PID o un servidor: detener la prueba y revisar, sin borrar archivos.'
    }
    if (@([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
        Where-Object { $_.Port -eq 55432 }).Count -gt 0) {
        throw 'El puerto 55432 está ocupado: detener la prueba.'
    }
    if (@(Get-ChildItem Env: | Where-Object { $_.Name -match '^PG' }).Count -gt 0) {
        throw 'Hay variables PG heredadas: informar sus nombres antes de continuar, sin mostrar valores.'
    }
    & $snipersCtl start -D $snipersData `
        -l 'F:\Full Scalping WEB\.local\snipers\normal-powershell.log' `
        -o '-h 127.0.0.1 -p 55432' -w -t 20
    if ($LASTEXITCODE -ne 0) { throw 'Falló el único intento. Copiar el error completo y no reintentar.' }
    & $snipersCtl status -D $snipersData
}
```

3. Si muestra `server started`, conservar la salida y avisar para continuar la provisión local
   y los respaldos. Si falla, copiar el error completo; si existe `normal-powershell.log`, compartir
   sus últimas líneas. No borrar `postmaster.pid`, no ejecutar `setup`, `initdb` ni un reset.

La prueba manual **se realizó y funcionó**, con el usuario `gasnv`, sin cambios de seguridad.
Después se completaron el respaldo bootstrap, la provisión y la restauración descritos al inicio.
La instancia usa loopback y SCRAM. Desde Codex, usar `npm run db:local -- status`, que ahora
comprueba el estado por SQL. El bloque manual se conserva para futuros arranques cuando la
instancia esté detenida; rechaza un clúster o puerto ocupado. No se avanzó a Fase 1.

## Migraciones y riesgos pendientes

- La baseline actual está vacía y declara un esquema creado fuera de Prisma. Existen scripts
  históricos de cambios directos y elementos del esquema que no aparecen en las migraciones observadas.
  Es una sospecha de desfase; no se contrastó con producción.
- Antes de migrar: comparar esquema declarado, SQL histórico y esquema instalado obtenido de forma
  autorizada; revisar dependencias del proveedor y probar restauración aislada. No reescribir historial
  aplicado ni ejecutar `resolve` para ocultar diferencias.
- Los comandos originales de build, seeds/importación y Prisma directo no pasan por el lanzador de
  desarrollo. **No ejecutarlos con el `.env` remoto.** No se cambió su comportamiento en esta fase.
- No se verificaron datos, TLS real, versión del servidor ni migraciones instaladas de producción.
- No se aprovisionó R2 ni se verificaron credenciales de prueba; cargas externas permanecen pendientes.
- Un preview no demuestra aislamiento de DB, almacenamiento, OAuth, SMTP o pasarelas.
- El modo 0600 de los archivos privados no reemplaza las ACL de Windows; proteger el workspace y no compartirlo.

La Fase 0 local y sus pruebas de respaldo/restauración están completadas. Los riesgos de migraciones,
respaldos productivos y recursos externos anteriores siguen pendientes antes de implementar o desplegar.
No avanzar a Fase 1 sin aprobación explícita.

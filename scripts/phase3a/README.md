# Fase 3A — validación local

Requiere `feature/snipers-campus`, el perfil ignorado de Fases 0/1 con
`SNIPERS_ENABLED=false` y PostgreSQL dedicado iniciado manualmente. No modifica
el arranque normal, credenciales productivas, modelos ni migraciones.

```powershell
node node_modules/tsx/dist/cli.mjs scripts/phase3a/cli.ts check
node node_modules/tsx/dist/cli.mjs scripts/phase2/cli.ts test
node node_modules/tsx/dist/cli.mjs scripts/phase2/cli.ts regression
node node_modules/tsx/dist/cli.mjs scripts/phase3a/cli.ts test
node node_modules/tsx/dist/cli.mjs scripts/phase3a/cli.ts build
node node_modules/tsx/dist/cli.mjs scripts/phase3a/cli.ts browser
node node_modules/tsx/dist/cli.mjs scripts/phase3a/cli.ts typecheck
node node_modules/tsx/dist/cli.mjs scripts/phase3a/cli.ts lint
```

Cada ejecución que escribe datos (`test`, `browser`, `dev`) hace primero
`npm run db:backup -- --env-file .env.snipers.local` y aborta si el backup no
queda verificado. No ejecutar directamente las pruebas que escriben ni fabricar
marcas del lanzador. Se conservan los fixtures `.invalid` y su auditoría.

El lanzador comprueba rama, conexiones, instancia, rol sin privilegios elevados y
flag persistente. Reutiliza `runnerEnv` y las guardas existentes. Captura hashes
de los archivos protegidos y del **dump completo del esquema** antes/después
de cada comprobación finita. No verifica datos o infraestructura productivos.

Las pruebas de acciones usan los exports reales, NextAuth/JWE/callbacks y SQL;
sólo simulan `next/headers` y el marcador `server-only`. Las pruebas de navegador
usan login real por credenciales, el servidor compilado `next start` en loopback,
Server Actions HTTP y PostgreSQL. Requieren completar primero el build aislado.
La habilitación positiva ocurre exclusivamente en el proceso de prueba.

Para el navegador se usa Edge headless instalado en Windows, perfil temporal y
Playwright separado de las dependencias de aplicación:

```powershell
npm install --prefix .local/snipers/browser-tools --cache .local/snipers/npm-cache --no-package-lock --ignore-scripts playwright
```

El navegador rechaza requests a orígenes externos; el CSS de Google Fonts heredado
se responde localmente con CSS vacío. Se fija la preferencia regional AR para
evitar la geolocalización externa. El preloader de Node rechaza
conexiones TCP/TLS fuera de loopback y registra sólo destino/puerto, sin secretos.
No equivale a una captura de tráfico del sistema operativo. Los intentos heredados
de geolocalización/banderas del campus quedan bloqueados durante la prueba.

`build`, `browser` y `dev` utilizan Webpack y el hook de pruebas de `next/font`
con CSS de fuentes locales, para no descargar Google Fonts. No se modifica
`next.config.ts` ni la configuración normal de fuentes/bundler. El build aislado
no acredita el build Turbopack ni fuentes remotas de producción.

Para inspección manual autorizada:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/phase3a/cli.ts dev
```

Escucha sólo en `127.0.0.1:3100`. Las cuentas de navegador son sintéticas y sus
contraseñas aleatorias no se publican. No hay endpoint de login de prueba ni
herramientas que concedan permisos en producción.

Resultados, red, capturas y respaldos quedan ignorados en `.local/snipers/` y
`backups/snipers-local/`. La configuración persistente sigue deshabilitada.

La recuperación comercial guarda únicamente el sobre imprescindible para repetir
el comando/propuesta, por actor y membresía, en `sessionStorage`. Se valida y
depura al abrir una ficha y desde un observador de sesión. La caducidad de 24 horas
se aplica al revisar el almacenamiento; no promete borrado automático con la
pestaña suspendida. Logout y cambio de identidad eliminan el sobre privado y
conservan sólo actor, membresía y UUID, sin importes, referencias, motivos o tokens.
Esa señal bloquea nuevas operaciones en la ficha hasta consultar el recibo con
sesión y permisos vigentes. Un recibo ausente no desbloquea: no prueba rollback.
`IDEMPOTENCY_CONFLICT` conserva siempre la señal original y retira el sobre privado:
puede indicar que cambió el actor autenticado antes de actualizarse la sesión de
otra pestaña. El actor nuevo no hereda ni concilia esa intención. Sólo se descartan
automáticamente rechazos comerciales posteriores a la búsqueda del recibo;
`VALIDATION`, `INTEGRITY`, fallos de acceso y errores desconocidos no bastan para ello.
Cerrar la pestaña o perder almacenamiento puede impedir recuperarlo: revisar
historial antes de registrar nuevamente. No almacena JWT o secretos de firma.

El arnés comprueba puerto libre, anuncio Ready, PID propietario del listener con
`netstat.exe` (Windows), errores/salida del hijo y cierre esperado del proceso.
Las regresiones incluyen colisión de puerto sin requests al listener ajeno,
salida temprana, anuncio falso y comprobación positiva del PID/cierre.
`test` incluye las pruebas correctivas sin quitar las 23 comprobaciones originales;
`browser` conserva los 16 escenarios originales y agrega recuperación revocada,
logout/alumno en la misma pestaña, recibo ausente, cortesías y auditoría de catálogo.
También prueba A → B → A en dos pestañas con cookies compartidas y la liberación
de una ficha ante un rechazo `STALE` definitivo. El rezago cliente se sostiene
fijando sólo `/api/auth/session` en A; las acciones HTTP y su SQL no se simulan.

Fase 3B, R2 y editor académico no forman parte de esta entrega. No ejecutar
migraciones, push, merge, deploy ni commit final sin autorización.

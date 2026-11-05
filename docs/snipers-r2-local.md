# Preparar R2 de prueba en Windows

La preparación inicial de la plantilla no realizó conexiones. La comprobación `--head` y el arranque local opcional descrito al final se ejecutan únicamente de forma explícita. El bucket fijado es `snipers-test-psicoemotrading`. El adaptador permanece sin cambios; no se cambian banderas persistentes ni se usan credenciales del `.env` expuesto.

## Archivo que debe completar el operador

Desde PowerShell, en `F:\Full Scalping WEB`, crear una copia privada fuera del repositorio. Los comandos siguientes contienen únicamente rutas y permisos, nunca credenciales:

```powershell
$r2PrivateDir = Join-Path $env:LOCALAPPDATA 'PsicoEmotrading\Snipers-R2-Test'
$r2PrivateFile = Join-Path $r2PrivateDir 'r2-test.env'
if (Test-Path -LiteralPath $r2PrivateFile) { throw 'El perfil ya existe; no se sobrescribe.' }
New-Item -ItemType Directory -Path $r2PrivateDir -Force | Out-Null
$r2OperatorSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls.exe $r2PrivateDir /inheritance:r /grant:r "*${r2OperatorSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron restringir los permisos del directorio.' }
Copy-Item -LiteralPath '.\config\snipers-r2-local.env.example' -Destination $r2PrivateFile
notepad.exe $r2PrivateFile
```

Completar y guardar manualmente sólo los tres valores vacíos del archivo:

| Variable | Valor |
| --- | --- |
| `SNIPERS_ENVIRONMENT` | Conservar `local` |
| `SNIPERS_R2_ENVIRONMENT` | Conservar `test` |
| `SNIPERS_R2_TEST_ACCOUNT_ID` | Account ID de Cloudflare: 32 caracteres hexadecimales en minúscula |
| `SNIPERS_R2_TEST_BUCKET` | Conservar `snipers-test-psicoemotrading` |
| `SNIPERS_R2_TEST_ACCESS_KEY_ID` | Access Key ID de las credenciales S3 limitadas a ese bucket |
| `SNIPERS_R2_TEST_SECRET_ACCESS_KEY` | Secret Access Key correspondiente |

No usar el valor del token bearer de la API de Cloudflare como clave S3. No agregar `AWS_*`, variables de staging/producción, URLs de base de datos ni banderas al archivo. El perfil no es código PowerShell: no ejecutarlo con dot-sourcing ni copiar sus valores a comandos.

Como alternativa, `.local\snipers\r2-test.env` está ignorado por Git, pero se prefiere la ruta fuera del repositorio. El archivo de referencia en `config/` debe permanecer sin credenciales. No subir el perfil al chat ni a capturas/logs. Si el directorio elegido ya tenía permisos explícitos para otras identidades, revisarlos antes de guardar: el comando anterior elimina la herencia pero no borra concesiones explícitas ajenas.

## Carga y validación local, sin conexión

En la misma consola, después de guardar manualmente el perfil:

```powershell
node --import tsx .\scripts\snipers-r2\check.ts "$r2PrivateFile"
```

El comando lee únicamente ese archivo, lo parsea en memoria y usa la validación del adaptador. No exporta claves a la sesión, no importa dotenv/Next, no busca otras credenciales y no hace peticiones. En los argumentos sólo aparece la ruta. La salida correcta es `R2_TEST_CONFIG_OK`; los errores no imprimen el perfil ni objetos de error del SDK. Ejecutar sin transcripciones, trazas de depuración ni capturas de pantalla del editor de credenciales.

El adaptador deriva internamente `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` y usa región `auto`. No requiere una variable de endpoint ni un dominio público. Está preparado para el endpoint de jurisdicción predeterminada; esta plantilla no agrega soporte para endpoints jurisdiccionales distintos.

## Primera conexión, sólo cuando se autorice utilizar las credenciales

No se ejecutó esta operación durante la preparación. Cuando corresponda, el operador puede solicitar **un único HEAD Bucket**, sin listar, crear, descargar ni borrar objetos:

```powershell
node --import tsx .\scripts\snipers-r2\check.ts "$r2PrivateFile" --head
```

La opción `--head` es la única que realiza una conexión. El bucket está fijado en el comprobador; se rechazan otros entornos/buckets y claves adicionales antes de crear el cliente. Hay un plazo de 10 segundos, sin reintentos automáticos. La salida de éxito es `R2_TEST_HEAD_OK`. Una falla no demuestra por sí sola qué permiso o dato es incorrecto; se omiten deliberadamente respuestas y cabeceras sensibles.

HEAD comprueba acceso al bucket, pero no acredita carga multipart, integridad de una transferencia, escritura/borrado ni CORS del navegador. Una prueba posterior de esas operaciones necesitaría autorización y un objeto descartable exclusivo del bucket de prueba. No habilitar acceso público ni iniciar el worker para esta comprobación.

Este perfil **no se incorpora automáticamente a `npm run dev`/`dev:snipers`**: el lanzador original filtra las variables R2 y su lista de variables del perfil no las repone. Ese lanzador no se modificó. Para R2 real de prueba se preparó la alternativa explícita siguiente.

## Arranque local aislado con R2 real

```powershell
# Desde la raíz del proyecto; sólo la ruta del perfil aparece en argumentos.
$r2PrivateFile = Join-Path $env:LOCALAPPDATA 'PsicoEmotrading\Snipers-R2-Test\r2-test.env'
node --import tsx .\scripts\snipers-r2\local.ts "$r2PrivateFile" --check
node --import tsx .\scripts\snipers-r2\local.ts "$r2PrivateFile"
```

El segundo comando inicia Next en `http://localhost:3000`, ligado a `127.0.0.1:3000`. No iniciarlo otra vez si ya hay un proceso atendiendo ese puerto. Ctrl+C detiene el lanzador. No inicia el worker Linux.

El lanzador valida el perfil privado con el comprobador existente, comprueba la identidad de `snipers_dev`/`snipers_local` en `127.0.0.1:55432`, exige bandera persistente false y compara la función SQL de política 2 con la corrección revisada. No ejecuta migraciones. Lee únicamente el perfil local de PostgreSQL explícito y el perfil privado R2; no usa `isolatedEnv`, porque ese helper inspecciona `.env*`.

El hijo recibe una lista cerrada de variables, R2 de prueba y `SNIPERS_ENABLED=true` sólo en memoria. Usa un secreto de sesión nuevo por arranque, por lo que puede requerir volver a iniciar sesión. Las demás integraciones no reciben credenciales. El preload `local-runtime.cjs` bloquea la lectura automática de `.env*` y las conexiones salientes ajenas a loopback y al host S3 validado, puerto 443. Next usa Webpack y el fixture existente de fuentes offline; sus logs se descartan para no persistir datos sensibles. No es un lanzador productivo ni modifica las guardas del arranque original.

### Comprobaciones reales del 01/11/2026

- HEAD Bucket: correcto, también con el entorno y las guardas exactos del nuevo arranque. La primera solicitud dentro del sandbox de red falló; la repetición autorizada fuera de ese sandbox fue satisfactoria.
- Base identificada: `snipers_dev`, rol `snipers_local`, puerto 55432, 13 tablas Snipers. No había migraciones fallidas; el esquema experimental existía sin las dos migraciones Snipers registradas. No se ejecutó `migrate deploy` ni se inventaron entradas en `_prisma_migrations`.
- Faltaba política 2 en esa base concreta. Se cotejó la función anterior con la migración cerrada y, tras respaldo, se aplicó sólo la definición correctiva de `20261101000000_snipers_basic_files` con guarda de identidad y definición previa dentro de una transacción. El SQL versionado no se modificó. Respaldo previo al cambio efectivo: `backups/snipers-local/local-2026-11-01T22-54-39-305Z-86ca69e8.dump`. Dos intentos previos se detuvieron por diferencias de representación/trim antes de confirmar cambios; la comprobación final coincide con la corrección revisada.
- Next local: `/login` devuelve 200; una visita no autenticada a Snipers termina en `/login`. Hay cuentas sintéticas existentes con contraseña/identidad verificada: 40 con permiso editorial/administrativo y 15 alumnos sin edición con cobertura vigente. No se crearon cuentas ni se expusieron sus credenciales.
- CORS: inicialmente OPTIONS devolvía 403. El operador configuró después el bucket de prueba con `config/snipers-r2-cors.example.json`; los preflight PUT, PUT con `content-length` y GET con `range` respondieron 204 para `http://localhost:3000`. GET Bucket Cors sigue fuera del alcance del token S3 limitado. No se ampliaron permisos del token.
- HEAD anónimo en el endpoint S3 devuelve 400, sin acceso satisfactorio. Esto no acredita el estado de r2.dev/dominos públicos: confirmarlo en el panel; el token S3 disponible no permite certificar esos ajustes. La lectura anónima de un objeto existente queda pendiente de la prueba autorizada siguiente.

### Prueba de objeto sintético autorizada

`scripts/snipers-r2/object-probe.ts` exige la opción explícita `--approve-test-object-write-delete`. **No ejecutar hasta contar con autorización para PUT y DELETE.** Sólo genera un PDF sintético pequeño y una clave nueva `snipers/connectivity-check/<UUID>/probe.pdf` dentro del bucket fijado. No usa PostgreSQL ni clases, no lista objetos ni toca los prefijos de archivos de la aplicación.

Una vez autorizado, realiza un PUT condicional, GET completo con tamaño/SHA-256 y DELETE de esa única clave, seguido de HEAD para confirmar ausencia. Se detiene ante el primer error, sin solicitudes adicionales de limpieza ni reintentos; informa sólo la clave sintética, la etapa y los resultados conocidos, sin errores crudos del SDK. Una colisión condicional no autoriza borrar el objeto preexistente. La prueba acredita esos permisos S3, pero no el multipart, acceso anónimo ni dominios públicos.

```powershell
# Únicamente DESPUÉS de aprobar expresamente la escritura y eliminación:
node --import tsx .\scripts\snipers-r2\object-probe.ts "$r2PrivateFile" --approve-test-object-write-delete
```

La prueba autorizada PUT → GET completo con tamaño/SHA-256 → DELETE → HEAD fue satisfactoria y confirmó la eliminación de su único objeto sintético. Una prueba aislada posterior también confirmó CreateMultipartUpload → AbortMultipartUpload → ListParts con `NoSuchUpload`/404, sin transferir contenido. Cualquier repetición requiere una autorización nueva; estas comprobaciones no cambian permisos ni configuran dominios públicos.

### Cierre local del 02/11/2026

El operador confirmó el recorrido completo en navegador: el mentor cargó y publicó los materiales y el alumno pudo acceder y descargarlos. Es una prueba integral manual del entorno local con `snipers_dev` y `snipers-test-psicoemotrading`; no acredita un despliegue de Snipers en producción ni pruebas de los tamaños máximos.

El servidor se inició desde PowerShell del operador, fuera del sandbox de Codex. Dentro del sandbox, Next fallaba antes de establecer TCP/TLS con `AggregateError / EACCES`; el mismo adaptador y perfil funcionaron fuera de esa restricción. Para las pruebas locales reales se usa el comando de arranque anterior, conservando las guardas y sin cambiar banderas persistentes.

Se corrigió la presentación de `PROCESSING + PROCESS_UPLOAD / DOWNLOAD / BLOCKED / AWAITING_VALIDATION`: es una espera del siguiente avance autenticado, no un bloqueo administrativo. Sólo esa combinación se informa como recuperable. La interfaz conserva su límite de 40 avances por ejecución y los demás estados BLOCKED siguen siendo bloqueos. La validación real de tamaño, SHA-256 y estructura sigue siendo obligatoria antes de VERIFIED/SUCCEEDED; no se repite el multipart para continuar la espera.

Se conserva únicamente el diagnóstico sanitizado del fallo de creación multipart: identificadores de correlación, tipo/código permitido, HTTP status y request ID reconocible, sin mensajes libres, stacks, headers, respuestas completas ni credenciales. Con el lanzador local se guarda en `.local/snipers/r2-multipart-diagnostics.jsonl`, ignorado por Git. Los scripts privados temporales de inspector y las pruebas ad hoc de aislamiento se retiraron; las capturas existentes permanecen como evidencia privada, no como parte del arranque ni del commit.

Pendientes antes de producción:

- Revisar y aplicar mediante un procedimiento independiente las migraciones Snipers y la corrección de políticas 1/2 sobre la base productiva, con respaldo y comprobación del esquema existente. La base experimental local tiene un historial distinto; no copiar su registro de migraciones.
- Configurar almacenamiento, credenciales y CORS propios del entorno productivo, comprobar acceso público deshabilitado y validar URLs firmadas en ese entorno. El perfil de prueba no debe reutilizarse en producción.
- Verificar presupuesto de ejecución y recursos del alojamiento con los límites actuales (MP3 250 MiB, PDF 25 MiB). El recorrido local aprobado no certifica esos máximos; si no son fiables, reducir temporalmente los límites antes de habilitar el servicio.
- Revisar el procedimiento operativo de recuperación/limpieza de cargas bloqueadas y objetos temporales; el lanzador local mantiene deshabilitados los procesos automáticos de limpieza y el worker anterior. La validación básica no incluye antivirus ni reparación exhaustiva del documento.
- Mantener `SNIPERS_ENABLED=false` fuera del proceso local de prueba hasta una autorización y validación productivas separadas. No se realizaron push, deploy, migraciones remotas ni cambios productivos durante este cierre.

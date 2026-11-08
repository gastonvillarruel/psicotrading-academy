# Snipers: rechazo de M4A con metadatos C2PA

## Causa confirmada

El intento productivo informó `FAILED / REJECTED`, fase `DOWNLOAD`, código `UNSUPPORTED_M4A`, con tamaño/SHA-256 correctos y sin vencimiento. La ejecución local del original señaló la antigua línea 177.

El diagnóstico ejecutado por el usuario sobre ese original devolvió:

```json
{"topLevelBoxes":["ftyp","uuid","free","moov","mdat"],"brands":[{"majorBrand":"M4A ","compatibleBrands":["M4A ","isom"]}],"uuidUserTypes":["d8fec3d6-1b0e-483c-9297-5828877ec481"],"unsupportedTopLevelBoxes":["uuid"]}
```

La marca estaba admitida. La causa directa fue la exclusión incondicional de cajas superiores `uuid`. Ese identificador corresponde a `ContentProvenanceBox`, definido en [C2PA, apéndice A.5.1](https://spec.c2pa.org/specifications/specifications/2.3/specs/C2PA_Specification.html). La ubicación informada también coincide con la de un manifiesto C2PA: después de `ftyp` y antes de `moov` y `mdat`.

Esto identifica la causa directa del rechazo; el validador anterior se detenía antes de comprobar el audio. Tras la corrección, el usuario volvió a ejecutar el inspector sobre el mismo original y confirmó `unsupportedTopLevelBoxes: []` y `formatCheck: {"result":"ACCEPTED","validatorLines":[]}`. Así se acredita localmente que el original supera todas las comprobaciones de formato vigentes. La presencia del UUID no certifica una firma C2PA válida ni el origen del audio.

## Corrección acotada

`m4a-validation.ts` admite exclusivamente la extensión superior `uuid` con esos 16 bytes de identificación y cabecera FullBox de versión/flags cero. Exige al menos los 20 bytes necesarios dentro de los límites ya comprobados de la caja. Sólo lee esa cabecera y deja el contenido de procedencia opaco.

No se habilitan UUIDs arbitrarios, XMP, UUIDs de protección, cajas adicionales, versiones o flags nuevos. No cambian las restricciones de AAC-LC, pistas, cifrado, referencias, fragmentación, tablas, offsets, metadatos `moov`, tamaño ni SHA-256. El archivo conserva todos sus bytes originales, incluidos sus metadatos C2PA; no se reescribe ni elimina ninguna caja. No se implementa validación criptográfica de C2PA.

`PrivateUploads` muestra, para `FAILED / UNSUPPORTED_M4A`, «Archivo M4A rechazado: variante de audio o contenedor no compatible.». Esa clasificación tiene prioridad aunque el plazo de la carga venza después. Los demás estados y la autorización conservan su comportamiento.

## Diagnóstico local sin contenido privado

Desde la raíz del proyecto:

```powershell
node --import tsx scripts/snipers-m4a/inspect-container.ts "C:\ruta\Reingenieria del Trading 3_11_26.m4a"
```

El inspector abre el archivo en lectura. Imprime únicamente tipos de cajas, marcas, identificadores de extensión y `formatCheck`, resultado del validador completo de formato. En errores de formato sólo agrega números de línea; no imprime contenido, rutas privadas ni mensajes arbitrarios. No calcula una prueba de activación ni altera registros. `formatCheck.result=ACCEPTED` acredita que el original pasa las comprobaciones de formato vigentes; un nuevo error debe investigarse sin omitir la comprobación que lo produjo.

## Pruebas

- Se reprodujo el fallo anterior en la línea 177 mediante un fixture AAC-LC con el mismo orden de cajas y UUID C2PA, ajustando los offsets de muestras. Antes de la corrección, las dos regresiones C2PA fallaron con `UNSUPPORTED_M4A` en esa línea.
- Con la corrección, ese fixture pasa. Las variantes cifrada, ALAC, video, fragmentada, truncada y con offsets inválidos siguen rechazándose.
- Se prueban cabeceras UUID extendidas, UUID desconocido/de protección, cabeceras cortas y cambios de versión/flags. Un diagnóstico superficial limpio no evita el rechazo de cifrado por el validador completo.
- La interfaz distingue el rechazo incluso con `expired=true`; no interpreta códigos antiguos de estados no terminales como un rechazo actual.
- La inspección verifica que sus archivos de entrada no cambian y que no expone payloads ni rutas en su salida.

Resultados finales: **30/30** pruebas focalizadas, **25/25** de regresión SQL sobre una base local nueva con almacenamiento simulado y respaldos previos, TypeScript completo y ESLint con cero advertencias aprobados. Prisma generate y build Next.js `--webpack` aprobados, **38/38** páginas estáticas, en copia aislada sin `.env` productivo y con red restringida a loopback. El primer intento de build compiló, pero no pudo generar páginas con PostgreSQL local detenido; se repitió con esa instancia local disponible. No hubo cambios de aplicación para resolver ese fallo ambiental.

Los 19 archivos locales ajenos conservaron sus hashes; también se comprobaron los 22 archivos que ya tenían cambios al iniciar esta etapa, incluidas las evidencias fuente de la etapa diagnóstica anterior. Los artefactos de ejecución quedan en `.local/snipers/m4a-line177/`; no forman parte del parche.

Sin operaciones productivas, migraciones, commit, push, merge ni deploy. El audio original no está disponible para este agente: su análisis se limita a las salidas técnicas proporcionadas por el usuario y a fixtures sintéticos locales.

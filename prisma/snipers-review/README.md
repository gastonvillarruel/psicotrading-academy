# Candidato SQL de Snipers — NO desplegar

`phase1.sql` es el delta aditivo generado desde el esquema congelado de `599510d`,
completado con restricciones PostgreSQL explícitas. Fue aplicado y probado únicamente
en `127.0.0.1:55432/snipers_dev` mediante una copia de idéntico SHA-256.

No pertenece a `prisma/migrations` y la configuración normal no lo selecciona.
No repara ni reemplaza el historial heredado. Su compatibilidad con la base productiva,
sus datos, extensiones y proveedor **no está comprobada**. Requiere `btree_gist`.

La inicialización completa está en `scripts/phase1/local-artifacts/init-local.sql`:
es exclusivamente local, tiene una guarda SQL de destino y no es un artefacto productivo.
Los archivos SQL nuevos fijan LF en `.gitattributes` para conservar los checksums.

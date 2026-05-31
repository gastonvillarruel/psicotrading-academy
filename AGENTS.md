<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reglas de Proyecto para Asistentes AI

1. **Backup Obligatorio de Base de Datos**: Siempre ejecutar `npm run db:backup` antes de realizar cambios estructurales, modificaciones de esquema de Prisma, ejecuciones de scripts de base de datos o cualquier alteración importante en los datos del proyecto.

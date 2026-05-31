This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## 🔒 Seguridad de Base de Datos

### Reglas Críticas
1. **Nunca usar la base real de Supabase para desarrollo local**. Modificá el `.env` local para apuntar a una base de datos local (PostgreSQL en Docker o similar) para pruebas destructivas.
2. **Nunca correr `prisma db seed` contra Supabase de forma directa**. El script de seed está bloqueado por defecto para evitar sobreescritura accidental.
3. **El plan gratuito de Supabase no tiene restauración (restore) disponible** desde el panel web. Cuidá los datos en producción.
4. **Siempre hacé un backup de datos** antes de realizar cambios de Prisma.

### Comandos de Seguridad y Base de Datos

#### 1. Exportar Backup de Datos (SQL Dump)
Para exportar los datos actuales (solo datos, comandos `INSERT` legibles) desde la base de datos configurada en tu `.env` a la carpeta `backups/`:
```bash
npm run db:backup
```
*Requisito: Tenés que tener `pg_dump` instalado localmente en tu PATH.* Los archivos generados en `/backups` están configurados en `.gitignore` para no ser subidos al repositorio Git.

#### 2. Ejecutar Seed Local
El seed está blindado. Para forzar su ejecución en local o desarrollo (idempotente por upsert, no destructivo por defecto):
- En Windows PowerShell:
  ```powershell
  $env:ALLOW_SEED="true"; npm run db:seed:local
  ```
- Si deseás correr operaciones destructivas (`deleteMany`) en una base local autorizada:
  ```powershell
  $env:ALLOW_SEED="true"; $env:ALLOW_DESTRUCTIVE_SEED="true"; npm run db:seed:local
  ```

#### 3. Importación Segura de Cursos
Para reconstruir o cargar cursos de forma controlada sin borrar nada existente:
1. Prepará el JSON de datos (podés basarte en `data/courses.import.example.json`).
2. Copialo en `data/courses.import.json`.
3. Ejecutá una simulación (Dry Run) para verificar errores o advertencias sin escribir en base:
   - Windows PowerShell:
     ```powershell
     $env:ALLOW_IMPORT_COURSES="true"; $env:DRY_RUN="true"; npm run db:import:safe
     ```
4. Para realizar la escritura real de los cursos validados:
   - Windows PowerShell:
     ```powershell
     $env:ALLOW_IMPORT_COURSES="true"; $env:DRY_RUN="false"; npm run db:import:safe
     ```


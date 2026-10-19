import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function handleExport(request: Request, customFilename?: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return new NextResponse('No autorizado', { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    const search = searchParams.get('search')?.trim().toLowerCase();

    const targetIds = idsParam ? idsParam.split(',').filter(Boolean) : null;

    const students = await db.user.findMany({
      where: {
        role: 'STUDENT',
        ...(targetIds ? { id: { in: targetIds } } : {}),
      },
      include: {
        purchases: {
          where: { status: 'approved' },
          include: { course: true },
        },
        enrollments: {
          include: {
            course: true,
            purchase: true,
          },
        },
        subscriptions: {
          orderBy: { expiresAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();

    // Si viene término de búsqueda y no ids específicos, filtrar
    const filteredStudents = (!targetIds && search)
      ? students.filter((s) => {
          const name = (s.name || '').toLowerCase();
          const email = s.email.toLowerCase();
          return name.includes(search) || email.includes(search);
        })
      : students;

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const pad = (n: number) => String(n).padStart(2, '0');
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const filename = customFilename || `alumnos_psicoemotrading_${dateStr}.xls`;
    const isExcel = filename.endsWith('.xls');

    if (isExcel) {
      const escapeHtml = (val: any) => {
        if (val === null || val === undefined) return '';
        return String(val)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      };

      const tableRows = filteredStudents
        .map((student, idx) => {
          const enrollmentsMap = new Map(student.enrollments.map((e) => [e.courseId, e]));
          const courseTitles: string[] = [];

          student.enrollments.forEach((e) => {
            if (e.course?.title && e.status === 'ACTIVE') {
              courseTitles.push(e.course.title);
            }
          });

          student.purchases.forEach((p) => {
            if (p.course?.title && !enrollmentsMap.has(p.courseId)) {
              courseTitles.push(p.course.title);
            }
          });

          const latestSub = student.subscriptions[0];
          const hasActiveSub =
            latestSub && latestSub.status === 'ACTIVE' && new Date(latestSub.expiresAt).getTime() > now;

          const membershipStatus = hasActiveSub
            ? 'Activa'
            : latestSub
              ? 'Expirada'
              : 'Sin membresía';

          const membershipPlan = latestSub
            ? latestSub.plan === 'MONTHLY'
              ? 'Mensual'
              : 'Anual'
            : '-';

          const membershipExpiry = latestSub
            ? new Date(latestSub.expiresAt).toLocaleDateString('es-AR')
            : '-';

          const statusStyle = hasActiveSub
            ? 'background-color: #dcfce7; color: #166534; font-weight: bold; text-align: center;'
            : latestSub
              ? 'background-color: #fee2e2; color: #991b1b; text-align: center;'
              : 'color: #64748b; text-align: center;';

          return `
            <tr>
              <td style="text-align: center; color: #64748b;">${idx + 1}</td>
              <td style="font-weight: bold; color: #0f172a;">${escapeHtml(student.name || 'Sin nombre')}</td>
              <td style="color: #0284c7;">${escapeHtml(student.email)}</td>
              <td style="text-align: center;">${student.emailVerified ? '<span style="color: #16a34a; font-weight: bold;">Sí</span>' : '<span style="color: #dc2626;">No</span>'}</td>
              <td style="text-align: center;">${new Date(student.createdAt).toLocaleDateString('es-AR')}</td>
              <td>${courseTitles.length > 0 ? escapeHtml(courseTitles.join(', ')) : '<span style="color: #94a3b8;">Ninguno</span>'}</td>
              <td style="${statusStyle}">${membershipStatus}</td>
              <td style="text-align: center;">${membershipPlan}</td>
              <td style="text-align: center;">${membershipExpiry}</td>
              <td style="font-family: monospace; font-size: 8.5pt; color: #94a3b8;">${escapeHtml(student.id)}</td>
            </tr>
          `;
        })
        .join('');

      const excelHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
          <!--[if gte mso 9]>
          <xml>
            <x:ExcelWorkbook>
              <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                  <x:Name>Alumnos</x:Name>
                  <x:WorksheetOptions>
                    <x:DisplayGridlines/>
                  </x:WorksheetOptions>
                </x:ExcelWorksheet>
              </x:ExcelWorksheets>
            </x:ExcelWorkbook>
          </xml>
          <![endif]-->
          <style>
            body, table { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 10.5pt; }
            th { background-color: #0d9488; color: #ffffff; font-weight: bold; padding: 10px 12px; text-align: left; border: 1px solid #0f766e; }
            td { padding: 8px 12px; border: 1px solid #e2e8f0; vertical-align: middle; }
            tr:nth-child(even) td { background-color: #f8fafc; }
          </style>
        </head>
        <body>
          <table border="1" cellpadding="0" cellspacing="0">
            <tr>
              <td colspan="10" style="font-size: 16pt; font-weight: bold; color: #0d9488; padding: 14px; border: none;">PSICOEMOTRADING - Listado de Alumnos</td>
            </tr>
            <tr>
              <td colspan="10" style="font-size: 9.5pt; color: #64748b; padding-bottom: 12px; border: none;">Generado el ${new Date().toLocaleDateString('es-AR')} | Total: ${filteredStudents.length} alumnos registrados</td>
            </tr>
            <tr>
              <th style="text-align: center; width: 40px;">#</th>
              <th style="min-width: 180px;">Nombre y Apellido</th>
              <th style="min-width: 220px;">Email</th>
              <th style="text-align: center; width: 110px;">Email Verificado</th>
              <th style="text-align: center; width: 120px;">Fecha Registro</th>
              <th style="min-width: 240px;">Cursos Adquiridos</th>
              <th style="text-align: center; width: 130px;">Membresía</th>
              <th style="text-align: center; width: 90px;">Plan</th>
              <th style="text-align: center; width: 110px;">Vencimiento</th>
              <th style="width: 280px; color: #ccfbf1;">ID Alumno</th>
            </tr>
            ${tableRows}
          </table>
        </body>
        </html>
      `.trim();

      return new Response('\uFEFF' + excelHtml, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    const headers = [
      'ID',
      'Nombre',
      'Email',
      'Email Verificado',
      'Fecha Registro',
      'Cant. Cursos Adquiridos',
      'Cursos Adquiridos',
      'Estado Membresia',
      'Plan Membresia',
      'Vencimiento Membresia',
    ];

    const rows = filteredStudents.map((student) => {
      const enrollmentsMap = new Map(student.enrollments.map((e) => [e.courseId, e]));
      const courseTitles: string[] = [];

      student.enrollments.forEach((e) => {
        if (e.course?.title && e.status === 'ACTIVE') {
          courseTitles.push(e.course.title);
        }
      });

      student.purchases.forEach((p) => {
        if (p.course?.title && !enrollmentsMap.has(p.courseId)) {
          courseTitles.push(p.course.title);
        }
      });

      const latestSub = student.subscriptions[0];
      const hasActiveSub = latestSub && latestSub.status === 'ACTIVE' && new Date(latestSub.expiresAt).getTime() > now;

      const membershipStatus = hasActiveSub
        ? 'Activa'
        : latestSub
          ? 'Expirada'
          : 'Sin membresía';

      const membershipPlan = latestSub
        ? latestSub.plan === 'MONTHLY'
          ? 'Mensual'
          : 'Anual'
        : '-';

      const membershipExpiry = latestSub
        ? new Date(latestSub.expiresAt).toLocaleDateString('es-AR')
        : '-';

      return [
        escapeCsv(student.id),
        escapeCsv(student.name || 'Sin nombre'),
        escapeCsv(student.email),
        escapeCsv(student.emailVerified ? 'Sí' : 'No'),
        escapeCsv(new Date(student.createdAt).toLocaleDateString('es-AR')),
        escapeCsv(courseTitles.length),
        escapeCsv(courseTitles.join('; ')),
        escapeCsv(membershipStatus),
        escapeCsv(membershipPlan),
        escapeCsv(membershipExpiry),
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('Error al exportar alumnos en CSV/Excel:', error);
    return new NextResponse('Error interno al exportar alumnos', { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleExport(request);
}

import { NextResponse } from 'next/server';
import { verifyCertificate } from '@/lib/campus/certificates';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Código de certificado requerido' }, { status: 400 });
    }

    const certificate = await verifyCertificate(code);

    if (!certificate) {
      return NextResponse.json({ valid: false, error: 'Certificado no válido o revocado' }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      certificate: {
        code: certificate.certificateCode,
        studentName: certificate.snapshotName,
        courseTitle: certificate.snapshotCourse,
        hours: certificate.snapshotHours,
        issuedAt: certificate.issuedAt,
        status: certificate.status,
      },
    });
  } catch (error: any) {
    console.error('Error en API verify certificate:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}

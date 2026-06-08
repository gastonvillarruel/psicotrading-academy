import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCampusCourseData } from '@/app/actions/campus';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { courseSlug } = await params;
    const result = await getCampusCourseData(courseSlug);

    if (!result.success) {
      const status = result.hasAccess === false ? 403 : 404;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error en API courseSlug:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}

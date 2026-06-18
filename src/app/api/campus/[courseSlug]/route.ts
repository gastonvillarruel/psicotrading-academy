import { NextResponse } from 'next/server';
import { validateApiSession } from '@/lib/auth-helpers';
import { getCampusCourseData } from '@/app/actions/campus';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  try {
    const { isValid, response } = await validateApiSession();
    if (!isValid) {
      return response!;
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

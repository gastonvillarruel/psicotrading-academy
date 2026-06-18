import { NextResponse } from 'next/server';
import { validateApiSession } from '@/lib/auth-helpers';
import { toggleLessonComplete } from '@/app/actions/campus';

export async function POST(request: Request) {
  try {
    const { isValid, response } = await validateApiSession();
    if (!isValid) {
      return response!;
    }

    const body = await request.json();
    const { lessonId, watchedSeconds } = body;

    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId es requerido' }, { status: 400 });
    }

    const result = await toggleLessonComplete(lessonId, watchedSeconds);

    if (!result.success) {
      const status = result.error?.includes('bloqueada') || result.error?.includes('acceso') ? 403 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error en API progress:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}

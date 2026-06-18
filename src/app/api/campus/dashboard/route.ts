import { NextResponse } from 'next/server';
import { validateApiSession } from '@/lib/auth-helpers';
import { getCampusDashboardData } from '@/app/actions/campus';

export async function GET(request: Request) {
  try {
    const { isValid, response } = await validateApiSession();
    if (!isValid) {
      return response!;
    }

    const result = await getCampusDashboardData();
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error en API dashboard:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}

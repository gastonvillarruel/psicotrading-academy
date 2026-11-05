import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { SnipersError } from './errors';

export async function pageData<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (error instanceof SnipersError) {
      if (error.code === 'SESSION') redirect('/login?callbackUrl=%2Fmi-campus%2Fsnipers');
      if (['DISABLED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION'].includes(error.code)) notFound();
    }
    throw new Error('No se pudo cargar Grupo de Snipers.');
  }
}

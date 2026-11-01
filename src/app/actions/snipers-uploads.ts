'use server';
import { snipersUploads } from '@/lib/snipers/upload-server';
import { respond } from '@/lib/snipers/action-result';

async function result<T>(work: () => Promise<T>) {
  const response = await respond(work);
  if (!response.ok && response.code === 'CONFIGURATION') return { ...response, message: 'La carga privada no está configurada. Falta conectar R2 de prueba.' };
  return response;
}
export async function startSnipersUpload(input: unknown) { return result(() => snipersUploads.start(input)); }
export async function getSnipersUpload(input: unknown) { return result(() => snipersUploads.get(input)); }
export async function advanceSnipersUpload(input: unknown) { return result(() => snipersUploads.advance(input)); }
export async function signSnipersUploadPart(input: unknown) { return result(() => snipersUploads.sign(input)); }
export async function completeSnipersUpload(input: unknown) { return result(() => snipersUploads.complete(input)); }
export async function cancelSnipersUpload(input: unknown) { return result(() => snipersUploads.cancel(input)); }

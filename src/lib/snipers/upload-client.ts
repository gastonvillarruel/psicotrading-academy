// Browser transport only. Files and part receipts live in this tab's memory.
import { fileDeclaration } from './file-contracts';
import type { UploadState } from './upload-contracts';

export function uploadTerminalMessage(state: Pick<UploadState, 'status' | 'errorCode' | 'expired'>): string | null {
  if (state.status === 'FAILED' && state.errorCode === 'UNSUPPORTED_M4A') {
    return 'Archivo M4A rechazado: variante de audio o contenedor no compatible.';
  }
  return state.expired || ['CANCELLED','EXPIRED','FAILED'].includes(state.status)
    ? 'Esta carga está cerrada o vencida. Cancelá el intento y elegí nuevamente el archivo.' : null;
}

export function browserDeclaration(file: Pick<File, 'name' | 'type' | 'size'>) {
  const extension = file.name.toLowerCase().split('.').pop();
  const declaration = extension === 'mp3' ? { type: 'MP3' as const, mimeType: 'audio/mpeg' as const, sizeBytes: file.size }
    : extension === 'm4a' ? { type: 'M4A' as const, mimeType: 'audio/mp4' as const, sizeBytes: file.size }
    : extension === 'pdf' ? { type: 'PDF' as const, mimeType: 'application/pdf' as const, sizeBytes: file.size } : null;
  // Some OS/browser pickers identify M4A as audio/x-m4a. Persist only audio/mp4.
  const mime = file.type === 'audio/x-m4a' && extension === 'm4a' ? 'audio/mp4' : file.type;
  if (!declaration || (mime && mime !== declaration.mimeType) || !fileDeclaration.safeParse(declaration).success) {
    throw new Error('Elegí un MP3 o M4A (AAC-LC) de hasta 250 MiB o un PDF de hasta 25 MiB, no vacío.');
  }
  return declaration;
}
export async function browserSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function sendPart(url: string, bytes: Blob, signal: AbortSignal, progress: (bytes: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const fail = () => { signal.removeEventListener('abort', abort); reject(new Error('No se pudo subir esta parte. Revisá la conexión y reintentá.')); };
    xhr.open('PUT', url);
    xhr.timeout = 180000;
    xhr.upload.onprogress = event => progress(event.loaded);
    xhr.onerror = fail; xhr.ontimeout = fail; xhr.onabort = fail;
    xhr.onload = () => {
      signal.removeEventListener('abort', abort);
      const etag = xhr.getResponseHeader('ETag');
      if (xhr.status < 200 || xhr.status >= 300 || !etag) { fail(); return; }
      resolve(etag);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { fail(); return; }
    // The browser derives Content-Length from this exact Blob slice; no extra Content-Type is needed.
    xhr.send(bytes);
  });
}

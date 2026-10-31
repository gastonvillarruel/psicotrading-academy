// Browser transport only. Files and part receipts live in this tab's memory.
import { fileDeclaration } from './file-contracts';

export function browserDeclaration(file: Pick<File, 'name' | 'type' | 'size'>) {
  const extension = file.name.toLowerCase().split('.').pop();
  const declaration = extension === 'mp3' ? { type: 'MP3' as const, mimeType: 'audio/mpeg' as const, sizeBytes: file.size }
    : extension === 'pdf' ? { type: 'PDF' as const, mimeType: 'application/pdf' as const, sizeBytes: file.size } : null;
  if (!declaration || (file.type && file.type !== declaration.mimeType) || !fileDeclaration.safeParse(declaration).success) {
    throw new Error('Elegí un MP3 de hasta 250 MiB o un PDF de hasta 25 MiB, no vacío.');
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

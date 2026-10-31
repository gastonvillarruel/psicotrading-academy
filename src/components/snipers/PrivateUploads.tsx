'use client';
import { useEffect, useRef, useState } from 'react';
import ConfirmModal from '@/components/admin/ConfirmModal';
import { startSnipersUpload, getSnipersUpload, signSnipersUploadPart, completeSnipersUpload, cancelSnipersUpload } from '@/app/actions/snipers-uploads';
import { browserDeclaration, browserSha256, sendPart } from '@/lib/snipers/upload-client';
import { PART_BYTES, type UploadState } from '@/lib/snipers/upload-contracts';
import type { ActionResult } from '@/lib/snipers/action-result';
import { buttonClass, secondaryClass, Field, inputClass } from './ui';

type Start = Parameters<typeof startSnipersUpload>[0];
type Attempt = { file: File; start: Start; uploadId?: string; parts: { partNumber: number; etag: string }[];
  completeId: string; cancelId: string; cancelling: boolean };
class UploadMessage extends Error { constructor(message: string, readonly code?: string) { super(message); } }
function data<T>(response: ActionResult<T>): T { if (!response.ok) throw new UploadMessage(response.message, response.code); return response.data; }
export default function PrivateUploads({ classId, archived }: { classId: string; archived: boolean }) {
  const [file, setFile] = useState<File | null>(null), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(0), [state, setState] = useState<UploadState | null>(null), [confirm, setConfirm] = useState(false);
  const [mode, setMode] = useState<'new' | 'active' | 'cancelling'>('new');
  const attempt = useRef<Attempt | null>(null), controller = useRef<AbortController | null>(null), alive = useRef(true), running = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const locked = busy || mode !== 'new';
  async function read(a: Attempt) {
    if (!a.uploadId) throw new UploadMessage('No se pudo confirmar el inicio. Reintentá el mismo envío.');
    const next = data(await getSnipersUpload({ uploadId: a.uploadId }));
    if (!alive.current) throw new UploadMessage('Carga interrumpida.');
    setState(next); return next;
  }
  async function wait(a: Attempt, statuses: string[], signal: AbortSignal) {
    for (let i = 0; i < 40; i++) {
      if (signal.aborted) throw new UploadMessage('Carga interrumpida.');
      const s = await read(a);
      if (statuses.includes(s.status)) return s;
      if (s.expired || ['CANCELLED','EXPIRED','FAILED'].includes(s.status)) throw new UploadMessage('Esta carga está cerrada o vencida. Cancelá el intento y elegí nuevamente el archivo.');
      if (s.blocked) throw new UploadMessage('La carga necesita revisión del administrador. Podés cancelarla e iniciar otra.');
      await new Promise<void>(resolve => { const timer = setTimeout(done, 1500); function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); } signal.addEventListener('abort', done, { once: true }); });
    }
    throw new UploadMessage('El procesador todavía no respondió. Consultá nuevamente en unos instantes.');
  }
  async function run() {
    if (running.current || archived || attempt.current?.cancelling) return;
    running.current = true; setBusy(true); setFailed(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      let a = attempt.current;
      if (!a) {
        if (!file) throw new UploadMessage('Seleccioná un archivo.');
        const declaration = browserDeclaration(file);
        setMessage('Calculando integridad del archivo…');
        const expectedSha256 = await browserSha256(file);
        if (abort.signal.aborted || !alive.current) return;
        a = { file, start: { operationId: crypto.randomUUID(), classId, name: name.trim() || file.name, file: declaration, expectedSha256 },
          parts: [], completeId: crypto.randomUUID(), cancelId: crypto.randomUUID(), cancelling: false };
        attempt.current = a;
        setMode('active');
      }
      if (!a.uploadId) {
        setMessage('Preparando carga privada…');
        const receipt = data(await startSnipersUpload(a.start)); a.uploadId = receipt.uploadId;
      }
      if (abort.signal.aborted || !alive.current) return;
      let s = await read(a);
      if (s.status === 'PREPARING') { setMessage('Esperando al procesador de archivos…'); s = await wait(a, ['UPLOADING'], abort.signal); }
      if (s.status === 'UPLOADING') {
        const count = Math.ceil(a.file.size / PART_BYTES);
        for (let index = a.parts.length; index < count; index++) {
          if (abort.signal.aborted) return;
          const blob = a.file.slice(index * PART_BYTES, Math.min((index + 1) * PART_BYTES, a.file.size));
          let uploaded = false;
          for (let retry = 0; retry < 3 && !uploaded; retry++) {
            if (abort.signal.aborted) return;
            setMessage(`Subiendo parte ${index + 1} de ${count}${retry ? ' · reintentando' : ''}…`);
            // Renew authorization and signature for each retry; never persist signed URLs.
            const signature = data(await signSnipersUploadPart({ uploadId: a.uploadId, partNumber: index + 1 }));
            if (abort.signal.aborted) return;
            try {
              const etag = await sendPart(signature.url, blob, abort.signal, bytes => { if (alive.current) setSent(index * PART_BYTES + bytes); });
              a.parts.push({ partNumber: index + 1, etag }); uploaded = true;
            } catch (error) { if (abort.signal.aborted) return; if (retry === 2) throw error; }
          }
        }
        if (abort.signal.aborted) return;
        setMessage('Confirmando transferencia…');
        data(await completeSnipersUpload({ operationId: a.completeId, uploadId: a.uploadId, parts: a.parts }));
      }
      if (abort.signal.aborted) return;
      s = await wait(a, ['PROCESSING'], abort.signal);
      if (s.transferComplete) { setSent(a.file.size); setMessage('Transferencia completada. El archivo sigue privado y pendiente de validación; todavía no está disponible para alumnos.'); }
    } catch (error) {
      if (alive.current && !abort.signal.aborted) {
        // A definitive rejected Start allocated nothing. Keep uncertain requests for UUID replay.
        if (!attempt.current?.uploadId && error instanceof UploadMessage && error.code
          && !['UNAVAILABLE','CONCURRENT'].includes(error.code)) { attempt.current = null; setMode('new'); }
        setMessage(error instanceof Error ? error.message : 'No se pudo completar la carga.'); setFailed(true);
      }
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function cancel() {
    setConfirm(false); const a = attempt.current;
    if (!a || running.current) return;
    a.cancelling = true; setMode('cancelling'); setBusy(true); setFailed(false);
    try {
      // Reconcile an uncertain Start with its original UUID before cancelling.
      if (!a.uploadId) a.uploadId = data(await startSnipersUpload(a.start)).uploadId;
      const r = data(await cancelSnipersUpload({ operationId: a.cancelId, uploadId: a.uploadId }));
      await read(a); setMessage(r.abortPending ? 'Carga cancelada. El aborto remoto está pendiente; reintentá la cancelación para confirmarlo.' : 'Carga cancelada. Podés seleccionar otro archivo.');
      if (!r.abortPending) { attempt.current = null; setMode('new'); setFile(null); setSent(0); }
      else setFailed(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo confirmar la cancelación.'); setFailed(true); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section aria-label="Archivos privados" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
    <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Archivos de la clase</p>
    <h2 className="mt-2 text-xl font-bold">Carga privada</h2>
    <p className="mt-2 text-sm text-slate-600">MP3 hasta 250 MiB · PDF hasta 25 MiB. Mantené esta pestaña abierta: las cargas interrumpidas no se retoman después de recargar.</p>
    {archived && mode === 'new' ? <p className="mt-4 text-sm">Restaurá la clase para cargar archivos.</p> : <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); void run(); }}>
      <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
        <Field label="Archivo MP3 o PDF"><input aria-label="Archivo MP3 o PDF" className={inputClass} type="file" accept=".mp3,.pdf,audio/mpeg,application/pdf" onChange={e => { const selected = e.target.files?.[0] ?? null; setFile(selected); setName(selected?.name ?? ''); setState(null); setMessage(''); setSent(0); }} /></Field>
        <Field label="Nombre del recurso"><input className={inputClass} maxLength={200} value={name} onChange={e => setName(e.target.value)} /></Field>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        {mode === 'new' && <button className={buttonClass} disabled={busy || !file} type="submit">{busy ? 'Preparando…' : 'Subir archivo privado'}</button>}
        {mode !== 'new' && !state?.transferComplete && <button type="button" className={buttonClass} disabled={busy || mode === 'cancelling'} onClick={() => void run()}>{busy ? 'Cargando…' : failed ? 'Reintentar carga' : 'Consultar estado'}</button>}
        {mode !== 'new' && <button type="button" className={secondaryClass} disabled={busy} onClick={() => setConfirm(true)}>{mode === 'cancelling' ? 'Reintentar cancelación' : 'Cancelar carga'}</button>}
        {state?.transferComplete && <button type="button" className={secondaryClass} disabled={busy} onClick={() => { attempt.current = null; setMode('new'); setFile(null); setState(null); setSent(0); setMessage(''); }}>Cargar otro archivo</button>}
      </div>
      {busy && mode === 'active' && <button type="button" className={secondaryClass} onClick={() => { controller.current?.abort(); setMessage('Transferencia pausada en esta pestaña. Podés reintentar o cancelar la carga.'); }}>Pausar transferencia</button>}
    </form>}
    {(file || state) && <div className="mt-5"><progress aria-label="Progreso de carga" className="h-2 w-full accent-teal-700" value={sent} max={file?.size || state?.sizeBytes || 1} /><p className="mt-1 text-xs text-slate-500">{Math.min(100, Math.floor(sent / (file?.size || state?.sizeBytes || 1) * 100))}% transferido</p></div>}
    {message && <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${failed ? 'bg-amber-50 text-amber-900' : 'bg-teal-50 text-teal-900'}`}>{message}</p>}
    <ConfirmModal isOpen={confirm} title="Cancelar carga privada" message="Se cerrará esta carga y no podrá retomarse. El archivo no se publicará." onCancel={() => setConfirm(false)} onConfirm={() => void cancel()} />
  </section>;
}

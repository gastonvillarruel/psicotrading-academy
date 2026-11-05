'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import ConfirmModal from '@/components/admin/ConfirmModal';
import {getSnipersStorageObjects,cleanSnipersStorageObject} from '@/app/actions/snipers-storage';
import type {StoragePage,StorageObjectView,StorageObjectState,StorageResource} from '@/lib/snipers/storage-management-contracts';
import {date} from '@/lib/snipers/presentation';
import {secondaryClass,Notice} from './ui';
import ResourceRetirement from './ResourceRetirement';

const stateLabels:Record<StorageObjectState,string>={PROTECTED:'Protegido',IN_USE:'Operaciones pendientes',RETAINED:'En conservación',
  ELIGIBLE:'Elegible para limpieza',RUNNING:'Limpieza en curso',UNCERTAIN:'Resultado incierto',ABSENT:'Ausencia confirmada',BLOCKED:'Requiere revisión',PENDING:'Pendiente de limpieza'};
const editorialLabels:Record<string,string>={DRAFT:'Clase en borrador',PUBLISHED:'Clase publicada',ARCHIVED:'Clase archivada'};
const technicalLabels:Record<string,string>={PENDING:'Carga pendiente',VERIFIED:'Archivo verificado',REJECTED:'Carga rechazada',ARCHIVED:'Recurso archivado'};
function bytes(value:string){
  const n=BigInt(value),units=['B','KiB','MiB','GiB','TiB','PiB'];let unit=0,divisor=BigInt(1);
  while(n>=divisor*BigInt(1024)&&unit<units.length-1){divisor*=BigInt(1024);unit++;}
  const scaled=n*BigInt(10)/divisor;
  return `${scaled/BigInt(10)}${unit?`,${scaled%BigInt(10)}`:''} ${units[unit]}`;
}
function Badge({children,tone='neutral'}:{children:React.ReactNode;tone?:'neutral'|'safe'|'warning'}){
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${tone==='safe'?'bg-teal-50 text-teal-900':tone==='warning'?'bg-amber-50 text-amber-900':'bg-slate-100 text-slate-700'}`}>{children}</span>;
}
type Attempt={operationId:string;objectId:string};
function ObjectDetails({resource}:{resource:StorageResource}){
  const router=useRouter();
  const storageKey=`snipers-storage-request:${resource.id}`;
  const [objects,setObjects]=useState<StorageObjectView[]|null>(null),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false),[denied,setDenied]=useState(false),[pending,setPending]=useState<Attempt|null>(()=>{
    try{
      const saved=typeof window==='undefined'?null:sessionStorage.getItem(storageKey);
      if(saved){const v=JSON.parse(saved);if(typeof v.operationId==='string'&&typeof v.objectId==='string')return {operationId:v.operationId,objectId:v.objectId};}
    }catch{/* Browser storage is optional. */}
    return null;
  });
  const [confirm,setConfirm]=useState<StorageObjectView|null>(null);
  const guard=useRef(false),mounted=useRef(true);
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;};
  },[]);
  function failure(code:string,text:string){
    setMessage(text);
    if(['SESSION','FORBIDDEN','DISABLED','CONFIGURATION'].includes(code)){setDenied(true);setObjects(null);}
  }
  async function load(){
    if(guard.current)return;guard.current=true;setBusy(true);
    try{
      const r=await getSnipersStorageObjects({resourceId:resource.id});
      if(!mounted.current)return;
      if(r.ok){setObjects(r.data);setMessage('');}else failure(r.code,r.message);
    }catch{if(mounted.current)setMessage('No se pudo actualizar la consulta. Reintentá.');}
    finally{guard.current=false;if(mounted.current)setBusy(false);}
  }
  async function run(attempt:Attempt){
    if(guard.current||denied)return;guard.current=true;setBusy(true);setPending(attempt);
    try{sessionStorage.setItem(storageKey,JSON.stringify(attempt));}catch{/* Continue with the in-memory attempt. */}
    try{
      const r=await cleanSnipersStorageObject(attempt);
      if(!mounted.current)return;
      if(r.ok){
        setObjects(items=>items?.map(o=>o.id===r.data.id?r.data:o)??[r.data]);
        setMessage(`${stateLabels[r.data.state]}. ${r.data.reason}`);
        setPending(null);try{sessionStorage.removeItem(storageKey);}catch{/* Optional browser storage. */}
        // Recovery can start before the detail was loaded. Refresh the complete
        // inventory so sibling objects never disappear from the result view.
        const latest=await getSnipersStorageObjects({resourceId:resource.id}).catch(()=>null);
        if(!mounted.current)return;
        if(latest?.ok){
          setObjects(latest.data);
          const current=latest.data.find(o=>o.id===r.data.id);
          if(current)setMessage(`${stateLabels[current.state]}. ${current.reason}`);
        }else if(latest&&['SESSION','FORBIDDEN','DISABLED','CONFIGURATION'].includes(latest.code))failure(latest.code,latest.message);
        else setMessage(m=>`${m} No se pudo actualizar el resto de las copias; usá Actualizar estado.`);
        router.refresh();
      }else{
        failure(r.code,r.message);
        if(!['UNAVAILABLE','CONCURRENT'].includes(r.code)){
          setPending(null);try{sessionStorage.removeItem(storageKey);}catch{/* Optional browser storage. */}
        }
        // A stale eligibility response must never leave its old delete control enabled.
        const latest=await getSnipersStorageObjects({resourceId:resource.id});
        if(mounted.current&&latest.ok&&!['SESSION','FORBIDDEN','DISABLED','CONFIGURATION'].includes(r.code))setObjects(latest.data);
      }
    }catch{if(mounted.current)setMessage('No se pudo confirmar el resultado. Consultá el estado o recuperá el mismo intento; no se acredita una eliminación.');}
    finally{guard.current=false;if(mounted.current)setBusy(false);}
  }
  return <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
    <ResourceRetirement resourceId={resource.id} name={resource.name}/>
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-slate-900">Objetos del archivo</h4>
      <button type="button" className={secondaryClass} disabled={busy||denied} onClick={load}>{busy?'Consultando…':objects?'Actualizar estado':'Consultar objetos'}</button></div>
    {objects?.length===0&&<Notice>Este recurso no tiene objetos registrados. No hay nada que limpiar desde esta pantalla.</Notice>}
    {objects?.map((o,i)=><div key={o.id} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{o.kind==='TEMPORARY'?'Copia temporal':'Copia final'} <span className="font-normal text-slate-500">· {i+1} · {o.sizeBytes===null?'Tamaño sin verificar':bytes(o.sizeBytes)}</span></p>
        <Badge tone={o.state==='ABSENT'||o.state==='ELIGIBLE'?'safe':o.state==='UNCERTAIN'||o.state==='BLOCKED'?'warning':'neutral'}>{stateLabels[o.state]}</Badge></div>
      <p className="mt-2 text-sm text-slate-600">{o.reason}</p>
      {o.availableAt&&<p className="mt-2 text-xs text-slate-600">Próxima fecha de revisión: {date(o.availableAt)}. La elegibilidad se comprueba nuevamente al ejecutar.</p>}
      {o.lastAbsentAt&&<p className="mt-2 text-xs text-slate-500">Última ausencia comprobada: {date(o.lastAbsentAt)}</p>}
      {o.canClean&&<button type="button" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy||denied||!!pending} onClick={()=>setConfirm(o)}>Limpiar objeto</button>}
    </div>)}
    {message&&<Notice>{message}</Notice>}
    {pending&&!denied&&<div className="flex flex-wrap items-center gap-3"><p className="text-sm text-amber-900">Hay una solicitud pendiente de confirmar.</p><button type="button" disabled={busy} className={secondaryClass} onClick={()=>run(pending)}>Recuperar mismo intento</button></div>}
    <ConfirmModal isOpen={!!confirm} title="Limpiar objeto retirado" variant="danger" confirmText="Confirmar limpieza"
      message={`Se solicitará la limpieza de una copia ${confirm?.kind==='TEMPORARY'?'temporal':'final retirada'} de «${resource.name}». Es irreversible si el protocolo confirma su eliminación. El servidor volverá a comprobar todas las protecciones.`}
      onCancel={()=>setConfirm(null)} onConfirm={()=>{if(!confirm)return;const target=confirm;setConfirm(null);void run({operationId:crypto.randomUUID(),objectId:target.id});}}/>
  </div>;
}
export default function StorageManagement({data}:{data:StoragePage}){
  const router=useRouter();const [opened,setOpened]=useState<string|null>(null);
  const s=data.summary;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Gestión de archivos privados">
    <header className="border-b border-slate-200 px-5 py-6 sm:px-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Administración de Snipers</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Archivos privados</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Consultá el material registrado y las copias que pueden limpiarse con seguridad. Un archivo desvinculado puede seguir protegido.</p></div>
      <button type="button" className={secondaryClass} onClick={()=>router.refresh()}>Actualizar resumen</button></div>
      <dl className="mt-6 grid gap-3 sm:grid-cols-3">{[['Recursos registrados',s.resources],['Tamaño lógico registrado',bytes(s.logicalBytes)],['Objetos pendientes de limpieza',s.pendingObjects]].map(([label,value])=><div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"><dt className="text-xs font-medium text-slate-600">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</dd></div>)}</dl>
      <p className="mt-4 text-xs leading-5 text-slate-500">Datos del registro de Snipers; no representan consumo físico ni facturación de R2. Los recursos y sus copias se contabilizan por separado.</p>
      <details className="mt-3 text-sm text-slate-700"><summary className="w-fit cursor-pointer font-semibold text-teal-800">Ver desglose de objetos</summary><dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {([['Objetos registrados (incluye historial)',s.objects],['Objetos con tamaño verificado',s.verifiedObjects],['Bytes verificados registrados (incluye historial)',bytes(s.verifiedBytes)],['Objetos con tamaño desconocido',s.unknownSizeObjects],['Objetos con ausencia confirmada',s.absentObjects],['Recursos sin objetos',s.withoutObjects]]).map(([label,value])=><div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt>{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
      </dl></details>
    </header>
    <div className="px-5 sm:px-7"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 py-4"><h3 className="text-sm font-bold text-slate-900">Material registrado</h3><span className="text-xs text-slate-500">25 recursos por página · Más recientes primero</span></div>
      {data.items.length===0?<div className="py-8"><Notice>No hay recursos en esta página.</Notice></div>:data.items.map(r=><article key={r.id} className="border-b border-slate-200 py-5 last:border-0">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge>{r.type}</Badge><h3 className="break-words font-bold text-slate-900">{r.name}</h3></div>
          <p className="mt-2 text-xs text-slate-500">{bytes(r.sizeBytes)} registrados · {date(r.createdAt)}</p>
          <p className="mt-3 break-words text-sm text-slate-700">Clase: <Link className="font-medium text-teal-800 underline underline-offset-2" href={`/mi-campus/snipers/gestion/contenido/clases/${r.classId}`}>{r.classTitle}</Link></p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-xs"><div><dt className="mb-1 text-slate-500">Utilización</dt><dd><Badge>{r.attached?'Vinculado a la clase':r.status==='VERIFIED'?'Desvinculado · protegido':'Desvinculado · no habilita borrado'}</Badge></dd></div>
            <div><dt className="mb-1 text-slate-500">Estado editorial</dt><dd><Badge>{editorialLabels[r.classStatus]??'Sin publicación'}</Badge></dd></div>
            <div><dt className="mb-1 text-slate-500">Estado del archivo</dt><dd><Badge>{technicalLabels[r.status]??'Pendiente de revisión'}</Badge></dd></div></dl>
        </div><button type="button" aria-expanded={opened===r.id} aria-controls={`objects-${r.id}`} className={secondaryClass} onClick={()=>setOpened(v=>v===r.id?null:r.id)}>{opened===r.id?'Cerrar detalle':`Ver objetos (${r.objectCount})`}</button></div>
        {opened===r.id&&<div id={`objects-${r.id}`}><ObjectDetails key={r.id} resource={r}/></div>}
      </article>)}
    </div>
    <nav aria-label="Páginas de archivos" className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-7"><div>{data.offset>0&&<Link className={secondaryClass} href={`?offset=${Math.max(0,data.offset-25)}`}>Anterior</Link>}</div><p className="text-xs text-slate-600">Página {Math.floor(data.offset/25)+1}</p><div>{data.hasMore&&<Link className={secondaryClass} href={`?offset=${data.offset+25}`}>Siguiente</Link>}</div></nav>
  </section>;
}

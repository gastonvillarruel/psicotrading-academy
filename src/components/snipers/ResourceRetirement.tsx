'use client';
import {useRef,useState,useSyncExternalStore} from 'react';
import {useRouter} from 'next/navigation';
import ConfirmModal from '@/components/admin/ConfirmModal';
import {getSnipersResourceRetirement,requestSnipersResourceRetirement} from '@/app/actions/snipers-storage';
import type {ResourceRetirementView} from '@/lib/snipers/resource-retirement-contracts';
import {date} from '@/lib/snipers/presentation';
import {secondaryClass,Notice} from './ui';

const labels:Record<ResourceRetirementView['state'],string>={PROTECTED:'Protegido',AVAILABLE:'Disponible para retirar',
  PENDING:'Pendiente de eliminación',RUNNING:'Eliminación en curso',BLOCKED:'Bloqueado',DELETED:'Eliminado'};
type Attempt={operationId:string;resourceId:string};
const subscribe=(notify:()=>void)=>{window.addEventListener('storage',notify);return()=>window.removeEventListener('storage',notify);};
export default function ResourceRetirement({resourceId,name,disabled=false,onChanged}:{resourceId:string;name:string;disabled?:boolean;onChanged?:()=>void}){
  const router=useRouter(),guard=useRef(false),key=`snipers-retirement:${resourceId}`;
  const [view,setView]=useState<ResourceRetirementView|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [denied,setDenied]=useState(false),[confirm,setConfirm]=useState(false);
  const [attempt,setPending]=useState<Attempt|null>(null);
  const saved=useSyncExternalStore(subscribe,()=>{try{return sessionStorage.getItem(key);}catch{return null;}},()=>null);
  let recovered:Attempt|null=null;
  try{if(saved){const v=JSON.parse(saved);if(typeof v.operationId==='string'&&v.resourceId===resourceId)recovered={operationId:v.operationId,resourceId};}}catch{/* Optional browser storage. */}
  const pending=attempt??recovered;
  function failure(code:string,text:string){
    setMessage(text);setView(null);
    if(['SESSION','FORBIDDEN','DISABLED','CONFIGURATION'].includes(code))setDenied(true);
  }
  async function load(){
    if(guard.current)return;guard.current=true;setBusy(true);
    try{const r=await getSnipersResourceRetirement({resourceId});if(r.ok){setView(r.data);setMessage('');}else failure(r.code,r.message);}
    catch{setView(null);setMessage('No se pudo consultar el estado. Reintentá.');}
    finally{guard.current=false;setBusy(false);}
  }
  async function run(attempt:Attempt){
    if(guard.current||denied||disabled)return;guard.current=true;setBusy(true);setPending(attempt);
    try{sessionStorage.setItem(key,JSON.stringify(attempt));}catch{/* Optional browser storage. */}
    try{
      const r=await requestSnipersResourceRetirement(attempt);
      if(r.ok){setView(r.data);setMessage('');setPending(null);
        try{sessionStorage.removeItem(key);}catch{/* Optional browser storage. */}
        onChanged?.();router.refresh();
      }else{failure(r.code,r.message);
        if(!['UNAVAILABLE','CONCURRENT'].includes(r.code)){setPending(null);try{sessionStorage.removeItem(key);}catch{/* Optional browser storage. */}}
      }
    }catch{setView(null);setMessage('No se pudo confirmar el resultado. Consultá el estado o recuperá el mismo intento.');}
    finally{guard.current=false;setBusy(false);}
  }
  return <section aria-label={`Retiro definitivo de ${name}`} className="mt-3 w-full space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-bold">Retiro definitivo del archivo</h4>
      <button type="button" className={secondaryClass} disabled={busy||denied} onClick={()=>void load()}>{busy?'Consultando…':view?'Actualizar retiro':'Consultar retiro definitivo'}</button></div>
    {view&&<div aria-live="polite"><p className="font-semibold">{labels[view.state]}</p><p className="mt-1 text-sm text-slate-700">{view.reason}</p>
      {view.availableAt&&<p className="mt-2 text-sm">Próxima revisión: {date(view.availableAt)}. La fecha no garantiza la eliminación.</p>}
      {(view.canRequest||view.canContinue)&&<button type="button" className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
        disabled={busy||disabled||denied||!!pending} onClick={()=>setConfirm(true)}>{view.canRequest?'Solicitar eliminación definitiva':'Continuar eliminación'}</button>}
    </div>}
    {message&&<Notice>{message}</Notice>}
    {pending&&!denied&&<div><p className="text-sm text-amber-900">Hay una solicitud cuyo resultado debe recuperarse.</p><button type="button" className={secondaryClass} disabled={busy||disabled} onClick={()=>void run(pending)}>Recuperar solicitud de retiro</button></div>}
    <ConfirmModal isOpen={confirm} title="Eliminar archivo definitivamente" variant="danger" confirmText="Confirmar eliminación definitiva"
      message={`Se solicitará la eliminación definitiva de «${name}». Es una operación distinta de desvincular: el archivo no podrá volver a vincularse ni recibir nuevos enlaces. La eliminación física completada es irreversible. Se respetarán la conservación y las operaciones pendientes; no se declarará eliminado hasta confirmar su ausencia.`}
      onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);void run({operationId:crypto.randomUUID(),resourceId});}}/>
  </section>;
}

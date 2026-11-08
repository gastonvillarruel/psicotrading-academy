'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import ConfirmModal from '@/components/admin/ConfirmModal';
import {discardSnipersResource} from '@/app/actions/snipers-storage';
import {resourceDiscardSchema} from '@/lib/snipers/storage-management-contracts';

export default function DiscardResourceButton({resourceId,name,linked=false,disabled=false,onDiscard}:
  {resourceId:string;name:string;linked?:boolean;disabled?:boolean;onDiscard?:()=>void}){
  const router=useRouter(),guard=useRef(false);
  const key=`snipers-discard:${resourceId}`;
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [denied,setDenied]=useState(false),[done,setDone]=useState(false);
  const [pending,setPending]=useState<{operationId:string;resourceId:string}|null>(null);
  async function run(){
    if(guard.current||disabled||denied)return;
    guard.current=true;setBusy(true);setConfirm(false);
    let saved:null|{operationId:string;resourceId:string}=null;
    try{const raw=sessionStorage.getItem(key);
      if(raw){const p=resourceDiscardSchema.safeParse(JSON.parse(raw));if(p.success&&p.data.resourceId===resourceId)saved=p.data;}
    }catch{/* Browser storage is optional. */}
    const command=pending??saved??{operationId:crypto.randomUUID(),resourceId};setPending(command);
    try{sessionStorage.setItem(key,JSON.stringify(command));}catch{/* Optional browser storage. */}
    function clear(){setPending(null);try{sessionStorage.removeItem(key);}catch{/* Optional browser storage. */}}
    try{
      const r=await discardSnipersResource(command);
      if(r.ok){
        if(r.data.state==='DISCARDED'){
          clear();setDone(true);setMessage('Archivo eliminado de la lista. La limpieza del almacenamiento queda pendiente hasta que sea segura.');
          onDiscard?.();router.refresh();
        }else if(r.data.state==='LINKED'){clear();setMessage('Desvinculá el archivo de la clase antes de eliminarlo.');}
        else setMessage('La carga todavía tiene una operación en curso. Esperá unos instantes y reintentá la eliminación.');
      }else{
        setMessage(['UNAVAILABLE','CONCURRENT','INTEGRITY'].includes(r.code)
          ?'No se pudo confirmar la eliminación. Recuperá el mismo intento para consultar el resultado.':r.message);
        if(['SESSION','FORBIDDEN','DISABLED','CONFIGURATION','IDEMPOTENCY_CONFLICT'].includes(r.code))setDenied(true);
        else if(!['UNAVAILABLE','CONCURRENT','INTEGRITY'].includes(r.code))clear();
      }
    }catch{setMessage('No se pudo confirmar la eliminación. Recuperá el mismo intento para consultar el resultado.');}
    finally{guard.current=false;setBusy(false);}
  }
  return <div className="max-w-md space-y-2">
    {!done&&<button type="button" disabled={disabled||busy||denied||linked} onClick={()=>pending?void run():setConfirm(true)}
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
      {busy?'Eliminando…':pending?'Recuperar eliminación':'Eliminar archivo'}</button>}
    {linked&&<p className="text-xs text-slate-600">Desvinculá el archivo de la clase antes de eliminarlo.</p>}
    {message&&<p role="status" className="text-sm text-slate-700">{message}</p>}
    <ConfirmModal isOpen={confirm} title="Eliminar archivo" variant="danger" confirmText="Eliminar archivo"
      message={`«${name}» dejará de aparecer entre los archivos disponibles. Esta acción no se puede deshacer. El sistema conservará el historial y limpiará sus copias cuando sea seguro.`}
      onCancel={()=>setConfirm(false)} onConfirm={()=>void run()}/>
  </div>;
}

'use client';
import { useRef, useState } from 'react';
import type { ActionResult } from '@/lib/snipers/action-result';
import type { EditorialReceipt } from '@/lib/snipers/content-contracts';

type Action=(input:unknown)=>Promise<ActionResult<EditorialReceipt>>;
export function useEditorialCommand() {
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [uncertain,setUncertain]=useState(false);const [denied,setDenied]=useState(false);
  const pending=useRef<{action:Action;input:unknown;done:(r:EditorialReceipt)=>Promise<void>|void}|null>(null);
  async function execute() {
    if(!pending.current||busy)return;
    const send=pending.current;setBusy(true);
    try {
      const response=await send.action(send.input);
      if(response.ok){await send.done(response.data);pending.current=null;setUncertain(false);setMessage(response.data.replayed?'Guardado confirmado anteriormente.':'Cambios guardados.');}
      else if(['SESSION','FORBIDDEN','DISABLED','CONFIGURATION','IDEMPOTENCY_CONFLICT'].includes(response.code)){setDenied(true);setMessage('El acceso cambió. Volvé al campus y verificá tu sesión.');}
      else if(['UNAVAILABLE','CONCURRENT','INTEGRITY'].includes(response.code)){setUncertain(true);setMessage('Resultado pendiente de confirmar. Reintentá exactamente el mismo envío.');}
      // A confirmed uniqueness rejection rolled back. Drop its envelope; the next run gets a new UUID.
      else if(response.code==='DUPLICATE_SLUG'){pending.current=null;setUncertain(false);setMessage(response.message);}
      else {pending.current=null;setUncertain(false);setMessage(response.code==='STALE'?'Otra persona modificó el contenido. Tu texto sigue aquí; compará con la versión actual antes de reemplazarlo.':response.code==='INVALID_STATE'?'El estado actual no permite esta operación. Recargá el registro.':response.code==='VALIDATION'?'Revisá los datos, enlaces y límites del contenido.':response.message);}
    }catch{setUncertain(true);setMessage('No se pudo confirmar el resultado. Reintentá el mismo envío.');}
    finally{setBusy(false);}
  }
  function run(action:Action,input:unknown,done:(r:EditorialReceipt)=>Promise<void>|void) {
    if(pending.current||busy)return;
    pending.current={action,input,done};void execute();
  }
  return {busy,message,uncertain,denied,run,retry:()=>void execute()};
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { signSnipersResource } from '@/app/actions/snipers-content';
import type { PublishedResource } from '@/lib/snipers/content-contracts';
import { buttonClass, secondaryClass } from './ui';

function Resource({resource}:{resource:PublishedResource}) {
  const audio=useRef<HTMLAudioElement>(null);
  const signature=useRef<{url:string;expiresAt:string}|null>(null);
  const alive=useRef(false),running=useRef(false),recovered=useRef(false);
  const wantsPlay=useRef(false);
  const restore=useRef<(()=>void)|null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    alive.current=true;const media=audio.current;
    return ()=>{alive.current=false;signature.current=null;if(media){if(restore.current)media.removeEventListener('loadedmetadata',restore.current);media.pause();media.removeAttribute('src');media.load();}};
  },[]);
  function stop(){const media=audio.current;signature.current=null;wantsPlay.current=false;if(media){if(restore.current)media.removeEventListener('loadedmetadata',restore.current);restore.current=null;media.pause();media.removeAttribute('src');media.load();}}
  async function obtain(mode:'PLAY'|'DOWNLOAD') {
    const result=await signSnipersResource({resourceId:resource.id,mode});
    if(!alive.current)return null;
    if(!result.ok){stop();setMessage(['FORBIDDEN','SESSION','DISABLED'].includes(result.code)?'Tu acceso cambió. Volvé al campus y verificá tu membresía.':['NOT_FOUND','INVALID_STATE'].includes(result.code)?'Este archivo fue retirado o ya no está disponible.':result.code==='CONFIGURATION'?result.message:'No se pudo acceder al archivo. Reintentá en unos instantes.');return null;}
    return result.data;
  }
  async function play(manual=false,force=false) {
    const media=audio.current;
    if(!media||running.current)return;
    if(!force&&signature.current&&Date.parse(signature.current.expiresAt)>Date.now()+15000){if(manual)await media.play().catch(()=>{});return;}
    running.current=true;setBusy(true);setMessage('');
    const position=Number.isFinite(media.currentTime)?media.currentTime:0,shouldPlay=manual||!media.paused||wantsPlay.current;
    media.pause();
    if(manual)recovered.current=false;
    try {
      const next=await obtain('PLAY');if(!next)return;
      signature.current=next;
      if(restore.current)media.removeEventListener('loadedmetadata',restore.current);
      const loaded=()=>{
        restore.current=null;if(!alive.current)return;
        if(position>0&&Number.isFinite(media.duration))media.currentTime=Math.min(position,Math.max(0,media.duration-0.01));
        if(shouldPlay)void media.play().catch(()=>{if(alive.current)setMessage('Pulsá reproducir en el control de audio para continuar.');});
      };
      restore.current=loaded;media.addEventListener('loadedmetadata',loaded,{once:true});media.src=next.url;media.load();
    }catch{if(alive.current){stop();setMessage('No se pudo renovar el acceso. Reintentá la reproducción.');}}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  function recover(){
    if(running.current||!signature.current)return;
    if(!recovered.current&&Date.parse(signature.current.expiresAt)<=Date.now()+15000){recovered.current=true;void play(false,true);}
    else{stop();setMessage('No se pudo reproducir el archivo. Pulsá Reproducir MP3 para reintentar.');}
  }
  async function download(){
    if(running.current)return;running.current=true;setBusy(true);setMessage('');
    try{const next=await obtain('DOWNLOAD');if(!next)return;const link=document.createElement('a');link.href=next.url;link.rel='noreferrer';link.referrerPolicy='no-referrer';document.body.append(link);link.click();link.remove();setMessage('Descarga solicitada. Si se interrumpe, volvé a pulsar Descargar.');}
    catch{if(alive.current)setMessage('No se pudo iniciar la descarga. Reintentá.');}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return <li className="space-y-3 py-5"><h3 className="break-words font-semibold">{resource.name} · {resource.type}</h3>
    {resource.type==='MP3'&&<><audio ref={audio} aria-label={`Audio: ${resource.name}`} controls preload="none" crossOrigin="anonymous" className="w-full" onPlay={()=>{wantsPlay.current=true;void play();}} onPause={()=>{if(!running.current)wantsPlay.current=false;}} onSeeking={()=>void play()} onError={recover}/><button type="button" className={secondaryClass} disabled={busy} onClick={()=>void play(true)}>Reproducir MP3</button></>}
    <button type="button" className={`${buttonClass} ml-2`} disabled={busy} onClick={()=>void download()}>{busy?'Solicitando acceso…':`Descargar ${resource.type}`}</button>
    {message&&<p role="status" className="text-sm text-slate-700">{message}</p>}
  </li>;
}
export default function PrivateResources({resources}:{resources:PublishedResource[]}) {
  if(!resources.length)return null;
  return <section aria-label="Material de la clase" className="mt-8 border-t border-slate-200 pt-6"><h2 className="text-xl font-bold">Material de la clase</h2><ul className="divide-y divide-slate-200">{resources.map(resource=><Resource key={resource.id} resource={resource}/>)}</ul></section>;
}

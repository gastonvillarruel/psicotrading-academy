'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ConfirmModal from '@/components/admin/ConfirmModal';
import { createSnipersCategory,saveSnipersCategory,createSnipersMeeting,saveSnipersMeeting,transitionSnipersContent,getSnipersEditorialOperation,getSnipersEditorialMeeting } from '@/app/actions/snipers-content';
import { date,localInput,inputInstant } from '@/lib/snipers/presentation';
import type { Publication,EditorialEntity } from '@/lib/snipers/content-contracts';
import { Field,inputClass,buttonClass,secondaryClass,Notice } from './ui';
import { useEditorialCommand } from './useEditorialCommand';

type Category={id:string;name:string;slug:string;version:number;archivedAt:string|null};
type Meeting={id:string;title:string;startsAt:string;endsAt:string;status:Publication;version:number;privateJoinUrl?:string};
type Class={id:string;title:string;classDate:string;status:Publication;version:number};
type Event={actorName:string;operationId:string;kind:string;version:number;changedFields:string[];createdAt:string;entity:EditorialEntity;id:string};
const labels:Record<string,string>={DRAFT:'Borrador',PUBLISHED:'Publicada',ARCHIVED:'Archivada',CREATE:'Creación',SAVE:'Guardado',PUBLISH:'Publicación',WITHDRAW:'Retiro',ARCHIVE:'Archivado',RESTORE:'Restauración',ATTACH:'Vinculación de archivo',DETACH:'Desvinculación de archivo',CLASS:'Clase',CATEGORY:'Categoría',MEETING:'Encuentro'};

function CategoryForm({item,done}:{item:Category|null;done:()=>void}){
  const [base,setBase]=useState(item);
  const [name,setName]=useState(item?.name??'');const [slug,setSlug]=useState(item?.slug??'');const c=useEditorialCommand();
  const [replacement,setReplacement]=useState<Category|null>(null);
  const changed=!!item&&!!base&&item.version!==base.version;
  function loadRemote(){if(!replacement)return;setBase(replacement);setName(replacement.name);setSlug(replacement.slug);setReplacement(null);}
  return <form className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/30 p-5" onSubmit={e=>{
    e.preventDefault();if(changed||base?.archivedAt)return;
    c.run(base?saveSnipersCategory:createSnipersCategory,{operationId:crypto.randomUUID(),name,...(base?{id:base.id,expectedVersion:base.version}:{slug})},done);
  }}><h3 className="font-bold">{base?'Editar categoría':'Nueva categoría'}</h3>
    {changed&&<Notice>Hay una revisión remota. Tus campos locales se conservan. Cargá esa revisión antes de guardar. <button type="button" className={secondaryClass} disabled={c.busy||c.uncertain||c.denied} onClick={()=>setReplacement(item)}>Cargar revisión remota</button></Notice>}
    {!c.denied&&<fieldset disabled={c.busy||c.uncertain||!!base?.archivedAt} className="space-y-4">
      <Field label="Nombre de categoría"><input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} className={inputClass}/></Field>
      {!base&&<Field label="Identificador de categoría"><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="gestion-emocional" value={slug} onChange={e=>setSlug(e.target.value)} className={inputClass}/></Field>}
      <button className={buttonClass} disabled={changed}>Guardar categoría</button>
    </fieldset>}
    <button className={secondaryClass} type="button" disabled={c.busy||c.uncertain} onClick={done}>Cerrar</button>
    {c.message&&<Notice>{c.message}</Notice>}{c.uncertain&&<button type="button" className={buttonClass} onClick={c.retry}>Reintentar mismo envío</button>}
    <ConfirmModal isOpen={!!replacement} title="Cargar revisión remota" message={`Se reemplazarán tus campos locales por la categoría «${replacement?.name??''}».`} cancelText="Conservar mis cambios" onCancel={()=>setReplacement(null)} onConfirm={loadRemote}/>
  </form>;
}
function MeetingForm({id,item,revisionSource,done}:{id:string|null;item:Meeting|null;revisionSource:Meeting[];done:()=>void}){
  const [base,setBase]=useState(item);
  const [title,setTitle]=useState(item?.title??'');const [start,setStart]=useState(()=>localInput(item?.startsAt??new Date().toISOString()));const [end,setEnd]=useState(()=>localInput(item?.endsAt??new Date(Date.now()+3600000).toISOString()));const [url,setUrl]=useState(item?.privateJoinUrl??'');const [error,setError]=useState('');const c=useEditorialCommand();
  const [replacement,setReplacement]=useState<Meeting|null>(null);
  const [attempt,setAttempt]=useState(0);
  type ReadResult=Awaited<ReturnType<typeof getSnipersEditorialMeeting>>;
  const [read,setRead]=useState<{id:string;source:Meeting[];attempt:number;result:ReadResult}|null>(null);
  useEffect(()=>{
    if(!id)return;
    let active=true;
    void getSnipersEditorialMeeting(id).catch(():ReadResult=>({ok:false,code:'UNAVAILABLE',message:''})).then(result=>{
      if(active)setRead({id,source:revisionSource,attempt,result});
    });
    return()=>{active=false;};
  },[id,revisionSource,attempt]);
  const result=read?.id===id&&read.source===revisionSource&&read.attempt===attempt?read.result:null;
  const checking=!!id&&!result;
  const latest=result?.ok&&result.data.id===id&&(!base||result.data.version>=base.version)?result.data:null;
  const readFailed=!!id&&!checking&&!latest;
  const readDenied=!!result&&!result.ok&&['SESSION','FORBIDDEN','DISABLED','CONFIGURATION'].includes(result.code);
  const readMessage=result&&!result.ok&&result.code==='NOT_FOUND'?'El encuentro no está disponible. Tus campos locales se conservan.':readDenied?'No tenés acceso para consultar este encuentro. Tus campos locales se conservan.':'No se pudo consultar la revisión del encuentro. Tus campos locales se conservan.';
  const changed=!!id&&!!latest&&(!base||latest.version!==base.version);
  const readBlocked=!!id&&(checking||readFailed||!base);
  function loadRemote(){if(!replacement||!latest||replacement.id!==latest.id||replacement.version!==latest.version){setReplacement(null);return;}setBase(replacement);setTitle(replacement.title);setStart(localInput(replacement.startsAt));setEnd(localInput(replacement.endsAt));setUrl(replacement.privateJoinUrl??'');setError('');setReplacement(null);}
  return <form className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/30 p-5" onSubmit={e=>{
    e.preventDefault();if(changed||readBlocked||base?.status==='ARCHIVED')return;
    try{setError('');c.run(base?saveSnipersMeeting:createSnipersMeeting,{operationId:crypto.randomUUID(),title,startsAt:inputInstant(start),endsAt:inputInstant(end),privateJoinUrl:url,...(base?{id:base.id,expectedVersion:base.version}:{})},done);}catch{setError('Revisá las fechas.');}
  }}><h3 className="font-bold">{id?'Editar encuentro':'Nuevo encuentro'}</h3>
    {changed&&<Notice>Hay una revisión remota. Tus campos locales se conservan. Cargá esa revisión antes de guardar. <button type="button" className={secondaryClass} disabled={c.busy||c.uncertain||c.denied} onClick={()=>setReplacement(latest)}>Cargar revisión remota</button></Notice>}
    {checking&&<Notice>Consultando la revisión del encuentro…</Notice>}
    {readFailed&&<Notice>{readMessage} <button type="button" className={secondaryClass} disabled={c.busy||c.uncertain} onClick={()=>setAttempt(n=>n+1)}>Reintentar consulta</button></Notice>}
    {!c.denied&&<fieldset disabled={c.busy||c.uncertain||readDenied||base?.status==='ARCHIVED'} className="space-y-4">
      <Field label="Título del encuentro"><input required maxLength={200} className={inputClass} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Inicio del encuentro (Argentina)"><input type="datetime-local" step="0.001" required className={inputClass} value={start} onChange={e=>setStart(e.target.value)}/></Field><Field label="Fin del encuentro (Argentina)"><input type="datetime-local" step="0.001" required className={inputClass} value={end} onChange={e=>setEnd(e.target.value)}/></Field></div>
      <Field label="Enlace privado Zoom"><input type="url" required maxLength={2048} className={inputClass} placeholder="https://…zoom.us/j/…" value={url} onChange={e=>setUrl(e.target.value)}/></Field>
      <button className={buttonClass} disabled={changed||readBlocked}>Guardar encuentro</button>
    </fieldset>}
    <button className={secondaryClass} type="button" disabled={c.busy||c.uncertain} onClick={done}>Cerrar</button>
    {(c.message||error)&&<Notice>{c.message||error}</Notice>}{c.uncertain&&<button type="button" className={buttonClass} onClick={c.retry}>Reintentar mismo envío</button>}
    <ConfirmModal isOpen={!!replacement} title="Cargar revisión remota" message={`Se reemplazarán tus campos locales por el encuentro «${replacement?.title??''}», incluidas sus fechas y enlace Zoom.`} cancelText="Conservar mis cambios" onCancel={()=>setReplacement(null)} onConfirm={loadRemote}/>
  </form>;
}
export default function EditorialManagement({tab,classes,meetings,categories,events,offset,hasMore,status}:{tab:string;classes:Class[];meetings:Meeting[];categories:Category[];events:Event[];offset:number;hasMore:boolean;status:string}){
  const router=useRouter();const c=useEditorialCommand();const [form,setForm]=useState<{kind:'CATEGORY'|'MEETING';id:string|null}|null>(null);const [transition,setTransition]=useState<{id:string;entity:EditorialEntity;expectedVersion:number;transition:string}|null>(null);
  const [operationId,setOperationId]=useState('');const [reconciled,setReconciled]=useState('');
  function done(){setForm(null);router.refresh();}
  if(c.denied)return <Notice>{c.message}</Notice>;
  const pagination=(n:number)=>`?tab=${tab}&offset=${n}${status?`&status=${status}`:''}`;
  function buttons(item:{id:string;version:number;status?:Publication;archivedAt?:string|null},entity:EditorialEntity){
    const archived=entity==='CATEGORY'?!!item.archivedAt:item.status==='ARCHIVED';
    return <div className="flex flex-wrap gap-2">{!archived&&<button className={secondaryClass} onClick={()=>setForm({kind:entity as 'CATEGORY'|'MEETING',id:item.id})}>Editar</button>}{(entity==='CATEGORY'?(archived?['RESTORE']:['ARCHIVE']):archived?['RESTORE']:item.status==='PUBLISHED'?['WITHDRAW','ARCHIVE']:['PUBLISH','ARCHIVE']).map(t=><button className={secondaryClass} disabled={c.busy||c.uncertain} key={t} onClick={()=>setTransition({id:item.id,entity,expectedVersion:item.version,transition:t})}>{t==='PUBLISH'?'Publicar':t==='WITHDRAW'?'Retirar':t==='ARCHIVE'?'Archivar':entity==='CATEGORY'?'Restaurar categoría':'Restaurar borrador'}</button>)}</div>;
  }
  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Espacio del mentor</p><h2 className="mt-2 text-2xl font-bold">Contenido académico</h2></div><nav aria-label="Gestión de contenido" className="flex flex-wrap gap-2">{[['clases','Clases'],['categorias','Categorías'],['agenda','Encuentros'],['auditoria','Auditoría editorial']].map(([key,label])=><Link key={key} href={`?tab=${key}`} aria-current={tab===key?'page':undefined} className={tab===key?buttonClass:secondaryClass}>{label}</Link>)}</nav>
    {(tab==='clases'||tab==='agenda')&&<form className="flex flex-wrap items-end gap-2"><input type="hidden" name="tab" value={tab}/><Field label="Estado editorial"><select className={inputClass} name="status" defaultValue={status}><option value="">Todos</option><option value="DRAFT">Borrador</option><option value="PUBLISHED">Publicada</option><option value="ARCHIVED">Archivada</option></select></Field><button className={secondaryClass}>Filtrar</button></form>}
    {tab==='clases'&&<><Link href="/mi-campus/snipers/gestion/contenido/clases/nueva" className={buttonClass}>Nueva clase</Link><div className="divide-y divide-slate-200">{classes.length?classes.map(item=><article key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-5"><div className="min-w-0"><p className="text-xs font-semibold text-teal-800">{labels[item.status]} · {date(item.classDate)}</p><h3 className="mt-1 break-words font-bold">{item.title}</h3></div><Link className={secondaryClass} href={`/mi-campus/snipers/gestion/contenido/clases/${item.id}`}>Abrir editor</Link></article>):<Notice>No hay clases en esta selección.</Notice>}</div></>}
    {tab==='categorias'&&<><button className={buttonClass} onClick={()=>setForm({kind:'CATEGORY',id:null})}>Nueva categoría</button>{form?.kind==='CATEGORY'&&<CategoryForm key={form.id??'new'} item={categories.find(x=>x.id===form.id)??null} done={done}/>}<div className="divide-y divide-slate-200">{categories.map(item=><article key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-5"><p className="break-words font-semibold">{item.name}{item.archivedAt?' · Archivada':''}</p>{buttons(item,'CATEGORY')}</article>)}</div></>}
    {tab==='agenda'&&<><button className={buttonClass} onClick={()=>setForm({kind:'MEETING',id:null})}>Nuevo encuentro</button>{form?.kind==='MEETING'&&<MeetingForm key={form.id??'new'} id={form.id} item={meetings.find(x=>x.id===form.id)??null} revisionSource={meetings} done={done}/>}<div className="divide-y divide-slate-200">{meetings.length?meetings.map(item=><article key={item.id} className="space-y-3 py-5"><p className="text-xs font-semibold text-teal-800">{labels[item.status]} · {date(item.startsAt)} → {date(item.endsAt)}</p><h3 className="break-words font-bold">{item.title}</h3>{buttons(item,'MEETING')}</article>):<Notice>No hay encuentros en esta selección.</Notice>}</div></>}
    {tab==='auditoria'&&<><form className="flex flex-wrap items-end gap-2" onSubmit={async e=>{e.preventDefault();const r=await getSnipersEditorialOperation(operationId);setReconciled(r.ok?r.data?`Operación confirmada. ${labels[r.data.result.entity]} guardada. Consultá su estado actual.`:'No hay recibo confirmado. Esto no prueba que el envío haya fallado.':r.message);}}><Field label="Consultar código de operación"><input className={inputClass} required value={operationId} onChange={e=>setOperationId(e.target.value)}/></Field><button className={secondaryClass}>Consultar resultado</button></form>{reconciled&&<Notice>{reconciled}</Notice>}<div className="divide-y divide-slate-200">{events.map(event=><article key={event.operationId} className="py-4"><p className="font-semibold">{labels[event.entity]} · {labels[event.kind.split('_')[1]]}</p><p className="mt-1 text-sm text-slate-600">{date(event.createdAt)} · {event.actorName} · Revisión {event.version}</p></article>)}</div></>}
    {c.message&&<Notice>{c.message}</Notice>}{c.uncertain&&<button className={buttonClass} onClick={c.retry}>Reintentar mismo envío</button>}
    {tab!=='categorias'&&<nav aria-label="Páginas de gestión" className="flex gap-3">{offset>0&&<Link className={secondaryClass} href={pagination(Math.max(0,offset-25))}>Anterior</Link>}{hasMore&&<Link className={secondaryClass} href={pagination(offset+25)}>Siguiente</Link>}</nav>}
    <ConfirmModal isOpen={!!transition} title="Confirmar cambio editorial" message="Se aplicará al registro guardado. La publicación habilita el acceso del grupo; el retiro o archivado lo deshabilita." onCancel={()=>setTransition(null)} onConfirm={()=>{if(!transition)return;const value=transition;setTransition(null);c.run(transitionSnipersContent,{operationId:crypto.randomUUID(),...value},done);}}/>
  </section>;
}

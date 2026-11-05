'use client';
import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { ContentDocument } from '@/lib/snipers/content-document';
import { safeHttps } from '@/lib/snipers/content-document';
import { inputClass, secondaryClass } from './ui';

export default function RichTextEditor({initial,onChange,disabled}:{initial:ContentDocument;onChange:(doc:unknown)=>void;disabled:boolean}) {
  // Uncontrolled document: ClassEditor changes editorKey only when it accepts a
  // complete revision (fields + base version). A prop refresh must not replace edits.
  const [href,setHref]=useState('');const [error,setError]=useState('');
  const editor=useEditor({immediatelyRender:false,content:initial,editable:!disabled,
    extensions:[StarterKit.configure({heading:{levels:[2,3]},code:false,codeBlock:false,strike:false,underline:false,trailingNode:false,link:{openOnClick:false,autolink:false,linkOnPaste:false}})],
    editorProps:{attributes:{role:'textbox','aria-label':'Contenido de la clase','aria-multiline':'true',class:'min-h-72 p-5 outline-none [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:text-xl [&_h3]:font-bold [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_a]:underline'}},
    onUpdate:({editor})=>onChange(editor.getJSON()),
  });
  useEffect(()=>{editor?.setEditable(!disabled,false);},[editor,disabled]);
  const tools:[string,()=>void][]=[['Negrita',()=>{editor?.chain().focus().toggleBold().run();}],['Cursiva',()=>{editor?.chain().focus().toggleItalic().run();}],['Título 2',()=>{editor?.chain().focus().toggleHeading({level:2}).run();}],['Título 3',()=>{editor?.chain().focus().toggleHeading({level:3}).run();}],['Lista',()=>{editor?.chain().focus().toggleBulletList().run();}],['Lista numerada',()=>{editor?.chain().focus().toggleOrderedList().run();}],['Cita',()=>{editor?.chain().focus().toggleBlockquote().run();}],['Separador',()=>{editor?.chain().focus().setHorizontalRule().run();}],['Deshacer',()=>{editor?.chain().focus().undo().run();}],['Rehacer',()=>{editor?.chain().focus().redo().run();}]];
  return <fieldset disabled={disabled} className="overflow-hidden rounded-xl border border-slate-300 bg-white"><legend className="sr-only">Editor visual</legend><div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-2">{tools.map(([label,fn])=><button type="button" key={label} onClick={fn} className="rounded-lg px-2 py-2 text-xs font-semibold hover:bg-teal-100 focus-visible:outline-2">{label}</button>)}</div><EditorContent editor={editor}/><div className="flex flex-wrap items-end gap-2 border-t border-slate-200 p-3"><label className="min-w-40 flex-1 text-xs font-medium">Enlace HTTPS<input className={inputClass} value={href} onChange={e=>setHref(e.target.value)} placeholder="https://…"/></label><button className={secondaryClass} type="button" onClick={()=>{try{const url=safeHttps(href);editor?.chain().focus().extendMarkRange('link').setLink({href:url}).run();setError('');}catch{setError('Ingresá un enlace HTTPS válido.');}}}>Aplicar enlace</button><button type="button" className={secondaryClass} onClick={()=>editor?.chain().focus().unsetLink().run()}>Quitar enlace</button>{error&&<p role="alert" className="w-full text-sm text-red-700">{error}</p>}</div></fieldset>;
}

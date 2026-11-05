import type { ReactNode } from 'react';
import { validateDocument, type ContentNode } from '@/lib/snipers/content-document';

export default function ContentBody({body}:{body:unknown}) {
  const doc=validateDocument(body);
  function render(n:ContentNode,key:number):ReactNode {
    if(n.type==='text') {
      let text:ReactNode=n.text;
      for(const mark of n.marks??[])text=mark.type==='bold'?<strong>{text}</strong>:mark.type==='italic'?<em>{text}</em>:<a href={mark.attrs!.href} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-teal-600 underline-offset-4">{text}</a>;
      return <span key={key}>{text}</span>;
    }
    const children=n.content?.map(render);
    switch(n.type){
      case 'heading':return n.attrs?.level===2?<h2 key={key} className="mt-8 text-2xl font-bold text-slate-900">{children}</h2>:<h3 key={key} className="mt-6 text-xl font-bold text-slate-900">{children}</h3>;
      case 'paragraph':return <p key={key} className="my-4 min-h-5 leading-8">{children}</p>;
      case 'bulletList':return <ul key={key} className="my-4 list-disc space-y-2 pl-6">{children}</ul>;
      case 'orderedList':return <ol key={key} className="my-4 list-decimal space-y-2 pl-6">{children}</ol>;
      case 'listItem':return <li key={key}>{children}</li>;
      case 'blockquote':return <blockquote key={key} className="my-6 border-l-4 border-teal-600 pl-5 text-slate-600">{children}</blockquote>;
      case 'horizontalRule':return <hr key={key} className="my-8 border-slate-200"/>;
      case 'hardBreak':return <br key={key}/>;
      default:return <div key={key}>{children}</div>;
    }
  }
  return <div className="break-words text-slate-700">{doc.content.map(render)}</div>;
}

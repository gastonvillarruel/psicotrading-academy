// Shared closed document format. No HTML renderer, database, or server secrets here.
import { reject } from './errors';

export type ContentMark = { type: 'bold' | 'italic' | 'link'; attrs?: { href: string } };
export type ContentNode = { type: string; text?: string; attrs?: { level: number }; marks?: ContentMark[]; content?: ContentNode[] };
export type ContentDocument = ContentNode & { type: 'doc'; content: ContentNode[] };
export const emptyDocument: ContentDocument = { type: 'doc', content: [{ type: 'paragraph' }] };

export function safeHttps(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || value !== value.trim() || /[\s\u0000-\u001f\u007f\\]/u.test(value)) reject('VALIDATION', 'Enlace inválido.');
  let url: URL;
  try { url = new URL(value); } catch { reject('VALIDATION', 'Enlace inválido.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) reject('VALIDATION', 'Enlace inválido.');
  return url.href;
}
export function zoomUrl(value: unknown): string {
  const href = safeHttps(value); const url = new URL(href);
  if (!['zoom.us', 'zoom.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) || url.hash) reject('VALIDATION', 'Enlace Zoom inválido.');
  return href;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) reject('VALIDATION', 'Documento inválido.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) reject('VALIDATION', 'Atributo de contenido no permitido.');
}
const blocks = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'horizontalRule'];
export function validateDocument(input: unknown): ContentDocument {
  let serialized: string;
  try { serialized = JSON.stringify(input); } catch { reject('VALIDATION', 'Documento inválido.'); }
  if (!serialized || new TextEncoder().encode(serialized).byteLength > 524288) reject('VALIDATION', 'Documento demasiado extenso.');
  let count = 0;
  function node(value: unknown, depth: number, allowed: string[]): ContentNode {
    if (++count > 10000 || depth > 20) reject('VALIDATION', 'Documento demasiado complejo.');
    const n = record(value); keys(n, ['type','text','attrs','marks','content']);
    if (typeof n.type !== 'string' || !allowed.includes(n.type)) reject('VALIDATION', 'Nodo de contenido no permitido.');
    const result: ContentNode = { type: n.type };
    if (n.type === 'text') {
      if (typeof n.text !== 'string' || !n.text.length || n.content !== undefined || n.attrs !== undefined) reject('VALIDATION', 'Texto inválido.');
      result.text = n.text;
      if (n.marks !== undefined) {
        if (!Array.isArray(n.marks) || n.marks.length > 3) reject('VALIDATION', 'Formato inválido.');
        const seen = new Set<unknown>();
        result.marks = n.marks.map(m => {
          const mark = record(m); keys(mark, ['type','attrs']);
          if (seen.has(mark.type)) reject('VALIDATION', 'Formato repetido.');
          seen.add(mark.type);
          if (mark.type === 'bold' || mark.type === 'italic') {
            if (mark.attrs !== undefined) reject('VALIDATION','Formato inválido.');
            return {type:mark.type};
          }
          if (mark.type !== 'link') reject('VALIDATION','Formato no permitido.');
          const attrs = record(mark.attrs); keys(attrs,['href','target','rel','class']);
          if ((attrs.target !== undefined && attrs.target !== null && attrs.target !== '_blank') || (attrs.rel !== undefined && attrs.rel !== null && attrs.rel !== 'noopener noreferrer nofollow') || (attrs.class !== undefined && attrs.class !== null)) reject('VALIDATION','Atributos de enlace no permitidos.');
          return {type:'link',attrs:{href:safeHttps(attrs.href)}};
        });
      }
      return result;
    }
    if (n.text !== undefined || n.marks !== undefined) reject('VALIDATION','Nodo inválido.');
    if (n.type === 'heading') {
      const attrs = record(n.attrs); keys(attrs,['level']);
      if (attrs.level !== 2 && attrs.level !== 3) reject('VALIDATION','Encabezado inválido.');
      result.attrs = {level:attrs.level};
    } else if (n.type === 'orderedList') {
      if (n.attrs !== undefined) { const attrs=record(n.attrs);keys(attrs,['start','type']);if ((attrs.start !== undefined && attrs.start !== 1) || (attrs.type !== undefined && attrs.type !== null)) reject('VALIDATION','Lista inválida.'); }
    } else if (n.attrs !== undefined) reject('VALIDATION','Atributos no permitidos.');
    if (n.type === 'horizontalRule' || n.type === 'hardBreak') {
      if (n.content !== undefined) reject('VALIDATION','Nodo inválido.');
    } else {
      const children = n.content ?? [];
      if (!Array.isArray(children)) reject('VALIDATION','Contenido inválido.');
      const next = n.type === 'doc' || n.type === 'blockquote' ? blocks : n.type === 'bulletList' || n.type === 'orderedList' ? ['listItem'] : n.type === 'listItem' ? blocks : ['text','hardBreak'];
      result.content = children.map(c=>node(c,depth+1,next));
      if (['doc','bulletList','orderedList','listItem','blockquote'].includes(n.type) && !result.content.length) reject('VALIDATION','Bloque vacío inválido.');
      if (n.type === 'listItem' && result.content[0]?.type !== 'paragraph') reject('VALIDATION','Elemento de lista inválido.');
    }
    return result;
  }
  return node(input,0,['doc']) as ContentDocument;
}

export function documentText(doc: ContentDocument): string {
  const walk = (n: ContentNode): string => n.text ?? (n.content ?? []).map(walk).join(' ');
  return walk(doc).trim();
}

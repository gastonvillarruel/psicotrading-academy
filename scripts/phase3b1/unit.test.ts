import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { validateDocument,zoomUrl,safeHttps } from '../../src/lib/snipers/content-document';
import ContentBody from '../../src/components/snipers/ContentBody';
const text=(value:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:value}]}]});
const invalid=(value:unknown)=>assert.throws(()=>validateDocument(value),e=>(e as {code:string}).code==='VALIDATION');
test('XSS: el lector escapa texto y no interpreta HTML',()=>{
  const html=renderToStaticMarkup(createElement(ContentBody,{body:text('<img src=x onerror=alert(1)><script>window.pwned=1</script>')}));
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));
});
test('documentos: rechaza nodos, marcas y atributos ejecutables',()=>{
  for(const type of ['script','iframe','image','codeBlock'])invalid({type:'doc',content:[{type}]});
  invalid({type:'doc',content:[{type:'paragraph',attrs:{onclick:'evil'}}]});
  invalid({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'a',marks:[{type:'link',attrs:{href:'javascript:evil()'}}]}]}]});
  invalid({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'a',marks:[{type:'bold',attrs:{style:'url(x)'}}]}]}]});
  invalid({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'a',marks:[{type:'link',attrs:{href:'https://one.invalid'}},{type:'link',attrs:{href:'https://two.invalid'}}]}]}]});
});
test('documentos: límites de bytes, nodos y profundidad',()=>{
  invalid(text('á'.repeat(270000)));invalid({type:'doc',content:Array.from({length:10001},()=>({type:'paragraph'}))});
  let body:unknown={type:'paragraph'};for(let i=0;i<22;i++)body={type:'blockquote',content:[body]};invalid({type:'doc',content:[body]});
  const cyclic:{type:string;content:unknown[]}={type:'doc',content:[]};cyclic.content.push(cyclic);invalid(cyclic);
});
test('enlaces: HTTPS y Zoom con hostname exacto; sin credenciales ni controles',()=>{
  assert.equal(zoomUrl('https://mentor.zoom.us/j/123?pwd=private'),'https://mentor.zoom.us/j/123?pwd=private');
  for(const href of ['http://zoom.us/j/123','https://zoom.us.evil.invalid/j/123','https://evilzoom.us/j/123','https://user:pass@zoom.us/j/1','https://zoom.us:444/j/1','https://zoom.us/j/1#x','https://zoom.us/j/1\n'])assert.throws(()=>zoomUrl(href));
  for(const href of ['javascript:alert(1)','data:text/html,test','//example.invalid','https://a.invalid/\\evil'])assert.throws(()=>safeHttps(href));
});
test('documentos: formatos admitidos y enlaces normalizados sin atributos libres',()=>{
  const body={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'Título'}]},{type:'orderedList',attrs:{start:1,type:null},content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'enlace',marks:[{type:'link',attrs:{href:'https://example.invalid',target:'_blank',rel:'noopener noreferrer nofollow',class:null}}]}]}]}]}]};
  const doc=validateDocument(body);const html=renderToStaticMarkup(createElement(ContentBody,{body:doc}));assert.ok(html.includes('<h2'));assert.ok(html.includes('<ol'));assert.ok(html.includes('noopener noreferrer nofollow'));
});

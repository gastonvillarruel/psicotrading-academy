import { snipers } from '@/lib/snipers/server';
import { SnipersError } from '@/lib/snipers/errors';
import { zoomUrl } from '@/lib/snipers/content-document';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
  try{const {id}=await params;const join=await snipers.getMeetingJoin(id);return new Response(null,{status:303,headers:{...headers,Location:zoomUrl(join.url)}});}
  catch(error){const code=error instanceof SnipersError?error.code:'UNAVAILABLE';return new Response('El encuentro no está disponible.',{status:code==='SESSION'?401:code==='FORBIDDEN'?403:['NOT_FOUND','VALIDATION','DISABLED'].includes(code)?404:503,headers});}
}

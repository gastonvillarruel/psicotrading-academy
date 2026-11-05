'use client';
import { useEffect,type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
export default function ContentSessionBoundary({identity,children}:{identity:string;children:ReactNode}){
  const {data,status}=useSession();const router=useRouter();
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')router.refresh();};document.addEventListener('visibilitychange',refresh);return()=>document.removeEventListener('visibilitychange',refresh);},[router]);
  if(status!=='loading'&&(status!=='authenticated'||data?.user?.id!==identity))return <p role="status">La sesión cambió. Volvé a ingresar desde Mi campus.</p>;
  return children;
}

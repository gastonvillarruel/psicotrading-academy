import {snipersStorage} from '@/lib/snipers/storage-management-server';
import {pageData} from '@/lib/snipers/page-data';
import StorageManagement from '@/components/snipers/StorageManagement';

export const maxDuration=60;
export default async function Files({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const q=await searchParams;
  const data=await pageData(()=>snipersStorage.list({offset:q.offset?Number(q.offset):0,archived:q.archived==='true'}));
  return <StorageManagement data={data}/>;
}

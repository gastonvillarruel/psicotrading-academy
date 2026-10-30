import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import EditorialManagement from '@/components/snipers/EditorialManagement';
export default async function Management({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const q=await searchParams;const tab=['clases','categorias','agenda','auditoria'].includes(q.tab??'')?q.tab!:'clases';const offset=q.offset?Number(q.offset):0;const status=q.status??'';
  const filter={offset,limit:25,...(status?{status}:{})};
  await pageData(()=>snipers.requireContentEditor());
  const [categories,classes,meetings,events]=await pageData(()=>Promise.all([snipers.listEditorialCategories(),tab==='clases'?snipers.listEditorialClasses(filter):null,tab==='agenda'?snipers.listEditorialMeetings(filter):null,tab==='auditoria'?snipers.getEditorialHistory({offset,limit:25}):null]));
  return <EditorialManagement key={`${tab}:${offset}:${status}`} tab={tab} categories={categories} classes={classes?.items??[]} meetings={meetings?.items??[]} events={events?.items??[]} offset={offset} status={status} hasMore={classes?.hasMore??meetings?.hasMore??events?.hasMore??false}/>;
}

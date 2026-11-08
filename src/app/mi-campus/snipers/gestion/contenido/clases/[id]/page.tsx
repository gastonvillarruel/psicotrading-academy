import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import ClassEditor from '@/components/snipers/ClassEditor';
import PrivateUploads from '@/components/snipers/PrivateUploads';
export const maxDuration = 60;
export default async function EditClass({params}:{params:Promise<{id:string}>}){const {id}=await params;const [item,categories,caps]=await pageData(()=>Promise.all([snipers.getEditorialClass(id),snipers.listEditorialCategories(),snipers.getCapabilities()]));return <div className="space-y-5"><ClassEditor key={id} initial={item} categories={categories} canDiscard={caps.admin}/><PrivateUploads key={`uploads-${id}`} classId={id} archived={item.status==='ARCHIVED'}/></div>;}

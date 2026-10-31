import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import ClassEditor from '@/components/snipers/ClassEditor';
import PrivateUploads from '@/components/snipers/PrivateUploads';
export default async function EditClass({params}:{params:Promise<{id:string}>}){const {id}=await params;const [item,categories]=await pageData(()=>Promise.all([snipers.getEditorialClass(id),snipers.listEditorialCategories()]));return <div className="space-y-5"><ClassEditor key={id} initial={item} categories={categories}/><PrivateUploads key={`uploads-${id}`} classId={id} archived={item.status==='ARCHIVED'}/></div>;}

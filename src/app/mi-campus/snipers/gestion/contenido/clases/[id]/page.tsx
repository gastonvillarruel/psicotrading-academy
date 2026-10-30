import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import ClassEditor from '@/components/snipers/ClassEditor';
export default async function EditClass({params}:{params:Promise<{id:string}>}){const {id}=await params;const [item,categories]=await pageData(()=>Promise.all([snipers.getEditorialClass(id),snipers.listEditorialCategories()]));return <ClassEditor key={id} initial={item} categories={categories}/>;}

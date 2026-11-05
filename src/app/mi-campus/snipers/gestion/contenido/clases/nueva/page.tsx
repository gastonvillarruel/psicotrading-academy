import { snipers } from '@/lib/snipers/server';
import { pageData } from '@/lib/snipers/page-data';
import ClassEditor from '@/components/snipers/ClassEditor';
export default async function NewClass(){const categories=await pageData(()=>snipers.listEditorialCategories());return <ClassEditor initial={null} categories={categories}/>;}

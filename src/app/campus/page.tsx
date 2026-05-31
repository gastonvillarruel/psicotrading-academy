import { redirect } from 'next/navigation';

interface PageProps {
  searchParams: Promise<{ q?: string; type?: string; priceSort?: string }>;
}

export default async function CampusPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const params = new URLSearchParams();
  if (resolvedParams.q) params.set('q', resolvedParams.q);
  if (resolvedParams.type) params.set('type', resolvedParams.type);
  if (resolvedParams.priceSort) params.set('priceSort', resolvedParams.priceSort);

  const queryStr = params.toString();
  redirect(queryStr ? `/?${queryStr}` : '/');
}

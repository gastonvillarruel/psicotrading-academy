import { redirect } from 'next/navigation';
import { requireValidSession } from '@/lib/auth-helpers';
import { getProfileData } from '@/app/actions/profile';
import ProfileForm from '@/components/ProfileForm';

export const metadata = {
  title: 'Mi Perfil — PSICOEMOTRADING',
  description: 'Editá tus datos personales y preferencias de cuenta.',
};

export default async function PerfilPage() {
  const session = await requireValidSession();

  const user = await getProfileData();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="min-h-[calc(100vh-140px)] bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-brand-text tracking-tight">Mi Perfil</h1>
          <p className="text-brand-text-muted text-sm mt-1">Actualizá tus datos personales.</p>
        </div>
        <ProfileForm user={user} />
      </div>
    </main>
  );
}

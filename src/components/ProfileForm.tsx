'use client';

import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { updateProfile } from '@/app/actions/profile';

type UserData = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  phone: string | null;
  country: string | null;
  timezone: string | null;
  bio: string | null;
  role: string;
  emailVerified: Date | null;
  createdAt: Date;
};

const TIMEZONES = [
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Caracas',
  'America/Mexico_City',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Madrid',
  'Europe/London',
  'UTC',
];

export default function ProfileForm({ user }: { user: UserData }) {
  const { update } = useSession();
  const [formData, setFormData] = useState({
    name: user.name || '',
    phone: user.phone || '',
    country: user.country || '',
    timezone: user.timezone || '',
    bio: user.bio || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (success) setSuccess(false);
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccess(false);
    setError(null);

    try {
      const res = await updateProfile(formData);
      if (res.success) {
        setSuccess(true);
        // Actualizar nombre en la sesión JWT para que se refleje en Navbar
        await update({ name: formData.name });
      } else {
        setError(res.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Avatar card */}
      <div className="bg-brand-card rounded-xl border border-brand-border/30 p-6 flex items-center gap-5">
        {user.image ? (
          <img
            src={user.image}
            alt={user.name || 'Avatar'}
            className="w-16 h-16 rounded-full object-cover ring-2 ring-brand-primary/20"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-brand-primary/10 flex items-center justify-center text-2xl font-extrabold text-brand-primary">
            {(user.name || user.email)[0].toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-bold text-brand-text text-lg">{user.name || 'Sin nombre'}</p>
          <p className="text-sm text-brand-text-muted">{user.email}</p>
          <span className="inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">
            {user.role === 'ADMIN' ? 'Administrador' : 'Estudiante'}
          </span>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-brand-card rounded-xl border border-brand-border/30 p-6">
        <h2 className="text-base font-bold text-brand-text mb-5">Información personal</h2>

        {success && (
          <div className="mb-5 p-4 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200 font-semibold">
            ✓ Cambios guardados correctamente.
          </div>
        )}
        {error && (
          <div className="mb-5 p-4 bg-brand-error/10 text-brand-error rounded-lg text-sm border border-brand-error/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email — readonly */}
          <div>
            <label className="block text-sm font-bold text-brand-text mb-1.5">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full px-4 py-3 border border-brand-border/40 bg-brand-bg-sec rounded-lg text-brand-text-muted text-sm cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-brand-text-muted">El email no se puede cambiar desde aquí.</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="profile-name">
              Nombre completo
            </label>
            <input
              id="profile-name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="Tu nombre completo"
              disabled={isLoading}
              className="w-full px-4 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="profile-phone">
                Teléfono <span className="text-brand-text-muted font-normal">(opcional)</span>
              </label>
              <input
                id="profile-phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+54 11 0000-0000"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="profile-country">
                País <span className="text-brand-text-muted font-normal">(opcional)</span>
              </label>
              <input
                id="profile-country"
                name="country"
                type="text"
                value={formData.country}
                onChange={handleChange}
                placeholder="Argentina"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="profile-timezone">
              Zona horaria <span className="text-brand-text-muted font-normal">(opcional)</span>
            </label>
            <select
              id="profile-timezone"
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              disabled={isLoading}
              className="w-full px-4 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
            >
              <option value="">— Seleccionar zona horaria —</option>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-brand-text mb-1.5" htmlFor="profile-bio">
              Bio <span className="text-brand-text-muted font-normal">(opcional, máx. 500 caracteres)</span>
            </label>
            <textarea
              id="profile-bio"
              name="bio"
              rows={3}
              value={formData.bio}
              onChange={handleChange}
              placeholder="Contanos algo sobre vos..."
              disabled={isLoading}
              maxLength={500}
              className="w-full px-4 py-3 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm resize-none"
            />
            <p className="mt-1 text-xs text-brand-text-muted text-right">
              {formData.bio.length}/500
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="py-3 px-8 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-lg shadow-sm hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Guardando...
                </>
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Account info */}
      <div className="bg-brand-card rounded-xl border border-brand-border/30 p-6">
        <h2 className="text-base font-bold text-brand-text mb-4">Información de cuenta</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-brand-text-muted">Estado del email</span>
            <span className={`font-semibold px-2.5 py-0.5 rounded-full text-xs ${user.emailVerified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {user.emailVerified ? '✓ Verificado' : '⚠ Sin verificar'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-brand-text-muted">Miembro desde</span>
            <span className="text-brand-text font-medium">
              {new Date(user.createdAt).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

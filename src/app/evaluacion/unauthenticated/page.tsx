'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FiCheckCircle, FiLock, FiUserPlus, FiLogIn } from 'react-icons/fi';

function UnauthenticatedContent() {
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId');

  const callbackUrl = attemptId
    ? `/evaluacion/resultado?attemptId=${attemptId}`
    : '/evaluacion';

  const loginUrl = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const registerUrl = `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <div className="w-full max-w-lg bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
        <FiLock className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          ¡Ya calculamos tu resultado!
        </h1>
        <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
          Registrate o iniciá sesión para desbloquear la vista completa:
        </p>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 text-left space-y-3">
        <div className="flex items-center gap-3 text-slate-200 text-sm font-medium">
          <FiCheckCircle className="text-emerald-400 w-5 h-5 flex-shrink-0" />
          <span>Tu puntaje exacto y porcentaje de aciertos</span>
        </div>
        <div className="flex items-center gap-3 text-slate-200 text-sm font-medium">
          <FiCheckCircle className="text-emerald-400 w-5 h-5 flex-shrink-0" />
          <span>Tu nivel alcanzado en Psicotrading</span>
        </div>
        <div className="flex items-center gap-3 text-slate-200 text-sm font-medium">
          <FiCheckCircle className="text-emerald-400 w-5 h-5 flex-shrink-0" />
          <span>Respuestas correctas y explicación detallada</span>
        </div>
        <div className="flex items-center gap-3 text-slate-200 text-sm font-medium">
          <FiCheckCircle className="text-emerald-400 w-5 h-5 flex-shrink-0" />
          <span>Acceso al historial de todas tus evaluaciones</span>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Link
          href={registerUrl}
          className="w-full py-3.5 px-6 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-base rounded-2xl shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all duration-300 flex items-center justify-center gap-2"
        >
          <FiUserPlus className="w-5 h-5" />
          <span>Crear Cuenta Gratis</span>
        </Link>

        <Link
          href={loginUrl}
          className="w-full py-3.5 px-6 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-base rounded-2xl transition-all duration-300 flex items-center justify-center gap-2"
        >
          <FiLogIn className="w-5 h-5" />
          <span>Ya tengo cuenta - Iniciar Sesión</span>
        </Link>
      </div>
    </div>
  );
}

export default function UnauthenticatedResultPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6 text-slate-100">
      <Suspense fallback={<div className="text-slate-400">Cargando...</div>}>
        <UnauthenticatedContent />
      </Suspense>
    </div>
  );
}

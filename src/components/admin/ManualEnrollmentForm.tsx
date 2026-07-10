'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LuUserPlus, LuLoader, LuCheck, LuCircleX, LuSearch } from 'react-icons/lu';
import {
  grantManualEnrollment,
  lookupUserByEmail,
  type UserLookupResult,
} from '@/app/actions/admin-manual-enrollment';

interface ScheduleOption {
  id: string;
  name: string;
  description: string | null;
}

interface Course {
  id: string;
  title: string;
  scheduleOptions: ScheduleOption[];
}

interface Props {
  courses: Course[];
}

type Step = 'form' | 'confirm';

export function ManualEnrollmentForm({ courses }: Props) {
  const router = useRouter();
  const [courseId, setCourseId] = useState('');
  const [email, setEmail] = useState('');
  const [scheduleOptionId, setScheduleOptionId] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [userInfo, setUserInfo] = useState<UserLookupResult | null>(null);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isPending, startTransition] = useTransition();

  const selectedCourse = courses.find((c) => c.id === courseId);
  const options = selectedCourse?.scheduleOptions ?? [];
  // Auto-seleccionar si hay exactamente 1 opcion
  const effectiveScheduleOptionId = options.length === 1 ? options[0].id : scheduleOptionId;
  const selectedOption = options.find((o) => o.id === effectiveScheduleOptionId);
  const needsScheduleSelect = options.length > 1;

  function reset() {
    setStep('form');
    setUserInfo(null);
    setResultMsg(null);
  }

  function handleCourseChange(newCourseId: string) {
    setCourseId(newCourseId);
    setScheduleOptionId('');
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !email.trim()) return;
    if (needsScheduleSelect && !scheduleOptionId) return;
    setResultMsg(null);

    startTransition(async () => {
      const result = await lookupUserByEmail({ email });
      setUserInfo(result);
      if (result.found) {
        setStep('confirm');
      } else {
        setResultMsg({ type: 'error', text: result.error });
      }
    });
  }

  function handleGrant() {
    startTransition(async () => {
      const result = await grantManualEnrollment({
        courseId,
        email,
        scheduleOptionId: effectiveScheduleOptionId || null,
      });
      if (result.success) {
        setResultMsg({ type: 'success', text: result.message });
        setStep('form');
        setCourseId('');
        setEmail('');
        setScheduleOptionId('');
        setUserInfo(null);
        router.refresh();
      } else {
        setResultMsg({ type: 'error', text: result.error });
        setStep('form');
        setUserInfo(null);
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center shrink-0">
          <LuUserPlus size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">Inscripcion Manual</h2>
          <p className="text-xs text-gray-400 mt-0.5">Otorga acceso gratuito a un curso sin pasar por el checkout.</p>
        </div>
      </div>

      {/* Mensaje resultado */}
      {resultMsg && (
        <div
          className={`flex items-start gap-2.5 rounded-xl px-4 py-3 mb-5 text-sm font-medium ${
            resultMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-red-50 text-red-700 border border-red-100'
          }`}
        >
          {resultMsg.type === 'success' ? (
          <LuCheck size={16} className="mt-0.5 shrink-0" />
          ) : (
          <LuCircleX size={16} className="mt-0.5 shrink-0" />
          )}
          <span>{resultMsg.text}</span>
        </div>
      )}

      {/* Paso 1: Formulario */}
      {step === 'form' && (
        <form onSubmit={handleLookup} className="space-y-4">
          {/* Selector de curso */}
          <div>
            <label htmlFor="manual-enroll-course" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Curso
            </label>
            <select
              id="manual-enroll-course"
              value={courseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition"
            >
              <option value="">Selecciona un curso...</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de comision (solo si hay mas de 1) */}
          {needsScheduleSelect && (
            <div>
              <label htmlFor="manual-enroll-schedule" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Comision
              </label>
              <select
                id="manual-enroll-schedule"
                value={scheduleOptionId}
                onChange={(e) => setScheduleOptionId(e.target.value)}
                required
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition"
              >
                <option value="">Selecciona una comision...</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}{o.description ? ` — ${o.description}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Campo email */}
          <div>
            <label htmlFor="manual-enroll-email" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Email del alumno
            </label>
            <input
              id="manual-enroll-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@email.com"
              required
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition"
            />
          </div>

          <button
            id="manual-enroll-lookup-btn"
            type="submit"
            disabled={isPending || !courseId || !email.trim() || (needsScheduleSelect && !scheduleOptionId)}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {isPending ? (
              <LuLoader size={15} className="animate-spin" />
            ) : (
              <LuSearch size={15} />
            )}
            {isPending ? 'Buscando...' : 'Verificar usuario'}
          </button>
        </form>
      )}

      {/* Paso 2: Confirmacion */}
      {step === 'confirm' && userInfo?.found && selectedCourse && (
        <div className="space-y-5">
          {/* Info del usuario */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Usuario encontrado</p>
            <p className="text-sm font-semibold text-gray-900">{userInfo.name || 'Sin nombre'}</p>
            <p className="text-sm text-gray-500">{userInfo.email}</p>
          </div>

          {/* Pregunta de confirmacion */}
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              <span className="font-medium">?Deseas otorgar acceso al curso:</span>
              <br />
              <span className="font-bold text-gray-900 block mt-1">"{selectedCourse.title}"</span>
              {selectedOption && (
                <span className="text-xs text-gray-500 block mt-0.5">Comision: <span className="font-semibold">{selectedOption.name}</span></span>
              )}
              <span className="block mt-1">al usuario <span className="font-semibold">{userInfo.email}</span>?</span>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              id="manual-enroll-cancel-btn"
              type="button"
              onClick={reset}
              disabled={isPending}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              id="manual-enroll-confirm-btn"
              type="button"
              onClick={handleGrant}
              disabled={isPending}
              className="flex items-center justify-center gap-2 flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {isPending ? (
                <LuLoader size={15} className="animate-spin" />
              ) : (
                <LuUserPlus size={15} />
              )}
              {isPending ? 'Otorgando...' : 'Otorgar acceso'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

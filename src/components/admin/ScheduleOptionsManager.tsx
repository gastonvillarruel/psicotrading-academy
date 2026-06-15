'use client';

import React, { useState, useTransition } from 'react';
import type { AdminScheduleOption } from '@/types/admin-course-content';
import {
  createScheduleOption,
  updateScheduleOption,
  toggleScheduleOptionActive,
  deleteScheduleOption,
  reorderScheduleOptions,
  type ScheduleOptionInput,
} from '@/app/actions/admin-schedule-options';

interface ScheduleOptionsManagerProps {
  courseId: string;
  initialOptions: AdminScheduleOption[];
}

interface OptionFormState {
  name: string;
  description: string;
  timezone: string;
  capacity: string;
  isActive: boolean;
}

const emptyForm: OptionFormState = {
  name: '',
  description: '',
  timezone: '',
  capacity: '',
  isActive: true,
};

export default function ScheduleOptionsManager({
  courseId,
  initialOptions,
}: ScheduleOptionsManagerProps) {
  const [options, setOptions] = useState<AdminScheduleOption[]>(initialOptions);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OptionFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const buildInput = (): ScheduleOptionInput => ({
    name: form.name,
    description: form.description || null,
    timezone: form.timezone || null,
    capacity: form.capacity ? Number(form.capacity) : null,
    isActive: form.isActive,
  });

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      const result = await createScheduleOption(courseId, buildInput());
      if (!result.success || !result.option) {
        setError(result.error || 'Error al crear la comisión.');
        return;
      }
      setOptions((prev) => [...prev, result.option!]);
      setForm(emptyForm);
      setShowForm(false);
    });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    setError(null);
    startTransition(async () => {
      const result = await updateScheduleOption(editingId, buildInput());
      if (!result.success || !result.option) {
        setError(result.error || 'Error al actualizar la comisión.');
        return;
      }
      setOptions((prev) => prev.map((o) => (o.id === editingId ? result.option! : o)));
      setEditingId(null);
      setForm(emptyForm);
      setShowForm(false);
    });
  };

  const handleToggle = (optionId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await toggleScheduleOptionActive(optionId);
      if (!result.success || !result.option) {
        setError(result.error || 'Error al cambiar el estado.');
        return;
      }
      setOptions((prev) => prev.map((o) => (o.id === optionId ? result.option! : o)));
    });
  };

  const handleDelete = (optionId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteScheduleOption(optionId);
      if (!result.success) {
        setError(result.error || 'Error al eliminar la comisión.');
        return;
      }
      setOptions((prev) => prev.filter((o) => o.id !== optionId));
    });
  };

  const startEdit = (option: AdminScheduleOption) => {
    setEditingId(option.id);
    setForm({
      name: option.name,
      description: option.description ?? '',
      timezone: option.timezone ?? '',
      capacity: option.capacity ? String(option.capacity) : '',
      isActive: option.isActive,
    });
    setShowForm(true);
    setError(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOptions = [...options];
    [newOptions[index - 1], newOptions[index]] = [newOptions[index], newOptions[index - 1]];
    setOptions(newOptions);
    startTransition(async () => {
      await reorderScheduleOptions(courseId, newOptions.map((o) => o.id));
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === options.length - 1) return;
    const newOptions = [...options];
    [newOptions[index], newOptions[index + 1]] = [newOptions[index + 1], newOptions[index]];
    setOptions(newOptions);
    startTransition(async () => {
      await reorderScheduleOptions(courseId, newOptions.map((o) => o.id));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Comisiones / Horarios</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {options.length === 0
              ? 'Sin comisiones. El curso funciona en modo legacy (un solo horario).'
              : `${options.length} comisión${options.length !== 1 ? 'es' : ''} configurada${options.length !== 1 ? 's' : ''}.`}
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
            disabled={isPending}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            + Nueva comisión
          </button>
        )}
      </div>

      {/* Lista de comisiones */}
      {options.length > 0 && (
        <div className="space-y-2">
          {options.map((opt, index) => (
            <div
              key={opt.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                opt.isActive
                  ? 'border-teal-100 bg-teal-50/50'
                  : 'border-gray-100 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Reordenar */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={isPending || index === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                    title="Subir"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={isPending || index === options.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                    title="Bajar"
                  >
                    ▼
                  </button>
                </div>

                <div className="min-w-0">
                  <span className="font-semibold text-gray-900 block truncate">{opt.name}</span>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-0.5 flex-wrap">
                    {opt.description && <span className="truncate max-w-[180px]">{opt.description}</span>}
                    {opt.capacity && <span>Cupo: {opt.capacity}</span>}
                    <span>{opt._count.enrollments} inscripto{opt._count.enrollments !== 1 ? 's' : ''}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        opt.isActive
                          ? 'bg-teal-100 text-teal-700'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {opt.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(opt)}
                  disabled={isPending}
                  className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(opt.id)}
                  disabled={isPending}
                  className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {opt.isActive ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`¿Eliminar la comisión "${opt.name}"? Esta acción no se puede deshacer.`)) {
                      handleDelete(opt.id);
                    }
                  }}
                  disabled={isPending || opt._count.enrollments > 0}
                  title={opt._count.enrollments > 0 ? 'No se puede eliminar: tiene alumnos inscriptos' : 'Eliminar comisión'}
                  className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-red-100 bg-white text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulario crear/editar */}
      {showForm && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-4 space-y-3">
          <h4 className="text-sm font-bold text-gray-800">
            {editingId ? 'Editar comisión' : 'Nueva comisión'}
          </h4>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleFormChange}
                placeholder='Ej: "Comisión mañana", "Comisión noche"'
                disabled={isPending}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Descripción (opcional)
              </label>
              <input
                name="description"
                value={form.description}
                onChange={handleFormChange}
                placeholder='Ej: "Martes y jueves de 10:00 a 12:00 hs"'
                disabled={isPending}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Cupo (opcional, informativo)
              </label>
              <input
                name="capacity"
                type="number"
                min="1"
                value={form.capacity}
                onChange={handleFormChange}
                placeholder="Sin límite"
                disabled={isPending}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Zona horaria (opcional)
              </label>
              <input
                name="timezone"
                value={form.timezone}
                onChange={handleFormChange}
                placeholder="America/Argentina/Buenos_Aires"
                disabled={isPending}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="schedule-option-active"
                name="isActive"
                type="checkbox"
                checked={form.isActive}
                onChange={handleFormChange}
                disabled={isPending}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="schedule-option-active" className="text-sm font-medium text-gray-700">
                Activa (visible para los alumnos)
              </label>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={isPending || !form.name.trim()}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear comisión'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="text-xs font-semibold px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {options.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 italic">
          Sin comisiones: las lecciones usarán el horario legacy (campo único por lección).
        </p>
      )}
    </div>
  );
}

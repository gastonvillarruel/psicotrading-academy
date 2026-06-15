'use client';

import React, { useState } from 'react';
import { updateCourseCampusCustomConfig } from '@/app/actions/admin-course-content';
import type { AdminCourseCampusContent } from '@/types/admin-course-content';
import { CampusSettings, CampusChecklistItem, CampusMaterialItem } from '@/lib/campus/types';

interface CourseCampusVisualConfigProps {
  content: AdminCourseCampusContent;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export default function CourseCampusVisualConfig({
  content,
  onSuccess,
  onError,
}: CourseCampusVisualConfigProps) {
  const [isSaving, setIsSaving] = useState(false);

  // --- 1. Textos del Campus ---
  const [settings, setSettings] = useState<CampusSettings>(() => ({
    title: content.campusSettings?.title || '',
    subtitle: content.campusSettings?.subtitle || '',
    welcomeText: content.campusSettings?.welcomeText || '',
    currentLessonLabel: content.campusSettings?.currentLessonLabel || '',
    modulesLabel: content.campusSettings?.modulesLabel || '',
    motivationalQuote: content.campusSettings?.motivationalQuote || '',
  }));

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  // --- 2. Checklist ---
  const [checklist, setChecklist] = useState<CampusChecklistItem[]>(
    () => content.campusChecklist || []
  );

  const addChecklistItem = () => {
    const newItem: CampusChecklistItem = {
      id: Math.random().toString(36).substring(2, 9),
      text: '',
      order: checklist.length + 1,
      enabled: true,
    };
    setChecklist((prev) => [...prev, newItem]);
  };

  const updateChecklistItem = (id: string, text: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text } : item))
    );
  };

  const toggleChecklistItem = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
    );
  };

  const deleteChecklistItem = (id: string) => {
    setChecklist((prev) => prev.filter((item) => item.id !== id));
  };

  const moveChecklistItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= checklist.length) return;

    const newList = [...checklist];
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;

    // Actualizar órdenes secuenciales
    const reorderedList = newList.map((item, idx) => ({ ...item, order: idx + 1 }));
    setChecklist(reorderedList);
  };

  // --- 3. Materiales Descargables ---
  const [materials, setMaterials] = useState<CampusMaterialItem[]>(
    () => content.campusMaterials || []
  );

  const addMaterialItem = () => {
    const newItem: CampusMaterialItem = {
      id: Math.random().toString(36).substring(2, 9),
      title: '',
      type: 'PDF',
      url: '',
      description: '',
      lessonId: null,
      order: materials.length + 1,
      enabled: true,
    };
    setMaterials((prev) => [...prev, newItem]);
  };

  const updateMaterialField = (id: string, field: keyof CampusMaterialItem, value: any) => {
    setMaterials((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const deleteMaterialItem = (id: string) => {
    setMaterials((prev) => prev.filter((item) => item.id !== id));
  };

  const moveMaterialItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= materials.length) return;

    const newList = [...materials];
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;

    const reorderedList = newList.map((item, idx) => ({ ...item, order: idx + 1 }));
    setMaterials(reorderedList);
  };

  // Obtener todas las lecciones del curso
  const allLessons = content.modules.flatMap((mod) =>
    mod.lessons.map((les) => ({
      id: les.id,
      title: les.title,
      moduleTitle: mod.title,
    }))
  );

  // --- Guardado Global ---
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Filtrar y validar checklist antes de guardar (evitar textos vacíos)
      const cleanChecklist = checklist.filter((item) => item.text.trim() !== '');
      const cleanMaterials = materials.filter((mat) => mat.title.trim() !== '' && mat.url.trim() !== '');

      const result = await updateCourseCampusCustomConfig(content.courseId, {
        campusSettings: settings,
        campusChecklist: cleanChecklist,
        campusMaterials: cleanMaterials,
      });

      if (result.success) {
        onSuccess('Configuración visual del campus guardada exitosamente.');
      } else {
        onError(result.error || 'Error al guardar la configuración.');
      }
    } catch (err: any) {
      console.error(err);
      onError(err.message || 'Ocurrió un error inesperado al intentar guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Botón de Guardado Superior */}
      <div className="flex items-center justify-between bg-white border border-gray-150 p-4 rounded-xl shadow-sm">
        <div>
          <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider">
            Personalización del Campus Virtual
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Configurá el diseño, checklist y recursos del alumno.
          </p>
        </div>
        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-sm hover:shadow transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
        >
          {isSaving ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      </div>

      {/* Bloque 1: Configuración General / Textos */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4 text-left">
        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest border-b border-gray-50 pb-2">
          1. Textos y Personalización General
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase" htmlFor="customTitle">
              Título del Campus
            </label>
            <input
              id="customTitle"
              name="title"
              type="text"
              value={settings.title || ''}
              onChange={handleSettingsChange}
              placeholder="Ej: Campus de Trading Inteligente"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none text-gray-900 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase" htmlFor="customSubtitle">
              Subtítulo del Campus
            </label>
            <input
              id="customSubtitle"
              name="subtitle"
              type="text"
              value={settings.subtitle || ''}
              onChange={handleSettingsChange}
              placeholder="Ej: Domina tus emociones en el mercado"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none text-gray-900 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase" htmlFor="customWelcome">
              Mensaje de Bienvenida
            </label>
            <input
              id="customWelcome"
              name="welcomeText"
              type="text"
              value={settings.welcomeText || ''}
              onChange={handleSettingsChange}
              placeholder="Ej: Bienvenido, futuro Trader Profesional"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none text-gray-900 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase" htmlFor="customMotivational">
              Frase Motivacional
            </label>
            <input
              id="customMotivational"
              name="motivationalQuote"
              type="text"
              value={settings.motivationalQuote || ''}
              onChange={handleSettingsChange}
              placeholder="Ej: El trading exitoso requiere disciplina constante."
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none text-gray-900 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase" htmlFor="customLessonLabel">
              Etiqueta de "Clase en curso"
            </label>
            <input
              id="customLessonLabel"
              name="currentLessonLabel"
              type="text"
              value={settings.currentLessonLabel || ''}
              onChange={handleSettingsChange}
              placeholder="Ej: Sesión actual, Clase del día"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none text-gray-900 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase" htmlFor="customModulesLabel">
              Etiqueta de "Módulos del curso"
            </label>
            <input
              id="customModulesLabel"
              name="modulesLabel"
              type="text"
              value={settings.modulesLabel || ''}
              onChange={handleSettingsChange}
              placeholder="Ej: Temario del Programa, Unidades de estudio"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all outline-none text-gray-900 text-xs font-semibold"
            />
          </div>
        </div>
      </section>

      {/* Bloque 2: Checklist */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4 text-left">
        <div className="flex items-center justify-between border-b border-gray-50 pb-2">
          <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">
            2. Checklist del Trader (Mental / Operativa)
          </h4>
          <button
            type="button"
            onClick={addChecklistItem}
            className="flex items-center gap-1 text-[10px] font-extrabold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100/70 px-2.5 py-1.5 rounded-lg transition-all"
          >
            + Agregar ítem
          </button>
        </div>

        {checklist.length > 0 ? (
          <div className="space-y-3">
            {checklist.map((item, idx) => (
              <div
                key={item.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl border transition-all ${
                  item.enabled ? 'border-gray-200 bg-gray-50/20' : 'border-gray-100 bg-gray-50/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 flex-grow">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={() => toggleChecklistItem(item.id)}
                    className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                    title={item.enabled ? 'Desactivar ítem' : 'Activar ítem'}
                  />
                  <input
                    type="text"
                    value={item.text}
                    onChange={(e) => updateChecklistItem(item.id, e.target.value)}
                    placeholder="Ej: Tengo definido el stop loss antes de abrir la orden"
                    className="w-full px-3 py-1.5 border border-gray-150 rounded-lg outline-none focus:border-orange-500 text-xs font-semibold bg-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-1.5 self-end sm:self-auto">
                  {/* Reordenar */}
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveChecklistItem(idx, 'up')}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30 cursor-pointer"
                    title="Mover arriba"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === checklist.length - 1}
                    onClick={() => moveChecklistItem(idx, 'down')}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30 cursor-pointer"
                    title="Mover abajo"
                  >
                    ▼
                  </button>
                  {/* Eliminar */}
                  <button
                    type="button"
                    onClick={() => deleteChecklistItem(item.id)}
                    className="p-1.5 hover:bg-red-50 text-red-500 rounded transition-colors cursor-pointer"
                    title="Eliminar ítem"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl bg-gray-50/10">
            <p className="text-xs text-gray-400 font-bold italic">
              Todavía no agregaste ítems al checklist. Hacé clic arriba para crear el primero.
            </p>
          </div>
        )}
      </section>

      {/* Bloque 3: Materiales Descargables */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4 text-left">
        <div className="flex items-center justify-between border-b border-gray-50 pb-2">
          <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">
            3. Materiales Descargables y Enlaces del Curso
          </h4>
          <button
            type="button"
            onClick={addMaterialItem}
            className="flex items-center gap-1 text-[10px] font-extrabold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100/70 px-2.5 py-1.5 rounded-lg transition-all"
          >
            + Agregar material
          </button>
        </div>

        {materials.length > 0 ? (
          <div className="space-y-4">
            {materials.map((mat, idx) => (
              <div
                key={mat.id}
                className={`p-4 rounded-xl border transition-all space-y-3 ${
                  mat.enabled ? 'border-gray-200 bg-gray-50/20' : 'border-gray-100 bg-gray-50/50 opacity-60'
                }`}
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Título del Material</label>
                    <input
                      type="text"
                      value={mat.title}
                      onChange={(e) => updateMaterialField(mat.id, 'title', e.target.value)}
                      placeholder="Ej: Planilla Bitácora en Excel"
                      className="w-full px-3 py-1.5 border border-gray-150 rounded-lg outline-none focus:border-orange-500 text-xs font-semibold bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tipo</label>
                    <select
                      value={mat.type}
                      onChange={(e) => updateMaterialField(mat.id, 'type', e.target.value as any)}
                      className="w-full px-3 py-1.5 border border-gray-150 rounded-lg outline-none focus:border-orange-500 text-xs font-semibold bg-white"
                    >
                      <option value="PDF">PDF</option>
                      <option value="Excel">Excel</option>
                      <option value="Notion">Notion</option>
                      <option value="Link">Link / Web</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">URL de Descarga / Apertura</label>
                    <input
                      type="text"
                      value={mat.url}
                      onChange={(e) => updateMaterialField(mat.id, 'url', e.target.value)}
                      placeholder="Ej: https://docs.google.com/spreadsheets/..."
                      className="w-full px-3 py-1.5 border border-gray-150 rounded-lg outline-none focus:border-orange-500 text-xs font-semibold bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Asociar a Lección</label>
                    <select
                      value={mat.lessonId || ''}
                      onChange={(e) => updateMaterialField(mat.id, 'lessonId', e.target.value === '' ? null : e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-150 rounded-lg outline-none focus:border-orange-500 text-xs font-semibold bg-white truncate"
                    >
                      <option value="">Todo el Curso (General)</option>
                      {allLessons.map((les) => (
                        <option key={les.id} value={les.id}>
                          {les.moduleTitle} - {les.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Descripción Opcional</label>
                    <input
                      type="text"
                      value={mat.description || ''}
                      onChange={(e) => updateMaterialField(mat.id, 'description', e.target.value)}
                      placeholder="Ej: Descarga esta planilla para registrar tu bitácora diaria"
                      className="w-full px-3 py-1.5 border border-gray-150 rounded-lg outline-none focus:border-orange-500 text-xs font-semibold bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={mat.enabled}
                      onChange={() => updateMaterialField(mat.id, 'enabled', !mat.enabled)}
                      className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                      id={`mat-enabled-${mat.id}`}
                    />
                    <label htmlFor={`mat-enabled-${mat.id}`} className="text-xs text-gray-500 font-bold cursor-pointer select-none">
                      Material disponible / activo
                    </label>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveMaterialItem(idx, 'up')}
                      className="p-1.5 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30 cursor-pointer text-xs"
                      title="Mover arriba"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === materials.length - 1}
                      onClick={() => moveMaterialItem(idx, 'down')}
                      className="p-1.5 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30 cursor-pointer text-xs"
                      title="Mover abajo"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMaterialItem(mat.id)}
                      className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl bg-gray-50/10">
            <p className="text-xs text-gray-400 font-bold italic">
              Todavía no agregaste materiales descargables. Hacé clic arriba para crear el primero.
            </p>
          </div>
        )}
      </section>

      {/* Botón de Guardado Inferior */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
        >
          {isSaving ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateCourse } from '@/app/actions/courses';
import { z } from 'zod';
import { CourseDescriptionSection, createDefaultSections } from '@/types/course';
import * as FaIcons from 'react-icons/fa';
import ImageUploader from '@/components/ImageUploader';

const courseSchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres.'),
  slug: z.string().min(3, 'El slug debe tener al menos 3 caracteres.').regex(/^[a-z0-9-]+$/, 'El slug solo debe contener letras minúsculas, números y guiones.'),
  shortDescription: z.string().min(10, 'La descripción corta debe tener al menos 10 caracteres.'),
  longDescription: z.string().min(20, 'La descripción larga debe tener al menos 20 caracteres.'),
  price: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'El precio debe ser un número positivo.'),
  type: z.enum(['LIVE', 'RECORDED']),
  videoUrl: z.string().url('Ingresá una URL válida.').nullable().optional().or(z.literal('')),
  scheduledAt: z.string().nullable().optional().or(z.literal('')),
  thumbnail: z.string().url('Ingresá una URL de imagen válida.').nullable().optional().or(z.literal('')),
});

interface EditCourseFormProps {
  course: {
    id: string;
    title: string;
    slug: string;
    shortDescription: string;
    longDescription: string;
    price: number;
    type: 'LIVE' | 'RECORDED';
    videoUrl: string | null;
    scheduledAt: Date | null;
    thumbnail: string | null;
    instructorName?: string | null;
    instructorRole?: string | null;
    instructorBio?: string | null;
    descriptionSections?: any;
  };
}

const SECTION_LABELS: Record<string, string> = {
  heroEnhancements: 'Hero (Detalles Extra)',
  problems: 'Bloque de Problema / Dolor',
  achievements: '¿Qué lograrás?',
  proposal: 'Desarrollo de la Propuesta',
  additionalBenefits: 'Beneficios Adicionales',
  campusVirtual: 'Campus Virtual',
  instructorSection: 'Instructor / Formadores',
  requirements: 'Requisitos de Inscripción',
  featuresGrid: '¿Qué estás comprando?',
  enrollmentEnhancements: 'Planes / Fechas / Inscripción',
  testimonials: 'Testimonios',
  faq: 'Preguntas Frecuentes (FAQ)',
  curriculum: 'Plan de Estudios (Curriculum)',
};

export default function EditCourseForm({ course }: EditCourseFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'basic' | 'landing'>('basic');

  // Convertir fecha a formato datetime-local
  const formatDateTime = (date: Date | null) => {
    if (!date) return '';
    const d = new Date(date);
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Estado del formulario principal
  const [formData, setFormData] = useState({
    title: course.title,
    slug: course.slug,
    shortDescription: course.shortDescription,
    longDescription: course.longDescription,
    price: String(course.price),
    type: course.type,
    videoUrl: course.videoUrl || '',
    scheduledAt: formatDateTime(course.scheduledAt),
    thumbnail: course.thumbnail || '',
  });

  // Estado de las secciones de la landing
  const [sections, setSections] = useState<CourseDescriptionSection[]>(() => {
    try {
      if (course.descriptionSections) {
        return typeof course.descriptionSections === 'string'
          ? JSON.parse(course.descriptionSections)
          : (course.descriptionSections as CourseDescriptionSection[]);
      }
    } catch (e) {
      console.error('Error parseando secciones iniciales:', e);
    }
    return [];
  });

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    sections.length > 0 ? sections[0].id : null
  );

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  // --- Manejo del orden y estado de Secciones ---
  const handleInitializeTemplate = () => {
    const defaultSections = createDefaultSections();
    setSections(defaultSections);
    setSelectedSectionId(defaultSections[0].id);
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;

    const list = [...sections];
    const temp = list[index];
    list[index] = list[newIndex];
    list[newIndex] = temp;
    setSections(list);
  };

  const toggleSectionEnabled = (id: string) => {
    setSections(
      sections.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const deleteSection = (id: string) => {
    const filtered = sections.filter((s) => s.id !== id);
    setSections(filtered);
    if (selectedSectionId === id) {
      setSelectedSectionId(filtered.length > 0 ? filtered[0].id : null);
    }
  };

  const addSection = (type: string) => {
    const uniqId = () => Math.random().toString(36).substring(2, 9);
    let defaultData: any = {};

    switch (type) {
      case 'heroEnhancements':
        defaultData = { promotionalBadges: [], whatsappCtaText: '', quickHighlightsOverride: [] };
        break;
      case 'problems':
        defaultData = { title: '¿Te pasa alguna de estas situaciones?', items: [''], transformationMessage: '' };
        break;
      case 'achievements':
        defaultData = { title: '¿Qué lograrás?', benefits: [''] };
        break;
      case 'proposal':
        defaultData = { title: 'Desarrollo de la propuesta', subtitle: '', content: '' };
        break;
      case 'additionalBenefits':
        defaultData = { title: 'Beneficios adicionales', benefits: [{ icon: 'FaAward', title: '', description: '' }] };
        break;
      case 'campusVirtual':
        defaultData = { title: 'Campus Virtual', description: '', image: '', gallery: [], videoUrl: '' };
        break;
      case 'instructorSection':
        defaultData = { title: 'Tu Instructor', instructors: [{ name: '', role: '', bio: '', avatarUrl: '' }] };
        break;
      case 'requirements':
        defaultData = { title: 'Requisitos de inscripción', requiredItems: [''] };
        break;
      case 'featuresGrid':
        defaultData = { title: '¿Qué estás comprando?', items: [{ icon: 'FaCheckCircle', title: '', description: '' }] };
        break;
      case 'enrollmentEnhancements':
        defaultData = { title: 'Inscripción y Fechas', subtitle: '', urgencyText: '', extraNote: '', whatsappHelpText: '' };
        break;
      case 'testimonials':
        defaultData = { title: 'Lo que dicen nuestros alumnos', items: [{ name: '', text: '', roleOrCompany: '', rating: 5 }] };
        break;
      case 'faq':
        defaultData = { title: 'Preguntas Frecuentes', items: [{ question: '', answer: '' }] };
        break;
      case 'curriculum':
        defaultData = { title: 'Plan de estudios', description: '', modules: [{ title: 'Módulo 1', description: '', lessons: [] }] };
        break;
    }

    const newSec: CourseDescriptionSection = {
      id: uniqId(),
      type: type as any,
      enabled: true,
      data: defaultData,
    };

    setSections([...sections, newSec]);
    setSelectedSectionId(newSec.id);
  };

  const updateSectionData = (id: string, newData: any) => {
    setSections(
      sections.map((s) => (s.id === id ? { ...s, data: newData } : s))
    );
  };

  // --- Envío del Formulario ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Validar datos básicos
      const validated = courseSchema.parse(formData);

      // Limpiar y validar datos de secciones para evitar guardar ítems vacíos
      const cleanedSections = sections.map((sec) => {
        const cleanedSec = { ...sec };
        // Filtrado básico de ítems vacíos
        if (cleanedSec.type === 'problems' && cleanedSec.data.items) {
          cleanedSec.data.items = cleanedSec.data.items.filter(Boolean);
        }
        if (cleanedSec.type === 'achievements' && cleanedSec.data.benefits) {
          cleanedSec.data.benefits = cleanedSec.data.benefits.filter(Boolean);
        }
        if (cleanedSec.type === 'requirements') {
          if (cleanedSec.data.requiredItems) cleanedSec.data.requiredItems = cleanedSec.data.requiredItems.filter(Boolean);
          if (cleanedSec.data.optionalItems) cleanedSec.data.optionalItems = cleanedSec.data.optionalItems.filter(Boolean);
        }
        return cleanedSec;
      });

      // Llamar a Server Action con todas las secciones de la landing page
      const result = await updateCourse(course.id, {
        title: validated.title,
        slug: validated.slug,
        shortDescription: validated.shortDescription,
        longDescription: validated.longDescription,
        price: Number(validated.price),
        type: validated.type,
        videoUrl: validated.videoUrl || null,
        scheduledAt: validated.scheduledAt || null,
        thumbnail: validated.thumbnail || null,
        descriptionSections: cleanedSections, // Pasamos el array limpio
      });

      if (!result.success) {
        setError(result.error || 'Error al actualizar el curso.');
        setIsLoading(false);
      } else {
        router.push('/admin/courses');
        router.refresh();
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
      } else {
        setError('Ocurrió un error inesperado al intentar guardar.');
      }
      setIsLoading(false);
    }
  };

  const selectedSection = sections.find((s) => s.id === selectedSectionId);

  return (
    <div className="space-y-6">
      {/* Selector de pestañas */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('basic')}
          className={`py-3 px-6 font-semibold text-sm border-b-2 transition-all ${
            activeTab === 'basic'
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Información Básica
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('landing')}
          className={`py-3 px-6 font-semibold text-sm border-b-2 transition-all ${
            activeTab === 'landing'
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Secciones de la Landing Page ({sections.filter(s => s.enabled).length} activas)
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-6">
        {error && (
          <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 mb-6">
            {error}
          </div>
        )}

        {/* CONTENIDO PESTAÑA: INFORMACIÓN BÁSICA */}
        {activeTab === 'basic' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="title">
                Título del Curso
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                value={formData.title}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="slug">
                Slug (URL amigable)
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                required
                value={formData.slug}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="price">
                Precio (ARS)
              </label>
              <input
                id="price"
                name="price"
                type="number"
                required
                min="0"
                value={formData.price}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="type">
                Modalidad
              </label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm bg-white"
              >
                <option value="RECORDED">Grabado</option>
                <option value="LIVE">En Vivo</option>
              </select>
            </div>

            {formData.type === 'LIVE' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="scheduledAt">
                  Fecha y Hora de Inicio
                </label>
                <input
                  id="scheduledAt"
                  name="scheduledAt"
                  type="datetime-local"
                  required
                  value={formData.scheduledAt}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="videoUrl">
                URL de Video Embebido (Iframe src - Opcional)
              </label>
              <input
                id="videoUrl"
                name="videoUrl"
                type="url"
                value={formData.videoUrl}
                onChange={handleChange}
                placeholder="https://www.youtube.com/embed/..."
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <ImageUploader
                label="Miniatura del Curso (Opcional)"
                value={formData.thumbnail}
                onChange={(url) => setFormData((prev) => ({ ...prev, thumbnail: url }))}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="shortDescription">
                Descripción Corta
              </label>
              <input
                id="shortDescription"
                name="shortDescription"
                type="text"
                required
                value={formData.shortDescription}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="longDescription">
                Descripción Completa (Fallback)
              </label>
              <textarea
                id="longDescription"
                name="longDescription"
                required
                rows={6}
                value={formData.longDescription}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm resize-none"
              />
            </div>
          </div>
        )}

        {/* CONTENIDO PESTAÑA: SECCIONES DE LA LANDING */}
        {activeTab === 'landing' && (
          <div className="space-y-6">
            {sections.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl space-y-4">
                <p className="text-sm text-gray-500">Este curso no tiene secciones configuradas para su landing page.</p>
                <button
                  type="button"
                  onClick={handleInitializeTemplate}
                  className="px-5 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md"
                >
                  Inicializar Plantilla por Defecto (Orden Oficial)
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Panel Izquierdo: Lista de Secciones */}
                <div className="lg:col-span-4 border border-gray-100 rounded-2xl p-4 bg-gray-50/50 space-y-4">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Secciones del Curso</span>
                  
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {sections.map((sec, idx) => (
                      <div
                        key={sec.id}
                        onClick={() => setSelectedSectionId(sec.id)}
                        className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                          selectedSectionId === sec.id
                            ? 'bg-teal-50 border-teal-200 text-teal-900 shadow-sm'
                            : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <input
                            type="checkbox"
                            checked={sec.enabled}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSectionEnabled(sec.id);
                            }}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
                          />
                          <span className={`text-xs font-bold truncate ${!sec.enabled && 'line-through text-gray-400'}`}>
                            {SECTION_LABELS[sec.type] || sec.type}
                          </span>
                        </div>

                        {/* Controles de orden */}
                        <div className="flex items-center space-x-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveSection(idx, 'up')}
                            className="p-1 hover:bg-gray-100 text-gray-500 rounded disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={idx === sections.length - 1}
                            onClick={() => moveSection(idx, 'down')}
                            className="p-1 hover:bg-gray-100 text-gray-500 rounded disabled:opacity-30"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSection(sec.id)}
                            className="p-1 hover:bg-red-50 text-red-500 rounded ml-1"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Catálogo para agregar nuevas */}
                  <div className="pt-4 border-t border-gray-200">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Agregar Sección</label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          addSection(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white text-gray-800"
                    >
                      <option value="">-- Seleccionar Sección --</option>
                      {Object.entries(SECTION_LABELS).map(([type, label]) => (
                        <option key={type} value={type}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Panel Derecho: Formulario Específico de Sección */}
                <div className="lg:col-span-8 bg-white border border-gray-100 rounded-2xl p-6 shadow-inner">
                  {selectedSection ? (
                    <div className="space-y-6">
                      <div className="border-b border-gray-100 pb-4 flex justify-between items-center">
                        <div>
                          <h3 className="font-extrabold text-gray-800 text-base">
                            Editando {SECTION_LABELS[selectedSection.type] || selectedSection.type}
                          </h3>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {selectedSection.id}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500 font-medium">Habilitada:</span>
                          <input
                            type="checkbox"
                            checked={selectedSection.enabled}
                            onChange={() => toggleSectionEnabled(selectedSection.id)}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
                          />
                        </div>
                      </div>

                      {/* Render de Formulario dinámico por tipo de sección */}
                      <SectionEditorForm
                        section={selectedSection}
                        onChange={(newData) => updateSectionData(selectedSection.id, newData)}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-20 text-gray-400 text-sm">
                      Seleccioná una sección del panel izquierdo para editar su contenido.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Botones de acción del formulario global */}
        <div className="pt-6 border-t border-gray-100 flex items-center justify-end space-x-4">
          <Link
            href="/admin/courses"
            className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-teal-600/10 active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
          >
            {isLoading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ============================================================================
   SUBCOMPONENT: FORMULARIOS ESPECÍFICOS PARA EL CONTENIDO DE CADA SECCIÓN
   ============================================================================ */

const IconHelpGuide = () => (
  <div className="p-4 bg-teal-50 border border-teal-100 rounded-xl text-xs text-teal-800 space-y-1.5 mb-4">
    <span className="font-bold flex items-center gap-1">💡 Guía de Iconos:</span>
    <p>Podés buscar cualquier icono en <a href="https://react-icons.github.io/react-icons/" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-teal-900">React Icons</a> y copiar su nombre exacto (por ejemplo: <code className="bg-white px-1 py-0.5 rounded font-mono text-[10px]">FaUsers</code>).</p>
    <p className="text-[11px]"><span className="font-bold">Recomendados:</span> <code className="bg-white px-1 py-0.5 rounded font-mono text-[10px]">FaUsers</code> (Comunidad), <code className="bg-white px-1 py-0.5 rounded font-mono text-[10px]">FaAward</code> (Certificación), <code className="bg-white px-1 py-0.5 rounded font-mono text-[10px]">FaInfinity</code> (Vitalicio), <code className="bg-white px-1 py-0.5 rounded font-mono text-[10px]">FaVideo</code> (En vivo), <code className="bg-white px-1 py-0.5 rounded font-mono text-[10px]">FaLaptopCode</code> (Clases), <code className="bg-white px-1 py-0.5 rounded font-mono text-[10px]">FaCalendarAlt</code> (Fechas), <code className="bg-white px-1 py-0.5 rounded font-mono text-[10px]">FaDownload</code> (Materiales).</p>
  </div>
);

function SectionEditorForm({
  section,
  onChange,
}: {
  section: CourseDescriptionSection;
  onChange: (newData: any) => void;
}) {
  const { type, data } = section;

  // Actualizar una propiedad del data
  const updateProp = (prop: string, val: any) => {
    onChange({ ...data, [prop]: val });
  };

  switch (type) {
    case 'heroEnhancements':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Badges Promocionales (Uno por línea)</label>
            <textarea
              value={data.promotionalBadges?.join('\n') || ''}
              onChange={(e) => updateProp('promotionalBadges', e.target.value.split('\n'))}
              placeholder="Nuevo&#10;Más Vendido&#10;Cupos Limitados"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Texto CTA WhatsApp (Opcional)</label>
            <input
              type="text"
              value={data.whatsappCtaText || ''}
              onChange={(e) => updateProp('whatsappCtaText', e.target.value)}
              placeholder="Chatear con un asesor"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Texto de Urgencia (Opcional)</label>
            <input
              type="text"
              value={data.urgencyText || ''}
              onChange={(e) => updateProp('urgencyText', e.target.value)}
              placeholder="¡Últimas vacantes con descuento!"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Texto Secundario / Kicker (Opcional)</label>
            <input
              type="text"
              value={data.secondaryText || ''}
              onChange={(e) => updateProp('secondaryText', e.target.value)}
              placeholder="Entrenamiento premium de reconfiguración psicológica"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Sobreajuste de Datos Rápidos (Uno por línea, Opcional)</label>
            <textarea
              value={data.quickHighlightsOverride?.join('\n') || ''}
              onChange={(e) => updateProp('quickHighlightsOverride', e.target.value.split('\n'))}
              placeholder="Duración: 6 Semanas&#10;Modalidad: Online en vivo&#10;Acceso: Ilimitado"
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      );

    case 'problems':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección</label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Descripción (Opcional)</label>
            <input
              type="text"
              value={data.description || ''}
              onChange={(e) => updateProp('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Lista de problemas / situaciones (Uno por línea)</label>
            <textarea
              value={data.items?.join('\n') || ''}
              onChange={(e) => updateProp('items', e.target.value.split('\n'))}
              placeholder="¿Sentís miedo al apretar el gatillo?&#10;¿Cerrás operaciones antes de tiempo por ansiedad?"
              rows={5}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Mensaje de Transformación Destacado (Opcional)</label>
            <textarea
              value={data.transformationMessage || ''}
              onChange={(e) => updateProp('transformationMessage', e.target.value)}
              placeholder="El trading rentable no depende del indicador, depende de tu control emocional."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      );

    case 'achievements':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección</label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Beneficios a Lograr (Uno por línea)</label>
            <textarea
              value={data.benefits?.join('\n') || ''}
              onChange={(e) => updateProp('benefits', e.target.value.split('\n'))}
              placeholder="Dominar tu plan de trading bajo presión&#10;Eliminar por completo el Overtrading compulsivo"
              rows={6}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      );

    case 'proposal':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección</label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Subtítulo (Opcional)</label>
            <input
              type="text"
              value={data.subtitle || ''}
              onChange={(e) => updateProp('subtitle', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Contenido (Markdown Soportado)</label>
            <textarea
              value={data.content}
              onChange={(e) => updateProp('content', e.target.value)}
              placeholder="Escribí aquí la propuesta en detalle. Podés usar **negrita**, *cursiva* y listas con guiones."
              rows={8}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      );

    case 'additionalBenefits':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección</label>
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="space-y-3">
            <label className="block font-semibold text-gray-700">Grid de Beneficios</label>
            <IconHelpGuide />
            {data.benefits.map((item, idx) => (
              <div key={idx} className="p-3 border border-gray-100 rounded-xl bg-gray-50/50 space-y-2 relative">
                <button
                  type="button"
                  onClick={() => {
                    const list = [...data.benefits];
                    list.splice(idx, 1);
                    updateProp('benefits', list);
                  }}
                  className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block mb-1">Icono (FaName, ej: FaUsers, FaAward)</span>
                    <input
                      type="text"
                      value={item.icon}
                      onChange={(e) => {
                        const list = [...data.benefits];
                        list[idx].icon = e.target.value;
                        updateProp('benefits', list);
                      }}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block mb-1">Título</span>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => {
                        const list = [...data.benefits];
                        list[idx].title = e.target.value;
                        updateProp('benefits', list);
                      }}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">Descripción</span>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => {
                      const list = [...data.benefits];
                      list[idx].description = e.target.value;
                      updateProp('benefits', list);
                    }}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                updateProp('benefits', [...data.benefits, { icon: 'FaAward', title: '', description: '' }]);
              }}
              className="py-1 px-3 border border-dashed border-teal-500 text-teal-600 rounded-lg text-xs font-semibold hover:bg-teal-50/50"
            >
              + Añadir Beneficio
            </button>
          </div>
        </div>
      );

    case 'campusVirtual':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección</label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Descripción</label>
            <textarea
              value={data.description}
              onChange={(e) => updateProp('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <ImageUploader
              label="Imagen Principal del Campus Virtual"
              value={data.image || ''}
              onChange={(url) => updateProp('image', url)}
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">URL Video Demostrativo (Opcional)</label>
            <input
              type="url"
              value={data.videoUrl || ''}
              onChange={(e) => updateProp('videoUrl', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Galería de Imágenes (URLs, una por línea)</label>
            <textarea
              value={data.gallery?.join('\n') || ''}
              onChange={(e) => updateProp('gallery', e.target.value.split('\n'))}
              placeholder="https://ejemplo.com/foto1.png&#10;https://ejemplo.com/foto2.png"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      );

    case 'instructorSection':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección (Opcional)</label>
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="space-y-3">
            <label className="block font-semibold text-gray-700">Formadores</label>
            {data.instructors.map((ins, idx) => (
              <div key={idx} className="p-4 border border-gray-100 rounded-xl bg-gray-50/50 space-y-3 relative">
                <button
                  type="button"
                  onClick={() => {
                    const list = [...data.instructors];
                    list.splice(idx, 1);
                    updateProp('instructors', list);
                  }}
                  className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-700 font-bold"
                >
                  Eliminar
                </button>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block mb-1">Nombre</span>
                    <input
                      type="text"
                      value={ins.name}
                      onChange={(e) => {
                        const list = [...data.instructors];
                        list[idx].name = e.target.value;
                        updateProp('instructors', list);
                      }}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block mb-1">Cargo</span>
                    <input
                      type="text"
                      value={ins.role}
                      onChange={(e) => {
                        const list = [...data.instructors];
                        list[idx].role = e.target.value;
                        updateProp('instructors', list);
                      }}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <ImageUploader
                    label="Foto del Instructor"
                    value={ins.avatarUrl}
                    onChange={(url) => {
                      const list = [...data.instructors];
                      list[idx].avatarUrl = url;
                      updateProp('instructors', list);
                    }}
                  />
                </div>

                <div>
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">Biografía (Markdown Soportado)</span>
                  <textarea
                    value={ins.bio}
                    onChange={(e) => {
                      const list = [...data.instructors];
                      list[idx].bio = e.target.value;
                      updateProp('instructors', list);
                    }}
                    rows={3}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                updateProp('instructors', [...data.instructors, { name: '', role: '', bio: '', avatarUrl: '' }]);
              }}
              className="py-1 px-3 border border-dashed border-teal-500 text-teal-600 rounded-lg text-xs font-semibold hover:bg-teal-50/50"
            >
              + Añadir Instructor
            </button>
          </div>
        </div>
      );

    case 'requirements':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección</label>
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Requisitos Obligatorios (Uno por línea)</label>
            <textarea
              value={data.requiredItems?.join('\n') || ''}
              onChange={(e) => updateProp('requiredItems', e.target.value.split('\n'))}
              placeholder="Cuenta en Broker&#10;Haber cursado Psicotrading Inicial"
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Requisitos Opcionales / Recomendados (Uno por línea)</label>
            <textarea
              value={data.optionalItems?.join('\n') || ''}
              onChange={(e) => updateProp('optionalItems', e.target.value.split('\n'))}
              placeholder="Lectura recomendada: Trading in the Zone&#10;Capital mínimo de $100 USD"
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      );

    case 'featuresGrid':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección</label>
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="space-y-3">
            <label className="block font-semibold text-gray-700">Características del Curso</label>
            <IconHelpGuide />
            {data.items.map((item, idx) => (
              <div key={idx} className="p-3 border border-gray-100 rounded-xl bg-gray-50/50 space-y-2 relative">
                <button
                  type="button"
                  onClick={() => {
                    const list = [...data.items];
                    list.splice(idx, 1);
                    updateProp('items', list);
                  }}
                  className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block mb-1">Icono (FaName, ej: FaCalendarAlt, FaVideo)</span>
                    <input
                      type="text"
                      value={item.icon}
                      onChange={(e) => {
                        const list = [...data.items];
                        list[idx].icon = e.target.value;
                        updateProp('items', list);
                      }}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block mb-1">Título</span>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => {
                        const list = [...data.items];
                        list[idx].title = e.target.value;
                        updateProp('items', list);
                      }}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">Descripción</span>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => {
                      const list = [...data.items];
                      list[idx].description = e.target.value;
                      updateProp('items', list);
                    }}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                updateProp('items', [...data.items, { icon: 'FaCheckCircle', title: '', description: '' }]);
              }}
              className="py-1 px-3 border border-dashed border-teal-500 text-teal-600 rounded-lg text-xs font-semibold hover:bg-teal-50/50"
            >
              + Añadir Característica
            </button>
          </div>
        </div>
      );

    case 'enrollmentEnhancements':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección (Opcional)</label>
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Subtítulo (Opcional)</label>
            <input
              type="text"
              value={data.subtitle || ''}
              onChange={(e) => updateProp('subtitle', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Texto de Urgencia (Opcional)</label>
            <input
              type="text"
              value={data.urgencyText || ''}
              onChange={(e) => updateProp('urgencyText', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Nota Extra de Compra (Opcional)</label>
            <input
              type="text"
              value={data.extraNote || ''}
              onChange={(e) => updateProp('extraNote', e.target.value)}
              placeholder="3 cuotas sin interés con todas las tarjetas"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Enlace de Ayuda / Texto de Soporte de WhatsApp (Opcional)</label>
            <input
              type="text"
              value={data.whatsappHelpText || ''}
              onChange={(e) => updateProp('whatsappHelpText', e.target.value)}
              placeholder="Consultar por WhatsApp formas de pago alternativas"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      );

    case 'testimonials':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección</label>
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="space-y-3">
            <label className="block font-semibold text-gray-700">Listado de Testimonios</label>
            {data.items.map((item, idx) => (
              <div key={idx} className="p-3 border border-gray-100 rounded-xl bg-gray-50/50 space-y-2 relative">
                <button
                  type="button"
                  onClick={() => {
                    const list = [...data.items];
                    list.splice(idx, 1);
                    updateProp('items', list);
                  }}
                  className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block mb-1">Nombre</span>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        const list = [...data.items];
                        list[idx].name = e.target.value;
                        updateProp('items', list);
                      }}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block mb-1">Red Social / Cargo</span>
                    <input
                      type="text"
                      value={item.roleOrCompany || ''}
                      onChange={(e) => {
                        const list = [...data.items];
                        list[idx].roleOrCompany = e.target.value;
                        updateProp('items', list);
                      }}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <ImageUploader
                      label="Foto de Perfil (Opcional)"
                      value={item.avatarUrl || ''}
                      onChange={(url) => {
                        const list = [...data.items];
                        list[idx].avatarUrl = url;
                        updateProp('items', list);
                      }}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block mb-1">Puntuación (1-5)</span>
                    <select
                      value={item.rating || 5}
                      onChange={(e) => {
                        const list = [...data.items];
                        list[idx].rating = Number(e.target.value);
                        updateProp('items', list);
                      }}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white text-gray-800"
                    >
                      <option value="5">5 estrellas</option>
                      <option value="4">4 estrellas</option>
                      <option value="3">3 estrellas</option>
                      <option value="2">2 estrellas</option>
                      <option value="1">1 estrella</option>
                    </select>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">Testimonio</span>
                  <textarea
                    value={item.text}
                    onChange={(e) => {
                      const list = [...data.items];
                      list[idx].text = e.target.value;
                      updateProp('items', list);
                    }}
                    rows={2}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                updateProp('items', [...data.items, { name: '', text: '', roleOrCompany: '', rating: 5 }]);
              }}
              className="py-1 px-3 border border-dashed border-teal-500 text-teal-600 rounded-lg text-xs font-semibold hover:bg-teal-50/50"
            >
              + Añadir Testimonio
            </button>
          </div>
        </div>
      );

    case 'faq':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección</label>
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="space-y-3">
            <label className="block font-semibold text-gray-700">Preguntas y Respuestas</label>
            {data.items.map((item, idx) => (
              <div key={idx} className="p-3 border border-gray-100 rounded-xl bg-gray-50/50 space-y-2 relative">
                <button
                  type="button"
                  onClick={() => {
                    const list = [...data.items];
                    list.splice(idx, 1);
                    updateProp('items', list);
                  }}
                  className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">Pregunta</span>
                  <input
                    type="text"
                    value={item.question}
                    onChange={(e) => {
                      const list = [...data.items];
                      list[idx].question = e.target.value;
                      updateProp('items', list);
                    }}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-semibold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">Respuesta</span>
                  <textarea
                    value={item.answer}
                    onChange={(e) => {
                      const list = [...data.items];
                      list[idx].answer = e.target.value;
                      updateProp('items', list);
                    }}
                    rows={2}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                updateProp('items', [...data.items, { question: '', answer: '' }]);
              }}
              className="py-1 px-3 border border-dashed border-teal-500 text-teal-600 rounded-lg text-xs font-semibold hover:bg-teal-50/50"
            >
              + Añadir Pregunta
            </button>
          </div>
        </div>
      );

    case 'curriculum':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección</label>
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Descripción de la Propuesta Formativa (Opcional)</label>
            <input
              type="text"
              value={data.description || ''}
              onChange={(e) => updateProp('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="space-y-3">
            <label className="block font-semibold text-gray-700">Módulos de Clases</label>
            {data.modules.map((mod, idx) => (
              <div key={idx} className="p-3 border border-gray-100 rounded-xl bg-gray-50/50 space-y-2 relative">
                <button
                  type="button"
                  onClick={() => {
                    const list = [...data.modules];
                    list.splice(idx, 1);
                    updateProp('modules', list);
                  }}
                  className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-700"
                >
                  Eliminar Módulo
                </button>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">Título del Módulo</span>
                  <input
                    type="text"
                    value={mod.title}
                    onChange={(e) => {
                      const list = [...data.modules];
                      list[idx].title = e.target.value;
                      updateProp('modules', list);
                    }}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">Descripción del Temario</span>
                  <input
                    type="text"
                    value={mod.description || ''}
                    onChange={(e) => {
                      const list = [...data.modules];
                      list[idx].description = e.target.value;
                      updateProp('modules', list);
                    }}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block mb-1">Lista de Lecciones (Una por línea)</span>
                  <textarea
                    value={mod.lessons?.join('\n') || ''}
                    onChange={(e) => {
                      const list = [...data.modules];
                      list[idx].lessons = e.target.value.split('\n');
                      updateProp('modules', list);
                    }}
                    placeholder="Clase 1: Introducción a la reconfiguración mental&#10;Clase 2: Gestión monetaria adaptativa"
                    rows={3}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                updateProp('modules', [...data.modules, { title: '', description: '', lessons: [] }]);
              }}
              className="py-1 px-3 border border-dashed border-teal-500 text-teal-600 rounded-lg text-xs font-semibold hover:bg-teal-50/50"
            >
              + Añadir Módulo
            </button>
          </div>
        </div>
      );

    default:
      return <div>Formulario no soportado para este tipo de sección.</div>;
  }
}

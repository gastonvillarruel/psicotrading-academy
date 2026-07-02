'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateCourse } from '@/app/actions/courses';
import { z } from 'zod';
import { CourseDescriptionSection, createDefaultSections } from '@/types/course';
import * as FaIcons from 'react-icons/fa';
import ImageUploader from '@/components/ImageUploader';
import CourseCampusContentTab from '@/components/admin/CourseCampusContentTab';
import type { AdminCourseCampusContent } from '@/types/admin-course-content';
import { normalizeTimeLabel } from '@/lib/courseStartDates';

const startDateInputSchema = z.object({
  id: z.string().optional(),
  startDate: z.string().min(1, 'La fecha de inicio es requerida.'),
  startTime: z.string().nullable().optional().or(z.literal('')),
  teacherName: z.string().nullable().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  scheduleOptionId: z.string().nullable().optional().or(z.literal('')),
});

const courseSchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres.'),
  slug: z.string().min(3, 'El slug debe tener al menos 3 caracteres.').regex(/^[a-z0-9-]+$/, 'El slug solo debe contener letras minúsculas, números y guiones.'),
  shortDescription: z.string().min(10, 'La descripción corta debe tener al menos 10 caracteres.'),
  longDescription: z.string().min(20, 'La descripción larga debe tener al menos 20 caracteres.'),
  price: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'El precio debe ser un número positivo.'),
  priceARS: z.string().refine((val) => val === '' || (!isNaN(Number(val)) && Number(val) >= 0), 'El precio ARS debe ser un número positivo.').optional(),
  priceUSD: z.string().refine((val) => val === '' || (!isNaN(Number(val)) && Number(val) >= 0), 'El precio USD debe ser un número positivo.').optional(),
  originalPriceARS: z.string().refine((val) => val === '' || (!isNaN(Number(val)) && Number(val) >= 0), 'El precio original ARS debe ser un número positivo.').optional(),
  originalPriceUSD: z.string().refine((val) => val === '' || (!isNaN(Number(val)) && Number(val) >= 0), 'El precio original USD debe ser un número positivo.').optional(),
  priceUSDT: z.string().refine((val) => val === '' || (!isNaN(Number(val)) && Number(val) >= 0), 'El precio USDT debe ser un número positivo.').optional(),
  originalPriceUSDT: z.string().refine((val) => val === '' || (!isNaN(Number(val)) && Number(val) >= 0), 'El precio original USDT debe ser un número positivo.').optional(),
  paymentMode: z.enum(['cash', 'installments']).default('cash'),
  durationInMonths: z.string().refine((val) => val === '' || (!isNaN(Number(val)) && Number(val) >= 1), 'La duración debe ser un número positivo.').optional(),
  duration: z.string().trim().optional(),
  sortOrder: z.string().refine((val) => val === '' || !isNaN(Number(val)), 'El orden debe ser un número entero.').optional(),
  type: z.enum(['LIVE', 'RECORDED']),
  videoUrl: z.string().url('Ingresá una URL válida.').nullable().optional().or(z.literal('')),
  scheduledAt: z.string().nullable().optional().or(z.literal('')),
  thumbnail: z.string().url('Ingresá una URL de imagen válida.').nullable().optional().or(z.literal('')),
  available: z.boolean().optional().default(true),
  fakeEnrollments: z.string().refine((val) => val === '' || (!isNaN(Number(val)) && Number(val) >= 0 && Number.isInteger(Number(val))), 'El número de personas inscriptas debe ser un número entero positivo o cero.').optional(),
  startDates: z.array(startDateInputSchema).optional().default([]),
});

interface EditCourseFormProps {
  course: {
    id: string;
    title: string;
    slug: string;
    shortDescription: string;
    longDescription: string;
    price: number;
    priceARS?: number | null;
    priceUSD?: number | null;
    originalPriceARS?: number | null;
    originalPriceUSD?: number | null;
    priceUSDT?: any;
    originalPriceUSDT?: any;
    paymentMode?: 'cash' | 'installments' | string | null;
    durationInMonths?: number | null;
    duration?: string | null;
    sortOrder?: number | null;
    type: 'LIVE' | 'RECORDED';
    videoUrl: string | null;
    scheduledAt: Date | null;
    thumbnail: string | null;
    instructorName?: string | null;
    instructorRole?: string | null;
    instructorBio?: string | null;
    descriptionSections?: any;
    available?: boolean | null;
    fakeEnrollments?: number | null;
    startDates?: any[];
  };
  initialCampusContent: AdminCourseCampusContent;
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

export default function EditCourseForm({ course, initialCampusContent }: EditCourseFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'basic' | 'landing' | 'campus'>('basic');

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
    priceARS: course.priceARS !== null && course.priceARS !== undefined ? String(course.priceARS) : (course.price ? String(course.price) : ''),
    priceUSD: course.priceUSD !== null && course.priceUSD !== undefined ? String(course.priceUSD) : '',
    originalPriceARS: course.originalPriceARS !== null && course.originalPriceARS !== undefined ? String(course.originalPriceARS) : '',
    originalPriceUSD: course.originalPriceUSD !== null && course.originalPriceUSD !== undefined ? String(course.originalPriceUSD) : '',
    priceUSDT: course.priceUSDT !== null && course.priceUSDT !== undefined ? String(course.priceUSDT) : '',
    originalPriceUSDT: course.originalPriceUSDT !== null && course.originalPriceUSDT !== undefined ? String(course.originalPriceUSDT) : '',
    paymentMode: (course.paymentMode as 'cash' | 'installments') || 'cash',
    durationInMonths: course.durationInMonths !== null && course.durationInMonths !== undefined ? String(course.durationInMonths) : '',
    duration: course.duration || '',
    sortOrder: course.sortOrder !== undefined && course.sortOrder !== null ? String(course.sortOrder) : '0',
    type: course.type,
    videoUrl: course.videoUrl || '',
    scheduledAt: formatDateTime(course.scheduledAt),
    thumbnail: course.thumbnail || '',
    available: course.available !== false,
    fakeEnrollments: course.fakeEnrollments !== null && course.fakeEnrollments !== undefined ? String(course.fakeEnrollments) : '',
  });

  const [startDates, setStartDates] = useState<{
    id?: string;
    startDate: string;
    startTime: string;
    teacherName: string;
    isActive: boolean;
    scheduleOptionId: string;
  }[]>(() => {
    if (course.startDates && course.startDates.length > 0) {
      return course.startDates.map((sd: any) => ({
        id: sd.id,
        startDate: sd.startDate ? new Date(sd.startDate).toISOString().split('T')[0] : '',
        startTime: sd.startTime || '',
        teacherName: sd.teacherName || '',
        isActive: sd.isActive ?? true,
        scheduleOptionId: sd.scheduleOptionId || '',
      }));
    }
    return [];
  });

  // Estado de las secciones de la landing
  const [sections, setSections] = useState<CourseDescriptionSection[]>(() => {
    try {
      if (course.descriptionSections) {
        const parsed = typeof course.descriptionSections === 'string'
          ? JSON.parse(course.descriptionSections)
          : (course.descriptionSections as CourseDescriptionSection[]);
        if (parsed && Array.isArray(parsed) && !parsed.some((s: any) => s.type === 'finalEnrollment')) {
          parsed.push({
            id: 'finalEnrollment',
            type: 'finalEnrollment',
            enabled: true,
            data: { title: 'Iniciá tu camino hacia la consistencia mental' }
          });
        }
        return parsed;
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
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
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
      case 'finalEnrollment':
        defaultData = { title: 'Iniciá tu camino hacia la consistencia mental' };
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

  const handleDownloadJson = () => {
    try {
      const dataStr = JSON.stringify(sections, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const exportFileDefaultName = `landing-secciones-${formData.slug || 'curso'}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', url);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.style.display = 'none';
      document.body.appendChild(linkElement);
      linkElement.click();
      document.body.removeChild(linkElement);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error al descargar el JSON:', e);
      alert('Ocurrió un error al generar el archivo JSON.');
    }
  };

  const handleUploadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileReader = new FileReader();
    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!Array.isArray(parsed)) {
          throw new Error('El JSON debe ser un array de secciones.');
        }
        for (const sec of parsed) {
          if (typeof sec !== 'object' || sec === null || !sec.type || typeof sec.enabled !== 'boolean') {
            throw new Error('Cada sección debe tener campos "type" y "enabled".');
          }
        }
        setSections(parsed);
        if (parsed.length > 0) {
          setSelectedSectionId(parsed[0].id);
        } else {
          setSelectedSectionId(null);
        }
        setError(null);
        alert('Secciones cargadas correctamente en el formulario.');
      } catch (err: any) {
        console.error(err);
        setError(`Error al cargar el JSON: ${err.message || 'Formato inválido'}`);
      }
    };
    fileReader.readAsText(file);
    e.target.value = '';
  };

  // --- Envío del Formulario ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Validaciones locales adicionales
      if (formData.paymentMode === 'installments') {
        if (!formData.durationInMonths || Number(formData.durationInMonths) < 1) {
          setError('Para usar precio en cuotas, primero definí la duración del curso en meses.');
          setIsLoading(false);
          return;
        }
      }

      const currentARSVal = formData.priceARS ? Number(formData.priceARS) : 0;
      const currentUSDVal = formData.priceUSD ? Number(formData.priceUSD) : 0;

      // Validar precio anterior ARS contra precio actual efectivo ARS
      if (formData.originalPriceARS) {
        const origARS = Number(formData.originalPriceARS);
        const legacyPriceVal = formData.price ? Number(formData.price) : 0;
        const effectiveARS = formData.priceARS ? Number(formData.priceARS) : legacyPriceVal;
        if (origARS <= effectiveARS) {
          setError('El precio real/anterior en ARS debe ser mayor que el precio actual en ARS.');
          setIsLoading(false);
          return;
        }
      }

      // Validar precio anterior USD contra precio actual USD
      if (formData.originalPriceUSD) {
        const origUSD = Number(formData.originalPriceUSD);
        if (!formData.priceUSD || currentUSDVal <= 0) {
          setError('Para cargar un precio real/anterior en USD, primero definí el precio actual en USD.');
          setIsLoading(false);
          return;
        }
        if (origUSD <= currentUSDVal) {
          setError('El precio real/anterior en USD debe ser mayor que el precio actual en USD.');
          setIsLoading(false);
          return;
        }
      }

      // Validar precio anterior USDT contra precio actual USDT
      if (formData.originalPriceUSDT) {
        const origUSDT = Number(formData.originalPriceUSDT);
        const currentUSDTVal = formData.priceUSDT ? Number(formData.priceUSDT) : 0;
        if (!formData.priceUSDT || currentUSDTVal <= 0) {
          setError('Para cargar un precio real/anterior en USDT, primero definí el precio actual en USDT.');
          setIsLoading(false);
          return;
        }
        if (origUSDT <= currentUSDTVal) {
          setError('El precio real/anterior en USDT debe ser mayor que el precio actual en USDT.');
          setIsLoading(false);
          return;
        }
      }

      // Filtrar filas vacías de fechas
      const filteredDates = startDates.filter(sd => sd.startDate !== '');

      // Validar datos básicos
      const validated = courseSchema.parse({
        ...formData,
        startDates: filteredDates,
      });

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

      // El legacy price en ARS es priceARS si existe, sino el price viejo o 0
      const legacyPrice = validated.priceARS ? Number(validated.priceARS) : Number(validated.price);

      // Llamar a Server Action con todas las secciones de la landing page
      const result = await updateCourse(course.id, {
        title: validated.title,
        slug: validated.slug,
        shortDescription: validated.shortDescription,
        longDescription: validated.longDescription,
        price: legacyPrice,
        priceARS: validated.priceARS ? Number(validated.priceARS) : null,
        priceUSD: validated.priceUSD ? Number(validated.priceUSD) : null,
        originalPriceARS: validated.originalPriceARS ? Number(validated.originalPriceARS) : null,
        originalPriceUSD: validated.originalPriceUSD ? Number(validated.originalPriceUSD) : null,
        priceUSDT: validated.priceUSDT ? Number(validated.priceUSDT) : null,
        originalPriceUSDT: validated.originalPriceUSDT ? Number(validated.originalPriceUSDT) : null,
        paymentMode: validated.paymentMode,
        durationInMonths: validated.durationInMonths ? Number(validated.durationInMonths) : null,
        duration: validated.duration || null,
        sortOrder: validated.sortOrder ? Number(validated.sortOrder) : 0,
        type: validated.type,
        videoUrl: validated.videoUrl || null,
        scheduledAt: validated.scheduledAt || null,
        thumbnail: validated.thumbnail || null,
        descriptionSections: cleanedSections, // Pasamos el array limpio
        available: validated.available,
        fakeEnrollments: validated.fakeEnrollments ? Number(validated.fakeEnrollments) : null,
        startDates: validated.startDates,
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
          className={`py-3 px-6 font-semibold text-sm border-b-2 transition-all ${activeTab === 'basic'
            ? 'border-teal-600 text-teal-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          Información Básica
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('landing')}
          className={`py-3 px-6 font-semibold text-sm border-b-2 transition-all ${activeTab === 'landing'
            ? 'border-teal-600 text-teal-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          Secciones de la Landing Page ({sections.filter(s => s.enabled).length} activas)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('campus')}
          className={`py-3 px-6 font-semibold text-sm border-b-2 transition-all ${activeTab === 'campus'
            ? 'border-teal-600 text-teal-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          Contenido del Campus
        </button>
      </div>

      {activeTab === 'campus' ? (
        <CourseCampusContentTab initialContent={initialCampusContent} />
      ) : (
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

            {/* Modalidad de pago */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="paymentMode">
                Modalidad de Pago
              </label>
              <select
                id="paymentMode"
                name="paymentMode"
                value={formData.paymentMode}
                onChange={handleChange}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm bg-white"
              >
                <option value="cash">Contado</option>
                <option value="installments">En Cuotas</option>
              </select>
            </div>

            {/* Duración (meses) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="durationInMonths">
                Duración (Meses)
              </label>
              <input
                id="durationInMonths"
                name="durationInMonths"
                type="number"
                min="1"
                value={formData.durationInMonths}
                onChange={handleChange}
                placeholder="Ej. 3"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            {/* Duración del curso */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="duration">
                Duración del curso
              </label>
              <input
                id="duration"
                name="duration"
                type="text"
                value={formData.duration}
                onChange={handleChange}
                placeholder="Ej: 4 semanas, 8 clases, 3 meses, acceso inmediato"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Este texto se mostrará en la tarjeta del curso dentro del Campus.
              </p>
            </div>

            {/* Legacy sortOrder hidden input */}
            <input type="hidden" name="sortOrder" value={formData.sortOrder} />

            {/* Personas inscriptas visibles */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="fakeEnrollments">
                Personas inscriptas visibles
              </label>
              <input
                id="fakeEnrollments"
                name="fakeEnrollments"
                type="number"
                min="0"
                step="1"
                value={formData.fakeEnrollments}
                onChange={handleChange}
                placeholder="Ej: 53265"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Número ficticio que se mostrará en la tarjeta del curso. Si lo dejás vacío, no se muestra.
              </p>
            </div>

            {/* Precio ARS */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="priceARS">
                Precio Actual (ARS) {formData.paymentMode === 'installments' && '(Por Cuota)'}
              </label>
              <input
                id="priceARS"
                name="priceARS"
                type="number"
                min="0"
                value={formData.priceARS}
                onChange={handleChange}
                placeholder="Ej. 35000"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            {/* Precio USD */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="priceUSD">
                Precio Actual (USD) {formData.paymentMode === 'installments' && '(Por Cuota)'}
              </label>
              <input
                id="priceUSD"
                name="priceUSD"
                type="number"
                min="0"
                value={formData.priceUSD}
                onChange={handleChange}
                placeholder="Ej. 50"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            {/* Precio USDT */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="priceUSDT">
                Precio en USDT {formData.paymentMode === 'installments' && '(Por Cuota)'}
              </label>
              <input
                id="priceUSDT"
                name="priceUSDT"
                type="number"
                step="any"
                min="0"
                value={formData.priceUSDT}
                onChange={handleChange}
                placeholder="Ej. 50 o 49.99"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            {/* Precio Anterior/Tachado USDT */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="originalPriceUSDT">
                Precio Anterior/Tachado (USDT)
              </label>
              <input
                id="originalPriceUSDT"
                name="originalPriceUSDT"
                type="number"
                step="any"
                min="0"
                value={formData.originalPriceUSDT}
                onChange={handleChange}
                placeholder="Ej. 75 o 74.99"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            {/* Precio Real ARS */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="originalPriceARS">
                Precio Anterior/Tachado (ARS)
              </label>
              <input
                id="originalPriceARS"
                name="originalPriceARS"
                type="number"
                min="0"
                value={formData.originalPriceARS}
                onChange={handleChange}
                placeholder="Ej. 45000"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            {/* Precio Real USD */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="originalPriceUSD">
                Precio Anterior/Tachado (USD)
              </label>
              <input
                id="originalPriceUSD"
                name="originalPriceUSD"
                type="number"
                min="0"
                value={formData.originalPriceUSD}
                onChange={handleChange}
                placeholder="Ej. 75"
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
              />
            </div>

            {/* Legacy Price input hidden */}
            <input type="hidden" name="price" value={formData.price} />

            {/* Curso Disponible */}
            <div className="sm:col-span-2 flex flex-col justify-center border border-gray-100 rounded-xl p-4 bg-gray-50/50">
              <div className="flex items-center space-x-3">
                <input
                  id="available"
                  name="available"
                  type="checkbox"
                  checked={formData.available}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="h-5 w-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <label htmlFor="available" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
                  Curso disponible
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-1.5 pl-8">
                Si desactivás esta opción, el curso se mostrará en el campus como “Próximamente”, pero los alumnos no podrán ingresar a ver sus detalles.
              </p>
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

            {/* Fechas de Inicio Múltiples (Solo si es En Vivo - Opcional) */}
            {formData.type === 'LIVE' && (
              <div className="sm:col-span-2 border border-gray-100 rounded-2xl p-6 bg-gray-50/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Fechas de Inicio Múltiples (Opcional)</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Define diferentes opciones de cursada. Si se cargan, invalidarán la fecha legacy de arriba.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStartDates(prev => [...prev, { startDate: '', startTime: '', teacherName: '', isActive: true, scheduleOptionId: '' }])}
                    className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    + Añadir Fecha
                  </button>
                </div>

                {startDates.length > 0 ? (
                  <div className="space-y-3">
                    {startDates.map((sd, idx) => (
                      <div key={idx} className="p-4 bg-white border border-gray-100 rounded-xl flex flex-col md:flex-row gap-3 items-start md:items-center relative">
                        <button
                          type="button"
                          onClick={() => setStartDates(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xs cursor-pointer font-medium"
                        >
                          Eliminar
                        </button>

                        <div className="flex-1 space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 block">Fecha de Inicio *</label>
                          <input
                            type="date"
                            required
                            value={sd.startDate}
                            onChange={(e) => {
                              const list = [...startDates];
                              list[idx].startDate = e.target.value;
                              setStartDates(list);
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-xs focus:ring-1 focus:ring-teal-500 text-gray-900"
                          />
                        </div>

                        <div className="flex-1 space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 block">Horario (Opcional)</label>
                          <input
                            type="time"
                            value={normalizeTimeLabel(sd.startTime) || ''}
                            onChange={(e) => {
                              const list = [...startDates];
                              list[idx].startTime = e.target.value;
                              setStartDates(list);
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-xs focus:ring-1 focus:ring-teal-500 text-gray-900"
                          />
                        </div>

                        <div className="flex-1 space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 block">Docente (Opcional)</label>
                          <input
                            type="text"
                            placeholder="Ej. Marcela Rosana Molina"
                            value={sd.teacherName}
                            onChange={(e) => {
                              const list = [...startDates];
                              list[idx].teacherName = e.target.value;
                              setStartDates(list);
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-xs focus:ring-1 focus:ring-teal-500 text-gray-900"
                          />
                        </div>

                         <div className="flex-1 space-y-1">
                           <label className="text-[10px] font-bold text-gray-400 block">Comisión (Opcional)</label>
                           <select
                             value={sd.scheduleOptionId || ''}
                             onChange={(e) => {
                               const list = [...startDates];
                               list[idx].scheduleOptionId = e.target.value;
                               setStartDates(list);
                             }}
                             className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-xs focus:ring-1 focus:ring-teal-500 text-gray-900 bg-white"
                           >
                             <option value="">Ninguna</option>
                             {initialCampusContent.scheduleOptions?.map((opt: any) => (
                               <option key={opt.id} value={opt.id}>
                                 {opt.name}
                               </option>
                             ))}
                           </select>
                         </div>

                        <div className="flex items-center space-x-2 pt-4 md:pt-0 self-start md:self-center">
                          <input
                            type="checkbox"
                            id={`isActive-${idx}`}
                            checked={sd.isActive}
                            onChange={(e) => {
                              const list = [...startDates];
                              list[idx].isActive = e.target.checked;
                              setStartDates(list);
                            }}
                            className="h-4 w-4 border-gray-300 rounded text-teal-600 focus:ring-teal-500"
                          />
                          <label htmlFor={`isActive-${idx}`} className="text-xs text-gray-600 cursor-pointer select-none">Activa</label>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic text-center py-4 bg-white border border-dashed border-gray-200 rounded-xl">No hay fechas adicionales cargadas. Se usará la fecha legacy de arriba.</p>
                )}
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
            <div className="flex flex-wrap gap-4 items-center justify-between bg-teal-50/50 border border-teal-100 rounded-xl p-4">
              <div className="text-xs text-teal-800">
                <span className="font-bold">Estructura de Secciones:</span> Podés descargar la configuración actual en formato JSON o importar una nueva.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <FaIcons.FaDownload className="text-gray-500" />
                  Descargar JSON
                </button>
                <label className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm">
                  <FaIcons.FaUpload className="text-gray-500" />
                  Cargar JSON
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleUploadJson}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

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

                  <div className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1">
                    {sections.map((sec, idx) => {
                      const isSelected = selectedSectionId === sec.id;
                      return (
                        <div
                          key={sec.id}
                          onClick={() => setSelectedSectionId(sec.id)}
                          className={`p-3.5 rounded-xl border flex items-center justify-between transition-all duration-200 cursor-pointer group relative ${
                            isSelected
                              ? 'bg-gradient-to-r from-teal-50 to-white border-teal-300 text-teal-950 shadow-sm ring-1 ring-teal-300'
                              : 'bg-white border-gray-100 hover:border-gray-300 hover:bg-gray-50/80 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1 mr-2">
                            <input
                              type="checkbox"
                              checked={sec.enabled}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSectionEnabled(sec.id);
                              }}
                              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 h-4 w-4 cursor-pointer flex-shrink-0 transition-all"
                            />
                            <span className={`text-xs font-semibold select-none break-words whitespace-normal line-clamp-2 leading-tight ${
                              !sec.enabled 
                                ? 'line-through text-gray-400' 
                                : isSelected 
                                  ? 'text-teal-950 font-bold' 
                                  : 'text-gray-800'
                            }`}>
                              {SECTION_LABELS[sec.type] || sec.type}
                            </span>
                          </div>

                          {/* Controles de orden */}
                          <div 
                            className="hidden group-hover:flex items-center space-x-1 flex-shrink-0 transition-all duration-200" 
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveSection(idx, 'up')}
                              className="p-1 hover:bg-gray-100 hover:text-teal-600 text-gray-400 rounded transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-400 cursor-pointer"
                              title="Subir"
                            >
                              <FaIcons.FaArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === sections.length - 1}
                              onClick={() => moveSection(idx, 'down')}
                              className="p-1 hover:bg-gray-100 hover:text-teal-600 text-gray-400 rounded transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-400 cursor-pointer"
                              title="Bajar"
                            >
                              <FaIcons.FaArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSection(sec.id)}
                              className="p-1 hover:bg-red-50 hover:text-red-600 text-gray-400 rounded transition-colors ml-1 cursor-pointer"
                              title="Eliminar"
                            >
                              <FaIcons.FaTrash className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
      )}
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
            <label className="block font-semibold text-gray-700 mb-2">Badges Promocionales</label>
            <div className="space-y-2 mb-3">
              {((data.promotionalBadges || []).map((b: any) => {
                if (typeof b === 'string') {
                  return { text: b, bgColor: 'bg-brand-primary/10', textColor: 'text-brand-primary', borderColor: 'border-brand-primary/20' };
                }
                return b;
              })).map((badge: any, idx: number, arr: any[]) => (
                <div key={idx} className="flex flex-wrap gap-2 items-center p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <input
                    type="text"
                    placeholder="Texto del Badge (Ej: Nuevo)"
                    value={badge.text}
                    onChange={(e) => {
                      const newList = [...arr];
                      newList[idx] = { ...newList[idx], text: e.target.value };
                      updateProp('promotionalBadges', newList);
                    }}
                    className="flex-grow min-w-[120px] px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-950 font-semibold focus:ring-1 focus:ring-teal-500 outline-none"
                  />
                  
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={
                        badge.bgColor === 'bg-brand-primary/10' && badge.textColor === 'text-brand-primary' ? 'blue' :
                        badge.bgColor === 'bg-brand-secondary/15' && badge.textColor === 'text-brand-secondary' ? 'teal' :
                        badge.bgColor === 'bg-brand-accent/15' && badge.textColor === 'text-brand-accent' ? 'orange' :
                        badge.bgColor === 'bg-red-100' && badge.textColor === 'text-red-700' ? 'red' :
                        badge.bgColor === 'bg-gray-100' && badge.textColor === 'text-gray-700' ? 'gray' : 'custom'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        const newList = [...arr];
                        if (val === 'blue') {
                          newList[idx] = { text: badge.text, bgColor: 'bg-brand-primary/10', textColor: 'text-brand-primary', borderColor: 'border-brand-primary/20' };
                        } else if (val === 'teal') {
                          newList[idx] = { text: badge.text, bgColor: 'bg-brand-secondary/15', textColor: 'text-brand-secondary', borderColor: 'border-brand-secondary/20' };
                        } else if (val === 'orange') {
                          newList[idx] = { text: badge.text, bgColor: 'bg-brand-accent/15', textColor: 'text-brand-accent', borderColor: 'border-brand-accent/20' };
                        } else if (val === 'red') {
                          newList[idx] = { text: badge.text, bgColor: 'bg-red-100', textColor: 'text-red-700', borderColor: 'border-red-200' };
                        } else if (val === 'gray') {
                          newList[idx] = { text: badge.text, bgColor: 'bg-gray-100', textColor: 'text-gray-700', borderColor: 'border-gray-200' };
                        } else {
                          newList[idx] = { text: badge.text, bgColor: '#ffffff', textColor: '#000000', borderColor: '#e2e8f0' };
                        }
                        updateProp('promotionalBadges', newList);
                      }}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white text-gray-800 focus:ring-1 focus:ring-teal-500 outline-none w-[130px]"
                    >
                      <option value="blue">Azul</option>
                      <option value="teal">Verde</option>
                      <option value="orange">Naranja</option>
                      <option value="red">Rojo</option>
                      <option value="gray">Gris</option>
                      <option value="custom">Personalizado</option>
                    </select>

                    {!(
                      (badge.bgColor === 'bg-brand-primary/10' && badge.textColor === 'text-brand-primary') ||
                      (badge.bgColor === 'bg-brand-secondary/15' && badge.textColor === 'text-brand-secondary') ||
                      (badge.bgColor === 'bg-brand-accent/15' && badge.textColor === 'text-brand-accent') ||
                      (badge.bgColor === 'bg-red-100' && badge.textColor === 'text-red-700') ||
                      (badge.bgColor === 'bg-gray-100' && badge.textColor === 'text-gray-700')
                    ) && (
                      <div className="flex gap-1.5 items-center bg-white border border-gray-200 p-1 rounded-lg">
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={badge.bgColor?.startsWith('#') ? badge.bgColor : '#ffffff'}
                            title="Fondo"
                            onChange={(e) => {
                              const newList = [...arr];
                              newList[idx] = { ...newList[idx], bgColor: e.target.value };
                              updateProp('promotionalBadges', newList);
                            }}
                            className="w-5 h-5 border-0 rounded cursor-pointer p-0 bg-transparent"
                          />
                          <span className="text-[9px] text-gray-400 font-medium">F</span>
                        </div>
                        <div className="flex items-center gap-1 border-l border-gray-200 pl-1">
                          <input
                            type="color"
                            value={badge.textColor?.startsWith('#') ? badge.textColor : '#000000'}
                            title="Texto"
                            onChange={(e) => {
                              const newList = [...arr];
                              newList[idx] = { ...newList[idx], textColor: e.target.value };
                              updateProp('promotionalBadges', newList);
                            }}
                            className="w-5 h-5 border-0 rounded cursor-pointer p-0 bg-transparent"
                          />
                          <span className="text-[9px] text-gray-400 font-medium">T</span>
                        </div>
                        <div className="flex items-center gap-1 border-l border-gray-200 pl-1">
                          <input
                            type="color"
                            value={badge.borderColor?.startsWith('#') ? badge.borderColor : '#e2e8f0'}
                            title="Borde"
                            onChange={(e) => {
                              const newList = [...arr];
                              newList[idx] = { ...newList[idx], borderColor: e.target.value };
                              updateProp('promotionalBadges', newList);
                            }}
                            className="w-5 h-5 border-0 rounded cursor-pointer p-0 bg-transparent"
                          />
                          <span className="text-[9px] text-gray-400 font-medium">B</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const newList = arr.filter((_, i) => i !== idx);
                      updateProp('promotionalBadges', newList);
                    }}
                    className="text-red-500 hover:text-red-700 cursor-pointer p-1.5 hover:bg-red-50 rounded-lg transition-colors ml-auto"
                    title="Eliminar"
                  >
                    <FaIcons.FaTrash className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const currentList = (data.promotionalBadges || []).map((b: any) => {
                  if (typeof b === 'string') {
                    return { text: b, bgColor: 'bg-brand-primary/10', textColor: 'text-brand-primary', borderColor: 'border-brand-primary/20' };
                  }
                  return b;
                });
                const newList = [...currentList, { text: '', bgColor: 'bg-brand-primary/10', textColor: 'text-brand-primary', borderColor: 'border-brand-primary/20' }];
                updateProp('promotionalBadges', newList);
              }}
              className="py-1.5 px-3 border border-dashed border-teal-500 text-teal-600 rounded-lg text-xs font-semibold hover:bg-teal-50/50 cursor-pointer"
            >
              + Añadir Badge
            </button>
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
            <ImageUploader
              label="Imagen para el Hero (Diferente a la miniatura, Opcional)"
              value={data.heroImage || ''}
              onChange={(url) => updateProp('heroImage', url)}
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
            <label className="block font-semibold text-gray-700 mb-2">Problemas / Situaciones</label>
            <IconHelpGuide />
            <div className="space-y-2 mb-3">
              {((data.items || []).map((item: any) => {
                if (typeof item === 'string') {
                  return { text: item, icon: 'FaBrain' };
                }
                return item;
              })).map((item: any, idx: number, arr: any[]) => (
                <div key={idx} className="flex flex-wrap gap-2 items-center p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="flex-grow min-w-[150px]">
                    <input
                      type="text"
                      placeholder="Texto del problema"
                      value={item.text}
                      onChange={(e) => {
                        const newList = [...arr];
                        newList[idx] = { ...newList[idx], text: e.target.value };
                        updateProp('items', newList);
                      }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-950 font-semibold focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  <div className="w-48">
                    <input
                      type="text"
                      placeholder="Icono (ej: FaBrain)"
                      value={item.icon || 'FaBrain'}
                      onChange={(e) => {
                        const newList = [...arr];
                        newList[idx] = { ...newList[idx], icon: e.target.value };
                        updateProp('items', newList);
                      }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-950 focus:ring-1 focus:ring-teal-500 outline-none font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const newList = arr.filter((_, i) => i !== idx);
                      updateProp('items', newList);
                    }}
                    className="text-red-500 hover:text-red-700 cursor-pointer p-1.5 hover:bg-red-50 rounded-lg transition-colors ml-auto"
                    title="Eliminar"
                  >
                    <FaIcons.FaTrash className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const currentList = (data.items || []).map((item: any) => {
                  if (typeof item === 'string') {
                    return { text: item, icon: 'FaBrain' };
                  }
                  return item;
                });
                const newList = [...currentList, { text: '', icon: 'FaBrain' }];
                updateProp('items', newList);
              }}
              className="py-1.5 px-3 border border-dashed border-teal-500 text-teal-600 rounded-lg text-xs font-semibold hover:bg-teal-50/50 cursor-pointer"
            >
              + Añadir Problema
            </button>
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

          <div>
            <label className="block font-semibold text-gray-700 mb-1">Color de los Iconos (Un color para todos)</label>
            <div className="flex gap-2 items-center">
              <select
                value={
                  data.iconColor === 'brand-primary' ? 'blue' :
                  data.iconColor === 'brand-secondary' ? 'teal' :
                  data.iconColor === 'brand-accent' ? 'orange' :
                  data.iconColor === 'red-600' ? 'red' :
                  data.iconColor === 'gray-600' ? 'gray' : 
                  (data.iconColor?.startsWith('#') ? 'custom' : 'blue')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'blue') updateProp('iconColor', 'brand-primary');
                  else if (val === 'teal') updateProp('iconColor', 'brand-secondary');
                  else if (val === 'orange') updateProp('iconColor', 'brand-accent');
                  else if (val === 'red') updateProp('iconColor', 'red-600');
                  else if (val === 'gray') updateProp('iconColor', 'gray-600');
                  else updateProp('iconColor', '#1E40AF'); // Default hex
                }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white text-gray-800 outline-none focus:ring-1 focus:ring-teal-500 w-[140px]"
              >
                <option value="blue">Azul (Principal)</option>
                <option value="teal">Verde (Secundario)</option>
                <option value="orange">Naranja (Acento)</option>
                <option value="red">Rojo (Alerta)</option>
                <option value="gray">Gris (Neutral)</option>
                <option value="custom">Personalizado (Hex)</option>
              </select>

              {!(
                data.iconColor === 'brand-primary' ||
                data.iconColor === 'brand-secondary' ||
                data.iconColor === 'brand-accent' ||
                data.iconColor === 'red-600' ||
                data.iconColor === 'gray-600' ||
                !data.iconColor
              ) && (
                <div className="flex gap-1.5 items-center bg-white border border-gray-200 p-1.5 rounded-xl">
                  <input
                    type="color"
                    value={data.iconColor?.startsWith('#') ? data.iconColor : '#1E40AF'}
                    title="Color del Icono"
                    onChange={(e) => updateProp('iconColor', e.target.value)}
                    className="w-6 h-6 border-0 rounded cursor-pointer p-0 bg-transparent"
                  />
                  <span className="text-xs text-gray-500 font-semibold">{data.iconColor}</span>
                </div>
              )}
            </div>
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
          <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200">
            <span className="block font-semibold text-gray-700 mb-1">Imagen o Video del Campus Virtual</span>
            <p className="text-xs text-gray-500 font-light">
              Este video está fijo para todos los cursos desde el código: <code className="bg-gray-200/60 px-1.5 py-0.5 rounded font-mono text-[10px]">/brand/campus/campus.webm</code>
            </p>
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

          <div>
            <label className="block font-semibold text-gray-700 mb-1">Color de los Iconos (Un color para todos)</label>
            <div className="flex gap-2 items-center">
              <select
                value={
                  data.iconColor === 'brand-primary' ? 'blue' :
                  data.iconColor === 'brand-secondary' ? 'teal' :
                  data.iconColor === 'brand-accent' ? 'orange' :
                  data.iconColor === 'red-600' ? 'red' :
                  data.iconColor === 'gray-600' ? 'gray' : 
                  (data.iconColor?.startsWith('#') ? 'custom' : 'teal')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'blue') updateProp('iconColor', 'brand-primary');
                  else if (val === 'teal') updateProp('iconColor', 'brand-secondary');
                  else if (val === 'orange') updateProp('iconColor', 'brand-accent');
                  else if (val === 'red') updateProp('iconColor', 'red-600');
                  else if (val === 'gray') updateProp('iconColor', 'gray-600');
                  else updateProp('iconColor', '#0F766E'); // Default hex
                }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white text-gray-800 outline-none focus:ring-1 focus:ring-teal-500 w-[140px]"
              >
                <option value="blue">Azul (Principal)</option>
                <option value="teal">Verde (Secundario)</option>
                <option value="orange">Naranja (Acento)</option>
                <option value="red">Rojo (Alerta)</option>
                <option value="gray">Gris (Neutral)</option>
                <option value="custom">Personalizado (Hex)</option>
              </select>

              {!(
                data.iconColor === 'brand-primary' ||
                data.iconColor === 'brand-secondary' ||
                data.iconColor === 'brand-accent' ||
                data.iconColor === 'red-600' ||
                data.iconColor === 'gray-600' ||
                !data.iconColor
              ) && (
                <div className="flex gap-1.5 items-center bg-white border border-gray-200 p-1.5 rounded-xl">
                  <input
                    type="color"
                    value={data.iconColor?.startsWith('#') ? data.iconColor : '#0F766E'}
                    title="Color del Icono"
                    onChange={(e) => updateProp('iconColor', e.target.value)}
                    className="w-6 h-6 border-0 rounded cursor-pointer p-0 bg-transparent"
                  />
                  <span className="text-xs text-gray-500 font-semibold">{data.iconColor}</span>
                </div>
              )}
            </div>
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

    case 'finalEnrollment':
      return (
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Título de la Sección (Opcional)</label>
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateProp('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="Iniciá tu camino hacia la consistencia mental"
            />
          </div>
          <p className="text-xs text-gray-500">
            Esta sección muestra la tarjeta de cierre de inscripción con los métodos de pago, monedas y fecha de inicio seleccionados. Podés arrastrarla para cambiar su ubicación en la página.
          </p>
        </div>
      );

    default:
      return <div>Formulario no soportado para este tipo de sección.</div>;
  }
}

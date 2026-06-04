'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createCourse } from '@/app/actions/courses';
import { z } from 'zod';
import ImageUploader from '@/components/ImageUploader';

const startDateInputSchema = z.object({
  id: z.string().optional(),
  startDate: z.string().min(1, 'La fecha de inicio es requerida.'),
  startTime: z.string().nullable().optional().or(z.literal('')),
  teacherName: z.string().nullable().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
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

export default function NewCoursePage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    shortDescription: '',
    longDescription: '',
    price: '0',
    priceARS: '',
    priceUSD: '',
    originalPriceARS: '',
    originalPriceUSD: '',
    priceUSDT: '',
    originalPriceUSDT: '',
    paymentMode: 'cash' as 'cash' | 'installments',
    durationInMonths: '',
    duration: '',
    sortOrder: '0',
    type: 'RECORDED',
    videoUrl: '',
    scheduledAt: '',
    thumbnail: '',
    available: true,
    fakeEnrollments: '',
  });

  const [startDates, setStartDates] = useState<{
    startDate: string;
    startTime: string;
    teacherName: string;
    isActive: boolean;
  }[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => {
      const updated = { ...prev, [name]: val };
      
      // Auto-generar slug a partir del título si el campo slug no se ha editado a mano
      if (name === 'title' && !prev.slug) {
        updated.slug = typeof val === 'string' ? val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '') : prev.slug;
      }
      return updated;
    });
    if (error) setError(null);
  };

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

      // Validar que al menos un precio esté cargado si el curso es de pago
      const currentARSVal = formData.priceARS ? Number(formData.priceARS) : 0;
      const currentUSDVal = formData.priceUSD ? Number(formData.priceUSD) : 0;
      const hasAnyPrice = currentARSVal > 0 || currentUSDVal > 0;

      if (!hasAnyPrice) {
        // Si no tiene precio, se considera gratuito (ambos en 0), lo cual es válido.
      } else {
        // Validar precio anterior ARS contra precio actual efectivo ARS
        if (formData.originalPriceARS) {
          const origARS = Number(formData.originalPriceARS);
          if (origARS <= currentARSVal) {
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
      }

      // Filtrar filas vacías de fechas
      const filteredDates = startDates.filter(sd => sd.startDate !== '');

      // Validar datos localmente con Zod
      const validated = courseSchema.parse({
        ...formData,
        startDates: filteredDates,
      });

      // El legacy price en ARS es priceARS si existe, sino 0
      const legacyPrice = validated.priceARS ? Number(validated.priceARS) : 0;

      // Llamar a Server Action
      const result = await createCourse({
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
        available: validated.available,
        fakeEnrollments: validated.fakeEnrollments ? Number(validated.fakeEnrollments) : null,
        startDates: validated.startDates,
      });

      if (!result.success) {
        setError(result.error || 'Error al crear el curso.');
        setIsLoading(false);
      } else {
        router.push('/admin/courses');
        router.refresh();
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
      } else {
        setError('Ocurrió un error inesperado al intentar guardar el curso.');
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/admin/courses" className="text-teal-600 hover:text-teal-700 text-sm font-semibold flex items-center space-x-1">
          <span>← Volver a cursos</span>
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mt-3">Crear Nuevo Curso</h1>
        <p className="text-gray-500 mt-1">Ingresá los datos del nuevo programa educativo de psicotrading.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Título */}
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
              placeholder="Ej. Psicotrading Avanzado: Superando el FOMO"
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
            />
          </div>

          {/* Slug */}
          <div className="sm:col-span-2">
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
              placeholder="ej-psicotrading-avanzado-superando-el-fomo"
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

          {/* Orden en el campus */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="sortOrder">
              Orden en el campus
            </label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              value={formData.sortOrder}
              onChange={handleChange}
              placeholder="Ej: 1"
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Los cursos con número menor aparecen primero. Usá 0 para dejarlo sin prioridad manual.
            </p>
          </div>

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

          {/* Modalidad del Curso */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="type">
              Modalidad de Cursada
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

          {/* Fecha (Solo si es En Vivo) */}
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
                  onClick={() => setStartDates(prev => [...prev, { startDate: '', startTime: '', teacherName: '', isActive: true }])}
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
                          type="text"
                          placeholder="Ej. Jueves 15:00 a 17:00"
                          value={sd.startTime}
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

          {/* URL del video */}
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

          {/* Miniatura URL */}
          <div className="sm:col-span-2">
            <ImageUploader
              label="Miniatura del Curso (Opcional)"
              value={formData.thumbnail}
              onChange={(url) => setFormData((prev) => ({ ...prev, thumbnail: url }))}
            />
          </div>

          {/* Descripción corta */}
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
              placeholder="Un resumen de una línea sobre lo que se aprenderá."
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
            />
          </div>

          {/* Descripción larga */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="longDescription">
              Descripción Completa
            </label>
            <textarea
              id="longDescription"
              name="longDescription"
              required
              rows={6}
              value={formData.longDescription}
              onChange={handleChange}
              placeholder="Detallá los objetivos de aprendizaje, temarios y dinámicas del curso..."
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm resize-none"
            />
          </div>
        </div>

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
            {isLoading ? 'Guardando...' : 'Crear Curso'}
          </button>
        </div>
      </form>
    </div>
  );
}

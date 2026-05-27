'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createCourse } from '@/app/actions/courses';
import { z } from 'zod';

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

export default function NewCoursePage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    shortDescription: '',
    longDescription: '',
    price: '',
    type: 'RECORDED',
    videoUrl: '',
    scheduledAt: '',
    thumbnail: '',
  });

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      
      // Auto-generar slug a partir del título si el campo slug no se ha editado a mano
      if (name === 'title' && !prev.slug) {
        updated.slug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');
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
      // Validar datos localmente
      const validated = courseSchema.parse(formData);

      // Llamar a Server Action
      const result = await createCourse({
        title: validated.title,
        slug: validated.slug,
        shortDescription: validated.shortDescription,
        longDescription: validated.longDescription,
        price: Number(validated.price),
        type: validated.type,
        videoUrl: validated.videoUrl || null,
        scheduledAt: validated.scheduledAt || null,
        thumbnail: validated.thumbnail || null,
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
              placeholder="ej-psicotrading-avanzado-superando-el-fomo"
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
            />
          </div>

          {/* Precio */}
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
              placeholder="35000"
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
            />
          </div>

          {/* Modalidad */}
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

          {/* URL del video (Solo si es Grabado u opcional para retransmisión) */}
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
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="thumbnail">
              URL de la Miniatura (Imagen - Opcional)
            </label>
            <input
              id="thumbnail"
              name="thumbnail"
              type="url"
              value={formData.thumbnail}
              onChange={handleChange}
              placeholder="https://images.unsplash.com/photo-..."
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
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

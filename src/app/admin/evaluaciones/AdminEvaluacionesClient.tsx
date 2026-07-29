'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  adminSetQuizStatusAction,
  adminDuplicateQuizAction,
  adminDeleteQuizAction
} from '@/app/actions/evaluaciones';
import { QuizStatus } from '@prisma/client';
import { FiPlus, FiEdit, FiCopy, FiBarChart2, FiTrash2, FiEye, FiCheck, FiArchive } from 'react-icons/fi';
import ConfirmModal from '@/components/admin/ConfirmModal';

interface QuizItem {
  id: string;
  slug: string;
  title: string;
  status: QuizStatus;
  isPublic: boolean;
  publishedAt: Date | null;
  closedAt: Date | null;
  questionsCount: number;
  totalParticipants: number;
  averagePercentage: number;
  createdAt: Date;
}

interface AdminEvaluacionesClientProps {
  initialQuizzes: QuizItem[];
}

export default function AdminEvaluacionesClient({ initialQuizzes }: AdminEvaluacionesClientProps) {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState(initialQuizzes);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal confirm state
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    quizId: string | null;
    quizTitle: string;
  }>({
    isOpen: false,
    quizId: null,
    quizTitle: ''
  });

  const handleStatusChange = async (id: string, newStatus: QuizStatus) => {
    setLoadingId(id);
    setError(null);
    try {
      const res = await adminSetQuizStatusAction(id, newStatus);
      if (!res.success) throw new Error(res.error);

      setQuizzes(prev =>
        prev.map(q => (q.id === id ? { ...q, status: newStatus } : q))
      );
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar estado.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    setLoadingId(id);
    setError(null);
    try {
      const res = await adminDuplicateQuizAction(id);
      if (!res.success) throw new Error(res.error);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Error al duplicar.');
    } finally {
      setLoadingId(null);
    }
  };

  const openDeleteModal = (id: string, title: string) => {
    setDeleteModalState({
      isOpen: true,
      quizId: id,
      quizTitle: title
    });
  };

  const confirmDelete = async () => {
    const id = deleteModalState.quizId;
    if (!id) return;

    setLoadingId(id);
    setError(null);
    setDeleteModalState({ isOpen: false, quizId: null, quizTitle: '' });

    try {
      const res = await adminDeleteQuizAction(id);
      if (!res.success) throw new Error(res.error);
      setQuizzes(prev => prev.filter(q => q.id !== id));
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar.');
    } finally {
      setLoadingId(null);
    }
  };

  const getStatusBadge = (status: QuizStatus) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Publicada
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium border border-gray-200">
            Archivada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
            Borrador
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Módulo de Evaluaciones</h1>
          <p className="text-sm text-gray-500 mt-1">
            Administrá los cuestionarios, exámenes y tests interactivos de la plataforma.
          </p>
        </div>
        <Link
          href="/admin/evaluaciones/crear"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm rounded-xl shadow-sm transition-all duration-200"
        >
          <FiPlus className="w-4 h-4 stroke-[3]" />
          <span>Crear Evaluación</span>
        </Link>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Table section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50/80 text-gray-700 uppercase text-[11px] font-bold tracking-wider border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Título</th>
                <th className="px-6 py-4">Link Público</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Preguntas</th>
                <th className="px-6 py-4">Participantes</th>
                <th className="px-6 py-4">Promedio</th>
                <th className="px-6 py-4">Creación</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quizzes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                    No hay evaluaciones creadas. Creá la primera para comenzar.
                  </td>
                </tr>
              ) : (
                quizzes.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-900 max-w-xs truncate">
                      {q.title}
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={`/evaluacion/${q.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 hover:underline"
                      >
                        <span className="max-w-[150px] truncate">/evaluacion/{q.slug}</span>
                        <FiEye className="w-3.5 h-3.5 flex-shrink-0" />
                      </a>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(q.status)}</td>
                    <td className="px-6 py-4 font-medium text-gray-700">{q.questionsCount}</td>
                    <td className="px-6 py-4 font-medium text-gray-700">{q.totalParticipants}</td>
                    <td className="px-6 py-4 font-bold text-amber-600">
                      {q.totalParticipants > 0 ? `${q.averagePercentage}%` : '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {new Date(q.createdAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      {/* Stats */}
                      <Link
                        href={`/admin/evaluaciones/${q.id}/stats`}
                        title="Ver Estadísticas"
                        className="inline-flex p-2 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                      >
                        <FiBarChart2 className="w-4 h-4" />
                      </Link>

                      {/* Edit */}
                      <Link
                        href={`/admin/evaluaciones/${q.id}/edit`}
                        title="Editar"
                        className="inline-flex p-2 rounded-lg text-gray-500 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                      >
                        <FiEdit className="w-4 h-4" />
                      </Link>

                      {/* Duplicate */}
                      <button
                        onClick={() => handleDuplicate(q.id)}
                        disabled={loadingId === q.id}
                        title="Duplicar"
                        className="inline-flex p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        <FiCopy className="w-4 h-4" />
                      </button>

                      {/* Status Toggle */}
                      {q.status !== 'PUBLISHED' ? (
                        <button
                          onClick={() => handleStatusChange(q.id, 'PUBLISHED')}
                          disabled={loadingId === q.id}
                          title="Publicar"
                          className="inline-flex p-2 rounded-lg text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                        >
                          <FiCheck className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(q.id, 'ARCHIVED')}
                          disabled={loadingId === q.id}
                          title="Archivar"
                          className="inline-flex p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
                        >
                          <FiArchive className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => openDeleteModal(q.id, q.title)}
                        disabled={loadingId === q.id}
                        title="Eliminar"
                        className="inline-flex p-2 rounded-lg text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation modal */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        title="Eliminar Evaluación"
        message={`¿Estás seguro de que deseas eliminar la evaluación "${deleteModalState.quizTitle}"? Se eliminarán todas sus preguntas e intentos registrados.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModalState({ isOpen: false, quizId: null, quizTitle: '' })}
      />
    </div>
  );
}

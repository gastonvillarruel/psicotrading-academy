'use client';

import React, { useState } from 'react';
import { deleteCourse } from '@/app/actions/courses';
import ConfirmModal from '@/components/admin/ConfirmModal';

interface DeleteCourseButtonProps {
  courseId: string;
  courseTitle: string;
}

export default function DeleteCourseButton({ courseId, courseTitle }: DeleteCourseButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const result = await deleteCourse(courseId);
      if (!result.success) {
        setErrorMessage(result.error || 'Error al eliminar el curso.');
        setIsDeleting(false);
      } else {
        setIsModalOpen(false);
      }
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || 'Error inesperado al intentar borrar el curso.');
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        disabled={isDeleting}
        className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
      >
        {isDeleting ? 'Borrando...' : 'Eliminar'}
      </button>

      {isModalOpen && (
        <ConfirmModal
          isOpen={isModalOpen}
          title="Eliminar curso"
          message={
            errorMessage
              ? `${errorMessage}\n\n¿Deseás reintentar?`
              : `¿Estás seguro de que querés eliminar el curso "${courseTitle}"? Esta acción no se puede deshacer y borrará las compras y registros vinculados.`
          }
          confirmText={isDeleting ? 'Borrando...' : 'Eliminar curso'}
          cancelText="Cancelar"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            if (!isDeleting) {
              setIsModalOpen(false);
              setErrorMessage(null);
            }
          }}
        />
      )}
    </>
  );
}

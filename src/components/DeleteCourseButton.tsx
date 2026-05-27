'use client';

import React, { useState } from 'react';
import { deleteCourse } from '@/app/actions/courses';

interface DeleteCourseButtonProps {
  courseId: string;
  courseTitle: string;
}

export default function DeleteCourseButton({ courseId, courseTitle }: DeleteCourseButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    const confirmDelete = window.confirm(`¿Estás seguro de que querés eliminar el curso "${courseTitle}"? Esta acción no se puede deshacer y borrará las compras y registros vinculados.`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteCourse(courseId);
      if (!result.success) {
        alert(result.error || 'Error al eliminar el curso.');
        setIsDeleting(false);
      }
    } catch (error) {
      console.error(error);
      alert('Error inesperado al intentar borrar el curso.');
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
    >
      {isDeleting ? 'Borrando...' : 'Eliminar'}
    </button>
  );
}

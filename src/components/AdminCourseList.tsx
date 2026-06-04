'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CourseType } from '@prisma/client';
import { updateCoursesOrder } from '@/app/actions/courses';
import DeleteCourseButton from '@/components/DeleteCourseButton';
import { formatCoursePrice } from '@/lib/price';

// Define the type for courses matching the serialized values from prisma
interface SerializedCourse {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  price: number;
  priceARS: number | null;
  priceUSD: number | null;
  originalPriceARS: number | null;
  originalPriceUSD: number | null;
  paymentMode: string;
  durationInMonths: number | null;
  duration: string | null;
  sortOrder: number;
  type: CourseType;
  videoUrl: string | null;
  scheduledAt: Date | string | null;
  thumbnail: string | null;
  instructorName: string | null;
  instructorRole: string | null;
  instructorBio: string | null;
  available: boolean;
  fakeEnrollments: number | null;
  createdAt: Date | string;
  priceUSDT: number | null;
  originalPriceUSDT: number | null;
}

interface AdminCourseListProps {
  courses: SerializedCourse[];
}

export default function AdminCourseList({ courses }: AdminCourseListProps) {
  // Sort function according to: sortOrder > 0 (asc), then sortOrder = 0/null and createdAt desc
  const sortCourses = (list: SerializedCourse[]) => {
    return [...list].sort((a, b) => {
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;

      if (orderA > 0 && orderB > 0) {
        return orderA - orderB;
      }
      if (orderA > 0 && orderB <= 0) {
        return -1;
      }
      if (orderA <= 0 && orderB > 0) {
        return 1;
      }
      // Compare dates safely
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  };

  // Split and sort list initially
  const [liveCourses, setLiveCourses] = useState<SerializedCourse[]>(() =>
    sortCourses(courses.filter((c) => c.type === 'LIVE'))
  );
  const [recordedCourses, setRecordedCourses] = useState<SerializedCourse[]>(() =>
    sortCourses(courses.filter((c) => c.type === 'RECORDED'))
  );

  // Drag and Drop States
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<CourseType | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [originalList, setOriginalList] = useState<SerializedCourse[] | null>(null);

  // Saving states per group
  const [savingStatus, setSavingStatus] = useState<{
    [key in CourseType]?: 'idle' | 'saving' | 'saved' | 'error';
  }>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, id: string, type: CourseType) => {
    setDraggingId(id);
    setDraggingType(type);
    const list = type === 'LIVE' ? liveCourses : recordedCourses;
    setOriginalList(list);
    
    // Set a light drag image transparency if browser supports it
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string, type: CourseType) => {
    e.preventDefault();
    if (draggingId === null || draggingId === id || draggingType !== type) return;

    setDragOverId(id);

    const list = type === 'LIVE' ? liveCourses : recordedCourses;
    const setList = type === 'LIVE' ? setLiveCourses : setRecordedCourses;

    const dragIndex = list.findIndex((c) => c.id === draggingId);
    const hoverIndex = list.findIndex((c) => c.id === id);

    if (dragIndex !== -1 && hoverIndex !== -1) {
      const newList = [...list];
      const [draggedItem] = newList.splice(dragIndex, 1);
      newList.splice(hoverIndex, 0, draggedItem);
      setList(newList);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDragEnd = async () => {
    if (draggingId === null || draggingType === null) return;
    
    const type = draggingType;
    const currentList = type === 'LIVE' ? liveCourses : recordedCourses;

    setDraggingId(null);
    setDraggingType(null);
    setDragOverId(null);

    // Verify if order actually changed
    const orderChanged = originalList?.some((c, idx) => c.id !== currentList[idx].id);
    if (!orderChanged) {
      setOriginalList(null);
      return;
    }

    await persistOrder(type, currentList);
  };

  // Persists the order using the Server Action
  const persistOrder = async (type: CourseType, orderedList: SerializedCourse[]) => {
    setSavingStatus((prev) => ({ ...prev, [type]: 'saving' }));
    setErrorMessage(null);

    const orderedIds = orderedList.map((c) => c.id);
    try {
      const result = await updateCoursesOrder(type, orderedIds);
      if (result.success) {
        setSavingStatus((prev) => ({ ...prev, [type]: 'saved' }));
        setTimeout(() => {
          setSavingStatus((prev) => ({ ...prev, [type]: 'idle' }));
        }, 2000);
      } else {
        throw new Error(result.error || 'Error al persistir el orden.');
      }
    } catch (err: any) {
      setSavingStatus((prev) => ({ ...prev, [type]: 'error' }));
      setErrorMessage(err.message || 'Error inesperado al guardar el orden.');
      
      // Revert immediately to original list
      if (originalList) {
        if (type === 'LIVE') setLiveCourses(originalList);
        else setRecordedCourses(originalList);
      }
    }
    setOriginalList(null);
  };

  // Move course up or down manually (for mobile/responsive compatibility)
  const handleMoveCourse = async (type: CourseType, index: number, direction: 'up' | 'down') => {
    const list = type === 'LIVE' ? liveCourses : recordedCourses;
    const setList = type === 'LIVE' ? setLiveCourses : setRecordedCourses;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= list.length) return;

    const prevList = [...list];
    setOriginalList(prevList);

    const newList = [...list];
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;
    
    // Update local state first
    setList(newList);

    // Persist to server
    await persistOrder(type, newList);
  };

  // Render a specific table
  const renderTable = (title: string, type: CourseType, list: SerializedCourse[]) => {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        {/* Table Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Arrastrá las filas por el ícono o usá los botones para cambiar el orden de aparición.
            </p>
          </div>
          
          {/* Visual Save Feedback */}
          <div className="flex items-center">
            {savingStatus[type] === 'saving' && (
              <span className="text-xs text-amber-600 flex items-center space-x-1.5 animate-pulse font-medium bg-amber-50/70 border border-amber-100 px-3 py-1.5 rounded-xl">
                <svg className="animate-spin h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Guardando orden...</span>
              </span>
            )}
            {savingStatus[type] === 'saved' && (
              <span className="text-xs text-teal-600 flex items-center space-x-1 font-semibold bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-100 transition-all duration-300">
                <span>✓ Guardado con éxito</span>
              </span>
            )}
            {savingStatus[type] === 'error' && (
              <span className="text-xs text-red-600 flex items-center space-x-1 font-semibold bg-red-50 px-3 py-1.5 rounded-xl border border-red-100">
                <span>✗ Error al guardar</span>
              </span>
            )}
          </div>
        </div>

        {list.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            No hay cursos de esta modalidad.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4 w-12 text-center">Orden</th>
                  <th className="px-6 py-4">Miniatura</th>
                  <th className="px-6 py-4">Curso</th>
                  <th className="px-6 py-4">Precio</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {list.map((course, index) => {
                  const isDragging = draggingId === course.id;
                  const isOver = dragOverId === course.id;
                  
                  return (
                    <tr
                      key={course.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, course.id, type)}
                      onDragOver={(e) => handleDragOver(e, course.id, type)}
                      onDragLeave={handleDragLeave}
                      onDragEnd={handleDragEnd}
                      className={`transition-all duration-150 ${
                        isDragging ? 'opacity-30 bg-gray-50' : ''
                      } ${
                        isOver ? 'bg-teal-50/40 border-t-2 border-teal-400' : 'hover:bg-gray-50/30'
                      }`}
                    >
                      {/* Drag Handle & Mobile Reordering Controls */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          {/* Desktop Drag Handle */}
                          <div className="hidden sm:block cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded transition-colors" title="Arrastrar para ordenar">
                            <svg className="w-4.5 h-4.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M7 6a1 1 0 100-2 1 1 0 000 2zM7 11a1 1 0 100-2 1 1 0 000 2zM7 16a1 1 0 100-2 1 1 0 000 2zM13 6a1 1 0 100-2 1 1 0 000 2zM13 11a1 1 0 100-2 1 1 0 000 2zM13 16a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                          </div>
                          
                          {/* Mobile Up/Down Buttons */}
                          <div className="flex sm:hidden flex-col space-y-1">
                            <button
                              type="button"
                              onClick={() => handleMoveCourse(type, index, 'up')}
                              disabled={index === 0}
                              className="p-1 hover:bg-gray-150 rounded text-gray-500 disabled:opacity-30 transition-colors"
                              title="Subir"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveCourse(type, index, 'down')}
                              disabled={index === list.length - 1}
                              className="p-1 hover:bg-gray-150 rounded text-gray-500 disabled:opacity-30 transition-colors"
                              title="Bajar"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Course Thumbnail */}
                      <td className="px-6 py-4">
                        {course.thumbnail ? (
                          <img
                            src={course.thumbnail}
                            alt={course.title}
                            className="h-10 w-16 object-cover rounded-lg bg-gray-100 border border-gray-100 shadow-xs"
                          />
                        ) : (
                          <div className="h-10 w-16 bg-gray-100 rounded-lg border border-gray-100 flex items-center justify-center text-[10px] text-gray-400 font-medium">
                            Sin img
                          </div>
                        )}
                      </td>

                      {/* Course Info */}
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900 block line-clamp-1">{course.title}</span>
                        <span className="text-xs text-gray-400 block mt-0.5">/{course.slug}</span>
                      </td>

                      {/* Course Price */}
                      <td className="px-6 py-4 font-semibold text-teal-700">
                        {(() => {
                          const pricingARS = formatCoursePrice(course, 'ARS');
                          const pricingUSD = formatCoursePrice(course, 'USD');
                          
                          const hasARS = course.priceARS !== null || course.price > 0;
                          const hasUSD = course.priceUSD !== null;

                          const labels = [];
                          if (hasARS) labels.push(pricingARS.currentPriceLabel);
                          if (hasUSD) labels.push(pricingUSD.currentPriceLabel);
                          
                          return labels.length > 0 ? labels.join(' / ') : 'Gratis';
                        })()}
                      </td>

                      {/* Table Actions */}
                      <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                        <Link
                          href={`/admin/courses/${course.id}/edit`}
                          className="text-xs font-semibold text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100/80 px-3 py-1.5 rounded-lg transition-colors inline-block"
                        >
                          Editar
                        </Link>
                        <DeleteCourseButton courseId={course.id} courseTitle={course.title} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-start space-x-2 shadow-sm animate-shake">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div>
            <h4 className="font-bold">Error de guardado</h4>
            <p className="text-xs mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Render Tables */}
      {renderTable('Cursos y Talleres en Vivo', 'LIVE', liveCourses)}
      {renderTable('Cursos y Talleres Grabados', 'RECORDED', recordedCourses)}
    </div>
  );
}

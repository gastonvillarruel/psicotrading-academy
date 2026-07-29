'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminCreateQuizAction, adminUpdateQuizAction } from '@/app/actions/evaluaciones';
import { QuizStatus } from '@prisma/client';
import { FiSave, FiPlus, FiTrash2, FiCopy, FiChevronUp, FiChevronDown, FiCheckCircle, FiArrowLeft, FiAlertTriangle } from 'react-icons/fi';

export interface OptionState {
  id?: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionState {
  id?: string;
  text: string;
  explanation: string;
  explanationLink: string;
  explanationVideo: string;
  options: OptionState[];
}

export interface CustomLevelState {
  minPercentage: number;
  maxPercentage: number;
  title: string;
}

interface QuizFormEditorProps {
  initialQuiz?: {
    id?: string;
    title: string;
    slug: string;
    description?: string | null;
    coverImage?: string | null;
    status: QuizStatus;
    isPublic: boolean;
    publishedAt?: Date | string | null;
    closedAt?: Date | string | null;
    customLevels?: any;
    youtubeLiveUrl?: string | null;
    questions?: any[];
    attemptsCount?: number;
  };
}

export default function QuizFormEditor({ initialQuiz }: QuizFormEditorProps) {
  const router = useRouter();
  const isEditing = Boolean(initialQuiz?.id);
  const hasAttempts = Boolean(initialQuiz?.attemptsCount && initialQuiz.attemptsCount > 0);

  const [title, setTitle] = useState(initialQuiz?.title || '');
  const [slug, setSlug] = useState(initialQuiz?.slug || '');
  const [description, setDescription] = useState(initialQuiz?.description || '');
  const [coverImage, setCoverImage] = useState(initialQuiz?.coverImage || '');
  const [status, setStatus] = useState<QuizStatus>(initialQuiz?.status || 'DRAFT');
  const [isPublic, setIsPublic] = useState(initialQuiz?.isPublic ?? true);
  const [youtubeLiveUrl, setYoutubeLiveUrl] = useState(initialQuiz?.youtubeLiveUrl || '');

  // Formatted questions list
  const initialQuestionsList: QuestionState[] = initialQuiz?.questions?.map((qItem: any) => {
    const q = qItem.question;
    return {
      id: q.id,
      text: q.text,
      explanation: q.explanation || '',
      explanationLink: q.explanationLink || '',
      explanationVideo: q.explanationVideo || '',
      options: q.options.map((opt: any) => ({
        id: opt.id,
        text: opt.text,
        isCorrect: opt.isCorrect
      }))
    };
  }) || [
    {
      text: '',
      explanation: '',
      explanationLink: '',
      explanationVideo: '',
      options: [
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false }
      ]
    }
  ];

  const [questions, setQuestions] = useState<QuestionState[]>(initialQuestionsList);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto slug generator on title change if creating
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isEditing || !slug) {
      const generated = val.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setSlug(generated);
    }
  };

  // Question handlers
  const handleAddQuestion = () => {
    setQuestions(prev => [
      ...prev,
      {
        text: '',
        explanation: '',
        explanationLink: '',
        explanationVideo: '',
        options: [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false }
        ]
      }
    ]);
  };

  const handleDuplicateQuestion = (idx: number) => {
    const target = questions[idx];
    if (!target) return;
    const duplicated: QuestionState = {
      text: `${target.text} (Copia)`,
      explanation: target.explanation,
      explanationLink: target.explanationLink,
      explanationVideo: target.explanationVideo,
      options: target.options.map(opt => ({ text: opt.text, isCorrect: opt.isCorrect }))
    };

    setQuestions(prev => {
      const updated = [...prev];
      updated.splice(idx + 1, 0, duplicated);
      return updated;
    });
  };

  const handleDeleteQuestion = (idx: number) => {
    if (questions.length === 1) {
      alert('La evaluación debe contener al menos 1 pregunta.');
      return;
    }
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleMoveQuestion = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= questions.length) return;

    setQuestions(prev => {
      const updated = [...prev];
      const temp = updated[idx];
      updated[idx] = updated[targetIdx];
      updated[targetIdx] = temp;
      return updated;
    });
  };

  // Option handlers within a question
  const handleAddOption = (qIdx: number) => {
    setQuestions(prev => {
      const updated = [...prev];
      updated[qIdx].options.push({ text: '', isCorrect: false });
      return [...updated];
    });
  };

  const handleRemoveOption = (qIdx: number, oIdx: number) => {
    setQuestions(prev => {
      const updated = [...prev];
      if (updated[qIdx].options.length <= 2) {
        alert('Una pregunta debe tener al menos 2 opciones.');
        return prev;
      }
      updated[qIdx].options.splice(oIdx, 1);
      // Ensure at least one option is marked correct if we removed the correct one
      if (!updated[qIdx].options.some(o => o.isCorrect)) {
        updated[qIdx].options[0].isCorrect = true;
      }
      return [...updated];
    });
  };

  const handleSetCorrectOption = (qIdx: number, oIdx: number) => {
    setQuestions(prev => {
      const updated = [...prev];
      updated[qIdx].options = updated[qIdx].options.map((opt, i) => ({
        ...opt,
        isCorrect: i === oIdx
      }));
      return [...updated];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Por favor, ingresá un título.');
      return;
    }
    if (!slug.trim()) {
      setError('Por favor, ingresá un slug.');
      return;
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) {
        setError(`La pregunta ${i + 1} no puede estar vacía.`);
        return;
      }
      if (q.options.some(o => !o.text.trim())) {
        setError(`Todas las opciones de la pregunta ${i + 1} deben tener texto.`);
        return;
      }
      if (!q.options.some(o => o.isCorrect)) {
        setError(`La pregunta ${i + 1} debe tener una opción correcta seleccionada.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isEditing && initialQuiz?.id) {
        const res = await adminUpdateQuizAction(
          initialQuiz.id,
          {
            title,
            slug,
            description,
            coverImage,
            status,
            isPublic,
            youtubeLiveUrl
          },
          questions.map(q => ({
            id: q.id,
            text: q.text,
            explanation: q.explanation,
            explanationLink: q.explanationLink,
            explanationVideo: q.explanationVideo,
            options: q.options
          }))
        );
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await adminCreateQuizAction({
          title,
          slug,
          description,
          coverImage,
          status,
          isPublic,
          youtubeLiveUrl,
          questions: questions.map(q => ({
            text: q.text,
            explanation: q.explanation,
            explanationLink: q.explanationLink,
            explanationVideo: q.explanationVideo,
            options: q.options
          }))
        });
        if (!res.success) throw new Error(res.error);
      }

      router.push('/admin/evaluaciones');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Error al guardar la evaluación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto pb-16">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm sticky top-20 z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isEditing ? 'Editar Evaluación' : 'Nueva Evaluación'}
            </h1>
            <p className="text-xs text-gray-500">Configuración general y banco de preguntas</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm rounded-xl shadow-sm transition-all duration-200 cursor-pointer disabled:opacity-50"
        >
          <FiSave className="w-4 h-4 stroke-[2.5]" />
          <span>{isSubmitting ? 'Guardando...' : 'Guardar Evaluación'}</span>
        </button>
      </div>

      {hasAttempts && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-3">
          <FiAlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Aviso de Inmutabilidad:</span> Esta evaluación ya cuenta con participantes que han respondido. Al guardar cambios estructurales en las preguntas, el sistema creará automáticamente una nueva versión para no alterar los registros ni las estadísticas históricas.
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* General config section */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
        <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
          Configuración Principal
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-gray-700">Título de la Evaluación</label>
            <input
              type="text"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Ej: Quiz Live #45: Psicotrading y Gestión del Riesgo"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:border-amber-500 focus:outline-none"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-gray-700">Slug (URL amigable)</label>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="quiz-live-45"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono text-gray-700 focus:border-amber-500 focus:outline-none"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-gray-700">Descripción (Opcional)</label>
          <textarea
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Breve introducción para los estudiantes..."
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:border-amber-500 focus:outline-none resize-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-gray-700">Estado</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as QuizStatus)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:border-amber-500 focus:outline-none"
            >
              <option value="DRAFT">Borrador</option>
              <option value="PUBLISHED">Publicada</option>
              <option value="ARCHIVED">Archivada</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-gray-700">Imagen de Portada (URL)</label>
            <input
              type="text"
              value={coverImage}
              onChange={e => setCoverImage(e.target.value)}
              placeholder="https://..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-gray-700">Link de Live de YouTube (Opcional)</label>
            <input
              type="text"
              value={youtubeLiveUrl}
              onChange={e => setYoutubeLiveUrl(e.target.value)}
              placeholder="Ej: https://www.youtube.com/watch?v=..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-gray-700 block mb-2">Visibilidad</label>
            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={e => setIsPublic(e.target.checked)}
                className="w-4 h-4 text-amber-500 rounded focus:ring-amber-400"
              />
              <label htmlFor="isPublic" className="text-sm font-medium text-gray-700">
                Pública (Acceso sin estar inscripto en curso)
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Questions Manager section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            Preguntas de la Evaluación ({questions.length})
          </h2>
          <button
            type="button"
            onClick={handleAddQuestion}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <FiPlus className="w-4 h-4" />
            <span>Agregar Pregunta</span>
          </button>
        </div>

        <div className="space-y-6">
          {questions.map((q, qIdx) => (
            <div
              key={qIdx}
              className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5 relative"
            >
              {/* Question header bar */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">
                  Pregunta {qIdx + 1}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMoveQuestion(qIdx, 'up')}
                    disabled={qIdx === 0}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-30 cursor-pointer"
                    title="Subir"
                  >
                    <FiChevronUp className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveQuestion(qIdx, 'down')}
                    disabled={qIdx === questions.length - 1}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-30 cursor-pointer"
                    title="Bajar"
                  >
                    <FiChevronDown className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicateQuestion(qIdx)}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 cursor-pointer"
                    title="Duplicar pregunta"
                  >
                    <FiCopy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(qIdx)}
                    className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                    title="Eliminar pregunta"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Question statement */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-gray-700">Enunciado de la Pregunta</label>
                <input
                  type="text"
                  value={q.text}
                  onChange={e => {
                    const text = e.target.value;
                    setQuestions(prev => {
                      const updated = [...prev];
                      updated[qIdx].text = text;
                      return [...updated];
                    });
                  }}
                  placeholder="Ej: ¿Cuál es la regla principal del control emocional al entrar a un trade?"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              {/* Options list */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase text-gray-700">
                    Opciones de Respuesta (Marcar la opción correcta)
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAddOption(qIdx)}
                    className="text-xs font-bold text-amber-600 hover:text-amber-700 cursor-pointer"
                  >
                    + Agregar Opción
                  </button>
                </div>

                <div className="space-y-2">
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-3">
                      <input
                        type="radio"
                        name={`correct-option-${qIdx}`}
                        checked={opt.isCorrect}
                        onChange={() => handleSetCorrectOption(qIdx, oIdx)}
                        className="w-4 h-4 text-amber-500 focus:ring-amber-400 cursor-pointer"
                        title="Marcar como opción correcta"
                      />
                      <input
                        type="text"
                        value={opt.text}
                        onChange={e => {
                          const val = e.target.value;
                          setQuestions(prev => {
                            const updated = [...prev];
                            updated[qIdx].options[oIdx].text = val;
                            return [...updated];
                          });
                        }}
                        placeholder={`Opción ${oIdx + 1}`}
                        className={`flex-1 px-4 py-2 rounded-xl border text-sm font-medium focus:outline-none ${
                          opt.isCorrect
                            ? 'border-emerald-300 bg-emerald-50/50 text-emerald-950 font-semibold'
                            : 'border-gray-200 bg-white text-gray-800'
                        }`}
                        required
                      />
                      {q.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(qIdx, oIdx)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Explanation field */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold uppercase text-gray-700">Explicación (Opcional)</label>
                <textarea
                  rows={2}
                  value={q.explanation}
                  onChange={e => {
                    const val = e.target.value;
                    setQuestions(prev => {
                      const updated = [...prev];
                      updated[qIdx].explanation = val;
                      return [...updated];
                    });
                  }}
                  placeholder="Explicación detallada que se mostrará al finalizar la evaluación..."
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 text-xs font-medium focus:border-amber-500 focus:outline-none resize-none"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
}

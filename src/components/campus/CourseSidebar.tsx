'use client';

import React, { useState } from 'react';
import { LessonWithStatus, ModuleWithProgress } from '@/lib/campus/types';

interface CourseSidebarProps {
  modules: ModuleWithProgress[];
  activeLessonId: string | null;
  onSelectLesson: (lesson: LessonWithStatus) => void;
}

export default function CourseSidebar({
  modules,
  activeLessonId,
  onSelectLesson,
}: CourseSidebarProps) {
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    modules.forEach((mod) => {
      initial[mod.id] = mod.isUnlocked;
    });
    return initial;
  });

  const toggleModule = (moduleId: string, isUnlocked: boolean) => {
    if (!isUnlocked) return;
    setExpandedModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }));
  };

  return (
    <aside className="w-full lg:w-80 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden text-slate-700">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
          Temario del Programa
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {modules.map((mod, index) => {
          const isExpanded = expandedModules[mod.id];
          return (
            <div key={mod.id} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggleModule(mod.id, mod.isUnlocked)}
                className={`w-full text-left p-4 flex items-center justify-between transition-all outline-none ${
                  mod.isUnlocked
                    ? 'hover:bg-slate-50 cursor-pointer'
                    : 'opacity-60 cursor-not-allowed bg-slate-50/50'
                }`}
              >
                <div className="space-y-1 pr-2 max-w-[85%]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      Módulo {index + 1}
                    </span>
                    {!mod.isUnlocked && (
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m0-6v2m0-8H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-5" />
                      </svg>
                    )}
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                    {mod.title}
                  </h3>
                  {mod.isUnlocked && (
                    <span className="text-[10px] text-teal-600 block font-bold">
                      {mod.completedLessons}/{mod.totalLessons} completado ({mod.percent}%)
                    </span>
                  )}
                </div>

                {mod.isUnlocked && (
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {mod.isUnlocked && isExpanded && (
                <div className="bg-slate-50/50 divide-y divide-slate-100 py-1">
                  {mod.lessons.map((lesson) => {
                    const isActive = lesson.id === activeLessonId;
                    const isCompleted = lesson.status === 'completed';
                    const isLocked = lesson.status === 'locked';

                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => onSelectLesson(lesson)}
                        className={`w-full text-left px-5 py-3.5 flex items-start gap-3 transition-all ${
                          isActive
                            ? 'bg-teal-50/70 text-teal-800 border-l-4 border-teal-600'
                            : isLocked
                              ? 'opacity-50 cursor-pointer hover:bg-slate-100/40'
                              : 'hover:bg-slate-100/80 text-slate-700 cursor-pointer'
                        }`}
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {isCompleted ? (
                            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : isLocked ? (
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m0-6v2m0-8H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-5" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </div>

                        <div className="space-y-0.5 flex-grow pr-1">
                          <span className={`text-[10px] font-extrabold block ${
                            lesson.type === 'LIVE' ? 'text-amber-600' : 'text-slate-400'
                          }`}>
                            {lesson.type === 'LIVE' ? 'Clase En Vivo' : 'Video Lección'}
                          </span>
                          <h4 className={`text-xs font-bold leading-normal ${isActive ? 'text-teal-800' : 'text-slate-700'}`}>
                            {lesson.title}
                          </h4>
                          {lesson.durationMinutes && (
                            <span className="text-[10px] text-slate-400 block font-bold mt-0.5">
                              {lesson.durationMinutes} min
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

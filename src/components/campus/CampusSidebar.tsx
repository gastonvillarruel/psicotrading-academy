'use client';

import React from 'react';
import Link from 'next/link';

interface CampusSidebarProps {
  userName: string;
  userRole?: string;
  activeSlug: string;
  isOpen: boolean;
  onClose: () => void;
  welcomeText?: string | null;
}

export default function CampusSidebar({
  userName,
  userRole = 'Alumno activo',
  activeSlug,
  isOpen,
  onClose,
  welcomeText,
}: CampusSidebarProps) {
  // Iniciales del alumno
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  const menuItems = [
    { name: 'Inicio', href: '/mi-campus', icon: 'home', disabled: false },
    { name: 'Mis Cursos', href: '/mi-campus', icon: 'book', disabled: false },
    { name: 'Calendario', href: '#', icon: 'calendar', disabled: true },
    { name: 'Mis Recursos', href: '#', icon: 'folder', disabled: true },
    { name: 'Comunidad', href: '#', icon: 'users', disabled: true },
    { name: 'Tutorías', href: '#', icon: 'video', disabled: true },
    { name: 'Mi Progreso', href: '#', icon: 'chart', disabled: true },
    { name: 'Ajustes', href: '#', icon: 'cog', disabled: true },
  ];

  const renderIcon = (type: string) => {
    switch (type) {
      case 'home':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        );
      case 'book':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        );
      case 'calendar':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'folder':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        );
      case 'users':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        );
      case 'video':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      case 'chart':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        );
      case 'cog':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const content = (
    <div className="flex flex-col h-full bg-white border-r border-slate-100 shadow-sm w-72">
      {/* Perfil del Alumno */}
      <div className="p-6 border-b border-slate-50 flex flex-col items-center text-center">
        <div className="h-16 w-16 bg-gradient-to-tr from-orange-500 to-amber-500 text-white rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg shadow-orange-500/10 mb-4 tracking-wider">
          {initials}
        </div>
        <span className="text-[10px] text-orange-600 font-extrabold uppercase tracking-widest bg-orange-50 px-2.5 py-1 rounded-full mb-1">
          {welcomeText || userRole}
        </span>
        <h3 className="font-extrabold text-slate-800 text-sm line-clamp-1">
          {userName}
        </h3>
      </div>

      {/* Navegación del Campus */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <span className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-3">
          Navegación
        </span>
        {menuItems.map((item) => {
          // El ítem activo en esta pantalla siempre es "Mis Cursos"
          const isActive = item.name === 'Mis Cursos';

          if (item.disabled) {
            return (
              <div
                key={item.name}
                className="flex items-center gap-3 px-3 py-3 text-xs font-bold text-slate-400 rounded-xl cursor-not-allowed opacity-60"
                title={`${item.name} (Próximamente)`}
              >
                <div className="text-slate-400">{renderIcon(item.icon)}</div>
                <span>{item.name}</span>
                <span className="ml-auto text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wider scale-90">
                  Próximamente
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => onClose()}
              className={`flex items-center gap-3 px-3 py-3 text-xs font-bold rounded-xl transition-all ${
                isActive
                  ? 'bg-orange-50 text-orange-600 shadow-sm shadow-orange-500/5'
                  : 'text-slate-500 hover:text-orange-600 hover:bg-slate-50'
              }`}
            >
              <div className={isActive ? 'text-orange-600' : 'text-slate-400 group-hover:text-orange-600'}>
                {renderIcon(item.icon)}
              </div>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer del Sidebar */}
      <div className="p-4 border-t border-slate-50 text-center text-[10px] text-slate-400 font-semibold">
        PsicoEmoTrading Campus v1.0
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col h-screen sticky top-0 flex-shrink-0 z-10">
        {content}
      </aside>

      {/* Mobile drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={onClose}
          />
          {/* Menu Drawer */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white animate-slide-in">
            <div className="absolute top-4 right-4 z-50">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {content}
          </div>
        </div>
      )}
    </>
  );
}

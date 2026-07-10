'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { LuUsers, LuUserCheck, LuUserX, LuLayers } from 'react-icons/lu';

interface EnrollmentUser {
  id: string;
  name: string | null;
  email: string;
  emailVerified: string | null;
  lastLoginAt: string | null;
}

interface EnrollmentScheduleOption {
  id: string;
  name: string;
  description: string | null;
}

interface EnrollmentData {
  id: string;
  status: 'ACTIVE' | 'REVOKED' | string;
  createdAt: string;
  user: EnrollmentUser;
  scheduleOption: EnrollmentScheduleOption | null;
  origin: string;
  progressPercent: number;
}

interface CourseEnrollmentsListProps {
  enrollments: EnrollmentData[];
  scheduleOptions: {
    id: string;
    name: string;
    description: string | null;
  }[];
  stats: {
    total: number;
    active: number;
    revoked: number;
    commissionsCount: number;
  };
}

function formatRelativeDate(dateString: string | null) {
  if (!dateString) return 'Nunca';
  const date = new Date(dateString);
  const now = new Date();
  
  const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d2 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const diffTime = d1.getTime() - d2.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0 || diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
  }
  
  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export default function CourseEnrollmentsList({
  enrollments,
  scheduleOptions,
  stats,
}: CourseEnrollmentsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Toggles para acordeones de comisiones (por ID de comisión)
  const [expandedCommissions, setExpandedCommissions] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { _no_commission: true };
    scheduleOptions.forEach((opt) => {
      initial[opt.id] = true;
    });
    return initial;
  });

  const toggleCommission = (id: string) => {
    setExpandedCommissions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Filtrado local e instantáneo de alumnos
  const filteredEnrollments = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return enrollments;
    
    return enrollments.filter((e) => {
      const name = (e.user.name || '').toLowerCase();
      const email = e.user.email.toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [enrollments, searchQuery]);

  // Agrupamiento por comisiones sobre la lista filtrada
  const groupedData = useMemo(() => {
    const hasCommissions = scheduleOptions.length > 0;
    
    if (!hasCommissions) {
      return {
        hasCommissions: false,
        list: filteredEnrollments,
      };
    }

    const groupsMap: Record<string, EnrollmentData[]> = {};
    scheduleOptions.forEach((opt) => {
      groupsMap[opt.id] = [];
    });
    groupsMap['_no_commission'] = [];

    filteredEnrollments.forEach((e) => {
      if (e.scheduleOption && groupsMap[e.scheduleOption.id] !== undefined) {
        groupsMap[e.scheduleOption.id].push(e);
      } else {
        groupsMap['_no_commission'].push(e);
      }
    });

    return {
      hasCommissions: true,
      groups: scheduleOptions.map((opt) => ({
        id: opt.id,
        name: opt.name,
        description: opt.description,
        students: groupsMap[opt.id],
      })),
      noCommissionGroup: groupsMap['_no_commission'],
    };
  }, [filteredEnrollments, scheduleOptions]);

  // Copiar emails visibles y deduplicados
  const handleCopyEmails = () => {
    const emails = filteredEnrollments.map((e) => e.user.email.trim().toLowerCase());
    const uniqueEmails = Array.from(new Set(emails));
    
    if (uniqueEmails.length === 0) return;
    
    const emailListString = uniqueEmails.join('; ');
    navigator.clipboard.writeText(emailListString)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Error al copiar correos:', err);
      });
  };

  const getOriginBadgeColor = (origin: string) => {
    switch (origin) {
      case 'Mercado Pago':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'PayPal':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'NOWPayments':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'Gratuito / Cupón':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  // Renderizador de la tabla de estudiantes sin columna matrícula
  const renderTable = (students: EnrollmentData[]) => {
    if (students.length === 0) {
      return (
        <div className="p-4 text-center text-gray-400 bg-white">
          <p className="text-[11px] font-medium">Sin alumnos inscriptos</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-auto">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-2.5">Estudiante</th>
              <th className="px-4 py-2.5 whitespace-nowrap">Inscripción</th>
              <th className="px-4 py-2.5 whitespace-nowrap">Progreso</th>
              <th className="px-4 py-2.5 whitespace-nowrap">Último Acceso</th>
              <th className="px-4 py-2.5 whitespace-nowrap">Origen</th>
              <th className="px-4 py-2.5 whitespace-nowrap">Estado</th>
              <th className="px-4 py-2.5 text-center whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-xs">
            {students.map((e) => {
              return (
                <tr key={e.id} className="hover:bg-gray-50/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-semibold text-gray-900 block text-[13px] leading-tight">
                        {e.user.name || 'Sin nombre'}
                      </span>
                      {e.user.emailVerified ? (
                        <span className="inline-flex items-center justify-center text-[9px] font-bold text-teal-700 bg-teal-50 border border-teal-100 w-3.5 h-3.5 rounded-full" title="Email Verificado">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center text-[9px] font-bold text-gray-400 bg-gray-50 border border-gray-200 w-3.5 h-3.5 rounded-full" title="Email No Verificado">
                          !
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-500 block mt-0.5 leading-none">{e.user.email}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <div className="w-14 bg-gray-100 rounded-full h-1 overflow-hidden flex-shrink-0">
                        <div
                          className="bg-teal-500 h-1 rounded-full"
                          style={{ width: `${e.progressPercent}%` }}
                        />
                      </div>
                      <span className="font-semibold text-gray-700 text-[11px] min-w-[28px] text-right">{e.progressPercent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {formatRelativeDate(e.user.lastLoginAt)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center justify-center text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap h-5 ${getOriginBadgeColor(e.origin)}`}>
                      {e.origin}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {e.status === 'ACTIVE' ? (
                      <span className="inline-flex items-center justify-center text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-md h-5 whitespace-nowrap">
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center text-[10px] font-bold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-md h-5 whitespace-nowrap">
                        Revocado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center whitespace-nowrap">
                    <Link
                      href={`/admin/users?search=${encodeURIComponent(e.user.email)}`}
                      className="text-[11px] font-bold text-teal-600 hover:text-teal-700 transition-colors hover:underline"
                    >
                      Ver Perfil
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4 mt-4 border-t border-gray-100 pt-5">
      {/* Título de la sección */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Alumnos inscriptos</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Visualizá, filtrá y auditá todos los estudiantes matriculados en este curso.
        </p>
      </div>

      {/* Grid de KPIs superiores - Compacto */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white px-3 py-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-gray-50 text-gray-600 rounded-lg flex-shrink-0">
            <LuUsers size={15} />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block leading-none">
              Total Alumnos
            </span>
            <span className="text-lg font-extrabold text-gray-900 block mt-0.5 leading-none">
              {stats.total}
            </span>
          </div>
        </div>

        <div className="bg-white px-3 py-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-teal-50 text-teal-600 rounded-lg flex-shrink-0">
            <LuUserCheck size={15} />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block leading-none">
              Activos
            </span>
            <span className="text-lg font-extrabold text-teal-600 block mt-0.5 leading-none">
              {stats.active}
            </span>
          </div>
        </div>

        <div className="bg-white px-3 py-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-red-50 text-red-600 rounded-lg flex-shrink-0">
            <LuUserX size={15} />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block leading-none">
              Revocados
            </span>
            <span className="text-lg font-extrabold text-red-500 block mt-0.5 leading-none">
              {stats.revoked}
            </span>
          </div>
        </div>

        <div className="bg-white px-3 py-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg flex-shrink-0">
            <LuLayers size={15} />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block leading-none">
              Comisiones
            </span>
            <span className="text-lg font-extrabold text-gray-900 block mt-0.5 leading-none">
              {stats.commissionsCount}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar - Reducido espacio y alineación */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-gray-800 placeholder-gray-400 animate-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <button
          onClick={handleCopyEmails}
          disabled={filteredEnrollments.length === 0}
          className="w-full sm:w-auto px-3.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
        >
          <span>{copied ? '¡Copiado!' : 'Copiar emails'}</span>
          {!copied && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.2 rounded-md font-bold">
              {Array.from(new Set(filteredEnrollments.map(e => e.user.email))).length}
            </span>
          )}
        </button>
      </div>

      {/* Contenido / Tablas */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
        {/* Caso A: El curso NO tiene comisiones */}
        {!groupedData.hasCommissions && (
          filteredEnrollments.length === 0 ? (
            <div className="p-6 text-center text-gray-400 bg-white">
              <p className="text-xs">No se encontraron alumnos para la búsqueda.</p>
            </div>
          ) : (
            renderTable(filteredEnrollments)
          )
        )}

        {/* Caso B: El curso SI tiene comisiones */}
        {groupedData.hasCommissions && (
          <>
            {/* Lista de comisiones */}
            {(groupedData.groups || []).map((group) => {
              const isExpanded = !!expandedCommissions[group.id];
              return (
                <div key={group.id} className="flex flex-col">
                  {/* Cabecera compacta de la comisión en una sola línea */}
                  <button
                    onClick={() => toggleCommission(group.id)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors focus:outline-none"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 flex-grow">
                      <span className="font-semibold text-gray-900 text-sm truncate flex-shrink-0">
                        {group.name}
                      </span>
                      {group.description && (
                        <span className="text-[10px] text-gray-400 truncate hidden sm:inline-block max-w-[280px]">
                          — {group.description}
                        </span>
                      )}
                      <span className="inline-flex items-center justify-center text-[9px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.2 rounded-full flex-shrink-0 h-4.5 whitespace-nowrap">
                        {group.students.length} alumno{group.students.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-gray-400 text-[10px] flex-shrink-0 ml-4">
                      {isExpanded ? '▲ contraer' : '▼ expandir'}
                    </span>
                  </button>

                  {/* Cuerpo del acordeón */}
                  {isExpanded && (
                    <div className="border-t border-gray-50 bg-white">
                      {renderTable(group.students)}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Alumnos sin comisión (legacy) */}
            {groupedData.noCommissionGroup && groupedData.noCommissionGroup.length > 0 && (
              <div className="flex flex-col">
                <button
                  onClick={() => toggleCommission('_no_commission')}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors focus:outline-none bg-gray-50/10"
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-grow">
                    <span className="font-semibold text-gray-900 text-sm flex-shrink-0">
                      Matrículas Sin Comisión
                    </span>
                    <span className="text-[10px] text-gray-400 truncate hidden sm:inline-block">
                      — Legacy
                    </span>
                    <span className="inline-flex items-center justify-center text-[9px] font-bold text-gray-650 bg-gray-50 border border-gray-200 px-1.5 py-0.2 rounded-full flex-shrink-0 h-4.5 whitespace-nowrap">
                      {groupedData.noCommissionGroup.length} alumno{groupedData.noCommissionGroup.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-gray-400 text-[10px] flex-shrink-0 ml-4">
                    {expandedCommissions['_no_commission'] ? '▲ contraer' : '▼ expandir'}
                  </span>
                </button>

                {expandedCommissions['_no_commission'] && (
                  <div className="border-t border-gray-50 bg-white">
                    {renderTable(groupedData.noCommissionGroup)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

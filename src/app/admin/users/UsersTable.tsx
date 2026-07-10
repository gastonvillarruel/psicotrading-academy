'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { revokeEnrollmentAccess, restoreEnrollmentAccess } from '@/app/actions/admin-enrollments';
import ConfirmModal from '@/components/admin/ConfirmModal';

interface SerializedCourseAccess {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  enrollmentId: string | null;
  status: 'ACTIVE' | 'REVOKED';
  purchaseId: string | null;
  amount: number | null;
  currency: string | null;
  createdAt: string;
  type: 'ENROLLMENT' | 'PURCHASE_FALLBACK';
}

interface SerializedSubscription {
  id: string;
  status: string;
  plan: string;
  startedAt: string;
  expiresAt: string;
}

interface SerializedUser {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  emailVerified: string | null;
  courseAccesses: SerializedCourseAccess[];
  subscriptions: SerializedSubscription[];
}

interface UsersTableProps {
  users: SerializedUser[];
  now: number;
}

export default function UsersTable({ users, now }: UsersTableProps) {
  const [localUsers, setLocalUsers] = useState<SerializedUser[]>(users);
  const [searchQuery, setSearchQuery] = useState('');
  const searchParams = useSearchParams();

  useEffect(() => {
    const querySearch = searchParams?.get('search');
    if (querySearch) {
      setSearchQuery(querySearch);
    }
  }, [searchParams]);

  const [selectedUser, setSelectedUser] = useState<SerializedUser | null>(null);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'success' | 'info' | 'default';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    setLocalUsers(users);
  }, [users]);

  // Obtener la versión actualizada del usuario que está en el modal leyendo directamente de localUsers
  const activeUserInModal = useMemo(() => {
    if (!selectedUser) return null;
    return localUsers.find((u) => u.id === selectedUser.id) || null;
  }, [localUsers, selectedUser]);

  const executeRevokeAccess = async (access: SerializedCourseAccess) => {
    if (!activeUserInModal) return;
    setIsLoadingAction(true);
    try {
      const res = await revokeEnrollmentAccess({
        userId: activeUserInModal.id,
        courseId: access.courseId,
        purchaseId: access.purchaseId,
      });
      
      if (res.success) {
        setLocalUsers((prevUsers) =>
          prevUsers.map((u) => {
            if (u.id !== activeUserInModal.id) return u;
            return {
              ...u,
              courseAccesses: u.courseAccesses.map((a) => {
                if (a.courseId !== access.courseId) return a;
                return {
                  ...a,
                  status: 'REVOKED',
                  enrollmentId: res.enrollmentId || a.enrollmentId,
                };
              }),
            };
          })
        );
      } else {
        alert(res.error || 'Ocurrió un error al revocar el acceso.');
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión al servidor.');
    } finally {
      setIsLoadingAction(false);
    }
  };

  const executeRestoreAccess = async (access: SerializedCourseAccess) => {
    if (!activeUserInModal) return;
    setIsLoadingAction(true);
    try {
      const res = await restoreEnrollmentAccess({
        userId: activeUserInModal.id,
        courseId: access.courseId,
      });
      
      if (res.success) {
        setLocalUsers((prevUsers) =>
          prevUsers.map((u) => {
            if (u.id !== activeUserInModal.id) return u;
            return {
              ...u,
              courseAccesses: u.courseAccesses.map((a) => {
                if (a.courseId !== access.courseId) return a;
                return {
                  ...a,
                  status: 'ACTIVE',
                  enrollmentId: res.enrollmentId || a.enrollmentId,
                };
              }),
            };
          })
        );
      } else {
        alert(res.error || 'Ocurrió un error al restaurar el acceso.');
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión al servidor.');
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleRevokeAccess = (access: SerializedCourseAccess) => {
    if (!activeUserInModal) return;
    if (access.status === 'REVOKED') return;

    setConfirmModal({
      isOpen: true,
      title: 'Revocar acceso al curso',
      message: `¿Estás seguro de que querés revocar el acceso a este curso?\n\nEsta acción impedirá que el alumno acceda al contenido del curso.\n\nPodrá restaurarse únicamente como corrección administrativa.`,
      confirmText: 'Revocar',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        executeRevokeAccess(access);
      },
    });
  };

  const handleRestoreAccess = (access: SerializedCourseAccess) => {
    if (!activeUserInModal) return;
    if (access.status === 'ACTIVE') return;

    setConfirmModal({
      isOpen: true,
      title: 'Restaurar acceso al curso',
      message: `Esta acción debe utilizarse únicamente para corregir una revocación realizada por error.\n\nNo debe utilizarse para alumnos que recibieron un reembolso.\n\nCuando en el futuro un alumno vuelva a comprar un curso, el sistema creará una nueva matrícula en lugar de reutilizar la actual.\n\n¿Deseás continuar?`,
      confirmText: 'Restaurar',
      cancelText: 'Cancelar',
      variant: 'success',
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        executeRestoreAccess(access);
      },
    });
  };

  // Filtrado por buscador
  const filteredUsers = useMemo(() => {
    return localUsers.filter((user) => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      const name = (user.name || '').toLowerCase();
      const email = user.email.toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [localUsers, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Buscador de alumnos */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
        <div className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Buscar alumno por nombre o correo electrónico..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-gray-800 placeholder-gray-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabla de alumnos */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="text-sm font-semibold">No se encontraron alumnos con esa búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Estudiante</th>
                  <th className="px-6 py-4">Fecha de Registro</th>
                  <th className="px-6 py-4">Cursos Adquiridos</th>
                  <th className="px-6 py-4">Membresía</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {filteredUsers.map((user) => {
                  const latestSub = user.subscriptions[0];
                  const hasActiveSub = latestSub && latestSub.status === 'ACTIVE' && new Date(latestSub.expiresAt).getTime() > now;

                  const regularAccesses = user.courseAccesses.filter(
                    (a) => a.courseSlug !== 'suscripcion-mensual' && a.courseSlug !== 'suscripcion-anual'
                  );

                  return (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-gray-900 block">{user.name || 'Sin nombre'}</span>
                          {user.emailVerified ? (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded" title="Email Verificado">
                              ✓ Verificado
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded" title="Email No Verificado">
                              No Verificado
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 block mt-0.5">{user.email}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="font-semibold text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-xl inline-flex items-center space-x-1.5 transition-colors text-xs shadow-sm"
                        >
                          <span>{regularAccesses.length}</span>
                          <span className="text-gray-500 font-normal">
                            {regularAccesses.length === 1 ? 'curso' : 'cursos'}
                          </span>
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        {hasActiveSub ? (
                          <div>
                            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded-md">
                              Activa ({latestSub.plan === 'MONTHLY' ? 'Mensual' : 'Anual'})
                            </span>
                            <span className="text-[10px] text-gray-400 block mt-1">
                              Vence: {new Date(latestSub.expiresAt).toLocaleDateString('es-AR')}
                            </span>
                          </div>
                        ) : latestSub ? (
                          <div>
                            <span className="text-xs font-semibold text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                              Expirada ({latestSub.plan === 'MONTHLY' ? 'Mensual' : 'Anual'})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium">Sin suscripción</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="text-xs font-bold text-teal-600 hover:text-teal-700 transition-colors"
                        >
                          Ver Detalles
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Detalles del Alumno */}
      {activeUserInModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-xl overflow-hidden border border-gray-100 flex flex-col max-h-[85vh]">
            {/* Header del Modal */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Historial y Cursos de Alumno</h3>
                <p className="text-xs text-gray-400 mt-0.5">Información detallada sobre accesos adquiridos.</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="h-8 w-8 text-gray-400 hover:text-gray-600 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl flex items-center justify-center transition-colors focus:outline-none"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contenido del Modal */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Información Personal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50/50 p-4 rounded-2xl border border-gray-100/50">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">Nombre Completo</span>
                  <span className="font-semibold text-gray-800 text-sm">{activeUserInModal.name || 'Sin nombre asignado'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">Correo Electrónico</span>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="font-semibold text-gray-800 text-sm">{activeUserInModal.email}</span>
                    {activeUserInModal.emailVerified ? (
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                        ✓ Verificado
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
                        No Verificado
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">Fecha de Registro</span>
                  <span className="font-semibold text-gray-800 text-sm">
                    {new Date(activeUserInModal.createdAt).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">Estado de Suscripción</span>
                  <span className="block mt-1">
                    {(() => {
                      const latestSub = activeUserInModal.subscriptions[0];
                      const hasActiveSub = latestSub && latestSub.status === 'ACTIVE' && new Date(latestSub.expiresAt).getTime() > now;
                      if (hasActiveSub) {
                        return (
                          <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded-md">
                            Membresía Activa ({latestSub.plan === 'MONTHLY' ? 'Mensual' : 'Anual'})
                          </span>
                        );
                      }
                      if (latestSub) {
                        return (
                          <span className="text-xs font-semibold text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                            Membresía Expirada
                          </span>
                        );
                      }
                      return <span className="text-xs text-gray-400 font-medium">Sin suscripción</span>;
                    })()}
                  </span>
                </div>
              </div>

              {/* Banner de Acceso Total por Suscripción */}
              {(() => {
                const latestSub = activeUserInModal.subscriptions[0];
                const hasActiveSub = latestSub && latestSub.status === 'ACTIVE' && new Date(latestSub.expiresAt).getTime() > now;
                if (hasActiveSub) {
                  return (
                    <div className="bg-teal-50 border border-teal-100 p-4 rounded-2xl flex items-start space-x-3">
                      <div className="h-8 w-8 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center shrink-0">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-teal-800">Acceso Completo por Membresía</h4>
                        <p className="text-xs text-teal-600/90 mt-0.5">
                          Este alumno cuenta con una suscripción activa y tiene acceso garantizado a todos los cursos y talleres de la plataforma.
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Lista de Cursos Adquiridos */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Cursos Adquiridos Directamente</h4>
                {(() => {
                  const regularAccesses = activeUserInModal.courseAccesses.filter(
                    (a) => a.courseSlug !== 'suscripcion-mensual' && a.courseSlug !== 'suscripcion-anual'
                  );

                  if (regularAccesses.length === 0) {
                    return (
                      <p className="text-xs text-gray-500 py-4 text-center border border-dashed border-gray-200 rounded-2xl">
                        No posee compras directas de cursos.
                      </p>
                    );
                  }

                  return (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
                      {regularAccesses.map((access) => {
                        const formattedAmount = access.amount !== null
                          ? access.currency === 'ARS'
                            ? `$${Math.round(access.amount).toLocaleString('es-AR')} ARS`
                            : access.currency === 'USDT'
                              ? `${access.amount.toString()} USDT`
                              : `$${access.amount.toFixed(2)} USD`
                          : 'Asignación Directa';

                        const isActive = access.status === 'ACTIVE';

                        return (
                          <div key={access.courseId} className="p-4 flex items-center justify-between hover:bg-gray-50/30 transition-colors">
                            <div>
                              <span className="font-semibold text-gray-800 block text-sm">
                                {access.courseTitle}
                              </span>
                              <span className="text-[10px] text-gray-400 block mt-0.5">
                                Adquirido el {new Date(access.createdAt).toLocaleDateString('es-AR', {
                                  day: 'numeric',
                                  month: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <div className="flex items-center space-x-4">
                              <div className="text-right col-span-2">
                                <span className="font-bold text-gray-900 text-xs block">
                                  {formattedAmount}
                                </span>
                                {isActive ? (
                                  <span className="text-[10px] text-teal-700 font-semibold bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full inline-block mt-0.5">
                                    Matrícula Activa
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-red-700 font-semibold bg-red-50 border border-red-100 px-2 py-0.5 rounded-full inline-block mt-0.5">
                                    Acceso Revocado
                                  </span>
                                )}
                              </div>
                              {isActive ? (
                                <button
                                  onClick={() => handleRevokeAccess(access)}
                                  disabled={isLoadingAction}
                                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-red-50 hover:bg-red-100 border-red-200 text-red-700 disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                  Revocar Acceso
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleRestoreAccess(access)}
                                  disabled={isLoadingAction}
                                  title="Solo para correcciones administrativas."
                                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700 disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                  Restaurar Acceso (corrección)
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer del Modal */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-white hover:bg-gray-100 border border-gray-200 text-xs font-bold text-gray-600 rounded-xl transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación Reutilizable para Acciones Administrativas */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

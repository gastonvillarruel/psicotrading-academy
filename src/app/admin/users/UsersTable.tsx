'use client';

import React, { useState, useMemo } from 'react';

interface SerializedPurchase {
  id: string;
  amount: number;
  currency: string;
  createdAt: string;
  course: {
    title: string;
    slug: string;
  } | null;
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
  purchases: SerializedPurchase[];
  subscriptions: SerializedSubscription[];
}

interface UsersTableProps {
  users: SerializedUser[];
  now: number;
}

export default function UsersTable({ users, now }: UsersTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<SerializedUser | null>(null);

  // Filtrado por buscador
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      const name = (user.name || '').toLowerCase();
      const email = user.email.toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [users, searchQuery]);

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

                  const regularPurchases = user.purchases.filter(
                    (p) => p.course && p.course.slug !== 'suscripcion-mensual' && p.course.slug !== 'suscripcion-anual'
                  );

                  return (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900 block">{user.name || 'Sin nombre'}</span>
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
                          <span>{regularPurchases.length}</span>
                          <span className="text-gray-500 font-normal">
                            {regularPurchases.length === 1 ? 'curso' : 'cursos'}
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
      {selectedUser && (
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
                  <span className="font-semibold text-gray-800 text-sm">{selectedUser.name || 'Sin nombre asignado'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">Correo Electrónico</span>
                  <span className="font-semibold text-gray-800 text-sm">{selectedUser.email}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">Fecha de Registro</span>
                  <span className="font-semibold text-gray-800 text-sm">
                    {new Date(selectedUser.createdAt).toLocaleDateString('es-AR', {
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
                      const latestSub = selectedUser.subscriptions[0];
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
                const latestSub = selectedUser.subscriptions[0];
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
                  const regularPurchases = selectedUser.purchases.filter(
                    (p) => p.course && p.course.slug !== 'suscripcion-mensual' && p.course.slug !== 'suscripcion-anual'
                  );

                  if (regularPurchases.length === 0) {
                    return (
                      <p className="text-xs text-gray-500 py-4 text-center border border-dashed border-gray-200 rounded-2xl">
                        No posee compras directas de cursos.
                      </p>
                    );
                  }

                  return (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
                      {regularPurchases.map((purchase) => {
                        const formattedAmount = purchase.currency === 'ARS'
                          ? `$${Math.round(purchase.amount).toLocaleString('es-AR')} ARS`
                          : purchase.currency === 'USDT'
                            ? `${purchase.amount.toString()} USDT`
                            : `$${purchase.amount.toFixed(2)} USD`;

                        return (
                          <div key={purchase.id} className="p-4 flex items-center justify-between hover:bg-gray-50/30 transition-colors">
                            <div>
                              <span className="font-semibold text-gray-800 block text-sm">
                                {purchase.course?.title}
                              </span>
                              <span className="text-[10px] text-gray-400 block mt-0.5">
                                Adquirido el {new Date(purchase.createdAt).toLocaleDateString('es-AR', {
                                  day: 'numeric',
                                  month: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-gray-900 text-xs block">
                                {formattedAmount}
                              </span>
                              <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                                Aprobado
                              </span>
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
    </div>
  );
}

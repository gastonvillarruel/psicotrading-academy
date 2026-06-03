'use client';

import React, { useState, useMemo } from 'react';

interface SerializedPurchase {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  course: {
    id: string;
    title: string;
    slug: string;
  } | null;
  paymentMethod: string;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  checkoutUrl: string | null;
  providerStatus: string | null;
  status: string;
  createdAt: string;
}

interface PaymentsTableProps {
  initialPurchases: SerializedPurchase[];
}

export default function PaymentsTable({ initialPurchases }: PaymentsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');

  // Filtrado reactivo en cliente
  const filteredPurchases = useMemo(() => {
    return initialPurchases.filter((purchase) => {
      // 1. Filtro de búsqueda de texto
      const query = searchQuery.toLowerCase().trim();
      const userName = (purchase.user?.name || '').toLowerCase();
      const userEmail = (purchase.user?.email || '').toLowerCase();
      const courseTitle = (purchase.course?.title || '').toLowerCase();
      const providerId = (purchase.providerPaymentId || '').toLowerCase();
      const provStatus = (purchase.providerStatus || '').toLowerCase();

      const matchesSearch =
        query === '' ||
        userName.includes(query) ||
        userEmail.includes(query) ||
        courseTitle.includes(query) ||
        providerId.includes(query) ||
        provStatus.includes(query);

      // 2. Filtro de estado
      const matchesStatus =
        statusFilter === 'ALL' ||
        purchase.status.toUpperCase() === statusFilter;

      // 3. Filtro de método de pago
      const matchesMethod =
        methodFilter === 'ALL' ||
        purchase.paymentMethod.toUpperCase() === methodFilter;

      // 4. Filtro de moneda
      const matchesCurrency =
        currencyFilter === 'ALL' ||
        purchase.currency.toUpperCase() === currencyFilter;

      return matchesSearch && matchesStatus && matchesMethod && matchesCurrency;
    });
  }, [initialPurchases, searchQuery, statusFilter, methodFilter, currencyFilter]);

  // Lista única de estados y métodos para los dropdowns
  const availableStatuses = ['APPROVED', 'PENDING', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];
  const availableMethods = ['MERCADOPAGO', 'PAYPAY', 'NOWPAYMENTS']; // PayPal se guarda en BD según el proveedor de pago
  const availableCurrencies = ['ARS', 'USD', 'USDT'];

  return (
    <div className="space-y-6">
      {/* Controles de Búsqueda y Filtros */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Campo de búsqueda */}
          <div className="flex-1 relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Buscar por estudiante, email, concepto o ID de pago..."
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

          {/* Filtros rápidos */}
          <div className="flex flex-wrap gap-3">
            {/* Estado */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="APPROVED">Aprobados</option>
              <option value="PENDING">Pendientes</option>
              <option value="REFUNDED">Reembolsados</option>
              <option value="CANCELLED">Cancelados</option>
              <option value="FAILED">Fallidos/Rechazados</option>
              <option value="EXPIRED">Expirados</option>
            </select>

            {/* Método */}
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
            >
              <option value="ALL">Todos los Métodos</option>
              <option value="MERCADOPAGO">Mercado Pago</option>
              <option value="PAYPAL">PayPal</option>
              <option value="NOWPAYMENTS">NOWPayments</option>
            </select>

            {/* Moneda */}
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
            >
              <option value="ALL">Todas las Monedas</option>
              <option value="ARS">ARS ($)</option>
              <option value="USD">USD ($)</option>
              <option value="USDT">USDT (₮)</option>
            </select>

            {/* Limpiar filtros */}
            {(searchQuery || statusFilter !== 'ALL' || methodFilter !== 'ALL' || currencyFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setMethodFilter('ALL');
                  setCurrencyFilter('ALL');
                }}
                className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-xl text-xs font-bold transition-colors"
              >
                Limpiar Filtros
              </button>
            )}
          </div>
        </div>

        {/* Resumen de resultados */}
        <div className="text-xs text-gray-400 font-semibold">
          Mostrando {filteredPurchases.length} de {initialPurchases.length} registros
        </div>
      </div>

      {/* Tabla de Resultados */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filteredPurchases.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-semibold">No se encontraron pagos con los filtros aplicados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Estudiante</th>
                  <th className="px-6 py-4">Concepto</th>
                  <th className="px-6 py-4">Monto</th>
                  <th className="px-6 py-4">Método</th>
                  <th className="px-6 py-4">Estado Interno</th>
                  <th className="px-6 py-4">Estado Proveedor</th>
                  <th className="px-6 py-4">ID Proveedor</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {filteredPurchases.map((purchase) => {
                  let statusBadge = '';
                  let statusLabel = '';
                  switch (purchase.status) {
                    case 'approved':
                      statusBadge = 'bg-emerald-100 text-emerald-800';
                      statusLabel = 'Aprobado';
                      break;
                    case 'pending':
                      statusBadge = 'bg-amber-100 text-amber-800';
                      statusLabel = 'Pendiente';
                      break;
                    case 'rejected':
                    case 'failed':
                      statusBadge = 'bg-rose-100 text-rose-800';
                      statusLabel = 'Fallido';
                      break;
                    case 'cancelled':
                      statusBadge = 'bg-gray-100 text-gray-700';
                      statusLabel = 'Cancelado';
                      break;
                    case 'expired':
                      statusBadge = 'bg-purple-100 text-purple-800';
                      statusLabel = 'Expirado';
                      break;
                    case 'refunded':
                      statusBadge = 'bg-blue-100 text-blue-800';
                      statusLabel = 'Reembolsado';
                      break;
                    default:
                      statusBadge = 'bg-gray-100 text-gray-800';
                      statusLabel = purchase.status;
                      break;
                  }

                  const isSubscription = purchase.course && (purchase.course.slug === 'suscripcion-mensual' || purchase.course.slug === 'suscripcion-anual');
                  
                  const formattedAmount = purchase.currency === 'ARS'
                    ? `$${Math.round(purchase.amount).toLocaleString('es-AR')} ARS`
                    : purchase.currency === 'USDT'
                      ? `${purchase.amount.toString()} USDT`
                      : `$${purchase.amount.toFixed(2)} USD`;

                  return (
                    <tr key={purchase.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900 block">{purchase.user?.name || 'Sin nombre'}</span>
                        <span className="text-xs text-gray-400 block mt-0.5">{purchase.user?.email}</span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-800">
                        <span className="block line-clamp-1 max-w-[200px]">{purchase.course?.title || 'Curso desconocido'}</span>
                        {isSubscription && (
                          <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md inline-block mt-1">
                            Membresía
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        {formattedAmount}
                      </td>
                      <td className="px-6 py-4 uppercase font-semibold text-xs text-gray-500">
                        {purchase.paymentMethod}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full shadow-sm inline-block ${statusBadge}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600 italic">
                        {purchase.providerStatus || 'N/A'}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-400">
                        <span className="block truncate max-w-[120px]" title={purchase.providerPaymentId || ''}>
                          {purchase.providerPaymentId || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">
                        {new Date(purchase.createdAt).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {purchase.checkoutUrl ? (
                          <a
                            href={purchase.checkoutUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-teal-600 hover:text-teal-700 font-bold underline"
                          >
                            Ver Enlace
                          </a>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

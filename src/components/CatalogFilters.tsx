'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function CatalogFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Estados locales a partir de la URL actual
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [priceSort, setPriceSort] = useState(searchParams.get('priceSort') || '');

  // Aplicar filtros modificando los searchParams de la URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (type) params.set('type', type);
    if (priceSort) params.set('priceSort', priceSort);

    const queryStr = params.toString();
    router.push(queryStr ? `/campus?${queryStr}` : '/campus');
  }, [search, type, priceSort, router]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-10 flex flex-col md:flex-row md:items-center gap-4">
      {/* Búsqueda */}
      <div className="flex-grow">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Buscar curso
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Escribí el título del curso..."
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm"
        />
      </div>

      {/* Tipo */}
      <div className="w-full md:w-48">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Modalidad
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm bg-white"
        >
          <option value="">Todas</option>
          <option value="RECORDED">Grabado</option>
          <option value="LIVE">En Vivo</option>
        </select>
      </div>

      {/* Ordenar por precio */}
      <div className="w-full md:w-48">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Ordenar Precio
        </label>
        <select
          value={priceSort}
          onChange={(e) => setPriceSort(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none text-gray-900 text-sm bg-white"
        >
          <option value="">Por defecto</option>
          <option value="asc">Menor a Mayor</option>
          <option value="desc">Mayor a Menor</option>
        </select>
      </div>
    </div>
  );
}

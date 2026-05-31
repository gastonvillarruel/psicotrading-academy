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
    router.push(queryStr ? `/?${queryStr}` : '/');
  }, [search, type, priceSort, router]);

  return (
    <div className="bg-brand-card rounded-xl border border-brand-border/30 p-6 shadow-sm mb-10 flex flex-col md:flex-row md:items-center gap-6 transition-all duration-200">
      {/* Búsqueda */}
      <div className="flex-grow">
        <label className="block text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-2">
          Buscar entrenamiento
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Escribí el título del entrenamiento..."
          className="w-full px-4 py-2.5 border border-brand-border/60 bg-transparent rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm"
        />
      </div>

      {/* Tipo */}
      <div className="w-full md:w-48">
        <label className="block text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-2">
          Modalidad
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full px-4 py-2.5 border border-brand-border/60 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm bg-brand-card"
        >
          <option value="">Todas</option>
          <option value="RECORDED">Grabado</option>
          <option value="LIVE">En Vivo / Mentoría</option>
        </select>
      </div>

      {/* Ordenar por precio */}
      <div className="w-full md:w-48">
        <label className="block text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-2">
          Ordenar Precio
        </label>
        <select
          value={priceSort}
          onChange={(e) => setPriceSort(e.target.value)}
          className="w-full px-4 py-2.5 border border-brand-border/60 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all outline-none text-brand-text text-sm bg-brand-card"
        >
          <option value="">Por defecto</option>
          <option value="asc">Menor a Mayor</option>
          <option value="desc">Mayor a Menor</option>
        </select>
      </div>
    </div>
  );
}

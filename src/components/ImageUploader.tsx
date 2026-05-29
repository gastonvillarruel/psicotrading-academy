'use client';

import React, { useState, useRef } from 'react';
import * as FaIcons from 'react-icons/fa';

interface ImageUploaderProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
}

export default function ImageUploader({ value, onChange, label }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecciona un archivo de imagen válido.');
      return;
    }

    // Validar tamaño máximo (ej. 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen es demasiado grande. El límite es de 5MB.');
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al subir la imagen.');
      }

      if (data.success && data.url) {
        onChange(data.url);
      } else {
        throw new Error('No se recibió la URL de la imagen subida.');
      }
    } catch (err: any) {
      console.error('Error subiendo imagen:', err);
      setError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setIsUploading(false);
      // Resetear input file para permitir subir la misma imagen si se remueve
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    onChange('');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-semibold text-gray-700">
          {label}
        </label>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-4 p-4 border border-gray-200 rounded-xl bg-gray-50/50">
        {/* Previsualización */}
        <div className="relative h-24 w-32 rounded-lg overflow-hidden border border-gray-300 bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
          {value ? (
            <img
              src={value}
              alt="Previsualización"
              className="w-full h-full object-cover"
            />
          ) : (
            <FaIcons.FaImage className="text-gray-300 text-3xl" />
          )}

          {isUploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <FaIcons.FaSpinner className="text-white text-xl animate-spin" />
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex-grow space-y-2 text-center sm:text-left">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            disabled={isUploading}
            className="hidden"
          />

          <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
            <button
              type="button"
              onClick={triggerFileInput}
              disabled={isUploading}
              className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-400 text-gray-700 font-bold rounded-lg text-xs transition-colors flex items-center space-x-1 shadow-sm disabled:opacity-50"
            >
              <FaIcons.FaUpload />
              <span>{value ? 'Cambiar Imagen' : 'Subir Imagen'}</span>
            </button>

            {value && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={isUploading}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold rounded-lg text-xs transition-colors flex items-center space-x-1 shadow-sm disabled:opacity-50"
              >
                <FaIcons.FaTrash />
                <span>Eliminar</span>
              </button>
            )}
          </div>

          <p className="text-[10px] text-gray-400">
            Formatos soportados: JPG, PNG, GIF, WEBP. Tamaño máximo: 5MB.
          </p>

          {error && (
            <p className="text-xs text-red-600 font-semibold mt-1">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

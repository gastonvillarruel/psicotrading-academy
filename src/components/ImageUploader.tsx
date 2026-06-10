'use client';

import React, { useState, useRef } from 'react';
import * as FaIcons from 'react-icons/fa';

interface ImageUploaderProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  allowVideo?: boolean;
}

export default function ImageUploader({ value, onChange, label, allowVideo = false }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVideoUrl = (url: string) => {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    return cleanUrl.endsWith('.mp4') || 
           cleanUrl.endsWith('.webm') || 
           cleanUrl.endsWith('.ogg') || 
           cleanUrl.endsWith('.mov') || 
           cleanUrl.endsWith('.m4v') || 
           cleanUrl.endsWith('.avi');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // Validar tipo de archivo
    const isImage = file.type.startsWith('image/');
    const isVideo = allowVideo && file.type.startsWith('video/');
    
    if (!isImage && !isVideo) {
      setError(allowVideo ? 'Por favor, selecciona una imagen o video válido.' : 'Por favor, selecciona un archivo de imagen válido.');
      return;
    }

    // Validar tamaño máximo (5MB para imagen, 20MB para video)
    const maxSize = isVideo ? 20 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(isVideo ? 'El video es demasiado grande. El límite es de 20MB.' : 'La imagen es demasiado grande. El límite es de 5MB.');
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
        throw new Error(data.error || 'Error al subir el archivo.');
      }

      if (data.success && data.url) {
        onChange(data.url);
      } else {
        throw new Error('No se recibió la URL del archivo subido.');
      }
    } catch (err: any) {
      console.error('Error subiendo archivo:', err);
      setError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setIsUploading(false);
      // Resetear input file para permitir subir la misma imagen/video si se remueve
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (value) {
      setIsUploading(true);
      setError(null);
      try {
        const res = await fetch('/api/upload', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: value }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al eliminar el archivo físico.');
        }
      } catch (err: any) {
        console.error('Error eliminando archivo físico:', err);
        setError(err.message || 'Error al eliminar el archivo físico del servidor.');
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }
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
            isVideoUrl(value) ? (
              <video
                src={value}
                muted
                loop
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={value}
                alt="Previsualización"
                className="w-full h-full object-cover"
              />
            )
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
            accept={allowVideo ? 'image/*,video/*' : 'image/*'}
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
              <span>{value ? (isVideoUrl(value) ? 'Cambiar Video' : 'Cambiar Imagen') : (allowVideo ? 'Subir Imagen/Video' : 'Subir Imagen')}</span>
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
            {allowVideo
              ? 'Formatos soportados: JPG, PNG, GIF, WEBP, MP4, WEBM. Tamaño máx: Imagen 5MB / Video 20MB.'
              : 'Formatos soportados: JPG, PNG, GIF, WEBP. Tamaño máximo: 5MB.'}
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

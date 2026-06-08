import crypto from 'crypto';

const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID || '';
const TOKEN_KEY = process.env.BUNNY_STREAM_TOKEN_KEY || '';
const API_KEY = process.env.BUNNY_STREAM_API_KEY || ''; // AccessKey para la API de Bunny Stream

/**
 * Genera la URL firmada para incrustar el iframe de Bunny Stream.
 * URL: https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}
 * Retorna null si faltan las variables de entorno BUNNY_STREAM_LIBRARY_ID o BUNNY_STREAM_TOKEN_KEY.
 * @param videoId ID del video en Bunny Stream
 * @param expiresSeconds Duración de la validez de la firma en segundos (por defecto 3600 = 1 hora)
 */
export function generateBunnySignedUrl(videoId: string, expiresSeconds: number = 3600): string | null {
  if (!LIBRARY_ID || !TOKEN_KEY) {
    console.error(
      '❌ Error Bunny Stream: Falta configurar BUNNY_STREAM_LIBRARY_ID o BUNNY_STREAM_TOKEN_KEY. ' +
      'El video no se podr\u00e1 reproducir.'
    );
    return null;
  }

  const expires = Math.floor(Date.now() / 1000) + expiresSeconds;

  // F\u00f3rmula de Bunny.net: SHA256_HEX(token_key + video_id + expiration_timestamp)
  const input = `${TOKEN_KEY}${videoId}${expires}`;
  const token = crypto.createHash('sha256').update(input).digest('hex');

  return `https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${videoId}?token=${token}&expires=${expires}`;
}

/**
 * Obtiene la duración del video en segundos llamando a la API de Bunny Stream.
 * @param videoId ID del video
 */
export async function getBunnyVideoDuration(videoId: string): Promise<number | null> {
  if (!LIBRARY_ID || !API_KEY) {
    console.warn('⚠️ Advertencia: Falta configurar BUNNY_STREAM_LIBRARY_ID o BUNNY_STREAM_API_KEY en el entorno.');
    return null;
  }

  try {
    const url = `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${videoId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'AccessKey': API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Error al consultar la API de Bunny Stream: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    // La API de Bunny retorna el campo 'length' con la duración en segundos
    if (data && typeof data.length === 'number') {
      return data.length;
    }

    return null;
  } catch (error) {
    console.error('Error al obtener la duración del video desde Bunny Stream:', error);
    return null;
  }
}

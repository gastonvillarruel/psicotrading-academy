/**
 * Utilidades para Meta Pixel (Facebook Ads)
 * Respeta la privacidad y no envía datos personales (PII).
 */

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID || '';

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
  }
}

export function isMetaPixelAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

/**
 * Registra un evento estándar o personalizado en Meta Pixel.
 */
export function trackMetaEvent(
  eventName: string,
  parameters?: Record<string, any>,
  options?: { isCustom?: boolean }
) {
  if (typeof window === 'undefined') return;

  if (isMetaPixelAvailable()) {
    try {
      if (options?.isCustom) {
        window.fbq!('trackCustom', eventName, parameters);
      } else {
        window.fbq!('track', eventName, parameters);
      }
    } catch (e) {
      console.warn('[MetaPixel] Error tracking event:', e);
    }
  } else if (process.env.NODE_ENV === 'development') {
    console.info(`[MetaPixel Mock] Event: "${eventName}"`, parameters || {});
  }
}

/**
 * Evento cuando el usuario hace clic en el CTA de registro del taller.
 */
export function trackRegisterCtaClick(courseTitle: string, extra?: Record<string, any>) {
  trackMetaEvent('InitiateCheckout', {
    content_name: courseTitle,
    content_category: 'Workshop',
    ...extra,
  });
}

/**
 * Evento Lead: se dispara ÚNICAMENTE cuando el servidor confirma el registro/inscripción.
 */
export function trackWorkshopLead(courseTitle: string, extra?: Record<string, any>) {
  trackMetaEvent('Lead', {
    content_name: courseTitle,
    content_category: 'Workshop',
    currency: 'USD',
    value: 0,
    ...extra,
  });
}

/**
 * Evento personalizado cuando el usuario pulsa para unirse al grupo de WhatsApp.
 */
export function trackWhatsAppGroupClick(courseTitle: string, extra?: Record<string, any>) {
  trackMetaEvent(
    'WhatsAppGroupClick',
    {
      content_name: courseTitle,
      content_category: 'Workshop',
      action: 'click_join_whatsapp',
      ...extra,
    },
    { isCustom: true }
  );
}

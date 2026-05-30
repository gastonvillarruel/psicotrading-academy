export interface CourseWithPricing {
  price?: number; // compatibilidad
  priceARS?: number | null;
  priceUSD?: number | null;
  originalPriceARS?: number | null;
  originalPriceUSD?: number | null;
  paymentMode?: 'cash' | 'installments' | string | null;
  durationInMonths?: number | null;
}

/**
 * Obtiene las monedas en las que el curso tiene precio definido.
 */
export function getAvailableCurrencies(course: CourseWithPricing): ('ARS' | 'USD')[] {
  const currencies: ('ARS' | 'USD')[] = [];
  
  const hasARS = 
    (course.priceARS !== null && course.priceARS !== undefined) || 
    (typeof course.price === 'number' && course.price > 0);
    
  if (hasARS) {
    currencies.push('ARS');
  }
  
  const hasUSD = course.priceUSD !== null && course.priceUSD !== undefined;
  if (hasUSD) {
    currencies.push('USD');
  }
  
  return currencies;
}

/**
 * Obtiene la moneda por defecto del curso, priorizando ARS.
 */
export function getDefaultCurrency(course: CourseWithPricing): 'ARS' | 'USD' {
  const available = getAvailableCurrencies(course);
  if (available.includes('ARS')) {
    return 'ARS';
  }
  if (available.includes('USD')) {
    return 'USD';
  }
  return 'ARS';
}

/**
 * Formatea el precio de un curso (actual y original/anterior) en la moneda especificada.
 * Resuelve contado/cuotas, cantidad de cuotas, precios anteriores y fallbacks de compatibilidad.
 */
export function formatCoursePrice(course: CourseWithPricing, currency: 'ARS' | 'USD') {
  const available = getAvailableCurrencies(course);
  
  if (available.length === 0) {
    return {
      originalPriceLabel: '',
      currentPriceLabel: 'Gratis',
      hasOriginalPrice: false,
      priceValue: 0,
      isFree: true
    };
  }

  // Asegurar que usamos una moneda disponible. Si no, usar la por defecto.
  const effectiveCurrency = available.includes(currency) ? currency : getDefaultCurrency(course);

  const isInstallments = course.paymentMode === 'installments';
  const duration = course.durationInMonths || 0;

  let currentPrice: number | null = null;
  let originalPrice: number | null = null;

  if (effectiveCurrency === 'ARS') {
    currentPrice = course.priceARS ?? (typeof course.price === 'number' ? course.price : null);
    originalPrice = course.originalPriceARS ?? null;
  } else {
    currentPrice = course.priceUSD ?? null;
    originalPrice = course.originalPriceUSD ?? null;
  }

  if (currentPrice === null || currentPrice === undefined) {
    return {
      originalPriceLabel: '',
      currentPriceLabel: 'Gratis',
      hasOriginalPrice: false,
      priceValue: 0,
      isFree: true
    };
  }

  const formatVal = (val: number) => {
    if (effectiveCurrency === 'ARS') {
      return `$${Math.round(val).toLocaleString('es-AR')}`;
    } else {
      return `USD ${Math.round(val).toLocaleString('es-AR')}`;
    }
  };

  const currentPriceLabel = isInstallments && duration > 0
    ? `${duration} cuotas de ${formatVal(currentPrice)}`
    : formatVal(currentPrice);

  const hasOriginalPrice = typeof originalPrice === 'number' && originalPrice > currentPrice;
  const originalPriceLabel = hasOriginalPrice && originalPrice
    ? (isInstallments && duration > 0
        ? `${duration} cuotas de ${formatVal(originalPrice)}`
        : formatVal(originalPrice))
    : '';

  return {
    originalPriceLabel,
    currentPriceLabel,
    hasOriginalPrice,
    priceValue: currentPrice,
    isFree: currentPrice === 0
  };
}

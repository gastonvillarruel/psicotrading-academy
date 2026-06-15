import { CountryOption, getPreferredCurrencyForCountry } from '@/lib/countries';

export interface CourseWithPricing {
  price?: number; // compatibilidad
  priceARS?: number | null;
  priceUSD?: number | null;
  priceUSDT?: number | any | null;
  originalPriceARS?: number | null;
  originalPriceUSD?: number | null;
  originalPriceUSDT?: number | any | null;
  paymentMode?: 'cash' | 'installments' | string | null;
  durationInMonths?: number | null;
  fakeEnrollments?: number | null;
}

/**
 * Obtiene las monedas en las que el curso tiene precio definido (> 0).
 * Si el precio está en null o 0, se considera que el curso NO está disponible en esa moneda.
 */
export function getAvailableCurrencies(course: CourseWithPricing): ('ARS' | 'USD' | 'CRYPTO')[] {
  const currencies: ('ARS' | 'USD' | 'CRYPTO')[] = [];

  // ARS: sólo si priceARS existe y es mayor a 0. El campo legacy `price` ya no determina disponibilidad.
  const priceARSNum = course.priceARS !== null && course.priceARS !== undefined ? Number(course.priceARS) : 0;
  if (priceARSNum > 0) {
    currencies.push('ARS');
  }

  // USD: sólo si priceUSD existe y es mayor a 0.
  const priceUSDNum = course.priceUSD !== null && course.priceUSD !== undefined ? Number(course.priceUSD) : 0;
  if (priceUSDNum > 0) {
    currencies.push('USD');
  }

  // CRYPTO (USDT): sólo si priceUSDT existe y es mayor a 0.
  const priceUSDTNum = course.priceUSDT !== null && course.priceUSDT !== undefined ? Number(course.priceUSDT) : 0;
  if (priceUSDTNum > 0) {
    currencies.push('CRYPTO');
  }

  return currencies;
}

/**
 * Obtiene la moneda por defecto del curso, priorizando ARS.
 */
export function getDefaultCurrency(course: CourseWithPricing): 'ARS' | 'USD' | 'CRYPTO' {
  const available = getAvailableCurrencies(course);
  if (available.includes('ARS')) {
    return 'ARS';
  }
  if (available.includes('USD')) {
    return 'USD';
  }
  if (available.includes('CRYPTO')) {
    return 'CRYPTO';
  }
  return 'ARS';
}

export function resolveCourseDisplayCurrency(
  course: CourseWithPricing,
  country: CountryOption | string | null | undefined
): 'ARS' | 'USD' | 'CRYPTO' {
  const available = getAvailableCurrencies(course);
  if (available.length === 0) {
    return 'ARS';
  }

  const fiatCurrencies = available.filter((currency): currency is 'ARS' | 'USD' => currency === 'ARS' || currency === 'USD');
  if (fiatCurrencies.length === 0) {
    return available[0];
  }

  if (fiatCurrencies.length === 1) {
    return fiatCurrencies[0];
  }

  const preferredCurrency = getPreferredCurrencyForCountry(country);
  if (fiatCurrencies.includes(preferredCurrency)) {
    return preferredCurrency;
  }

  if (fiatCurrencies.includes('ARS')) {
    return 'ARS';
  }

  return 'USD';
}

export function formatCoursePrice(course: CourseWithPricing, currency: 'ARS' | 'USD' | 'CRYPTO') {
  const available = getAvailableCurrencies(course);
  
  if (available.length === 0) {
    return {
      originalPriceLabel: '',
      currentPriceLabel: 'Consultar precio',
      hasOriginalPrice: false,
      priceValue: 0,
      isFree: false
    };
  }

  // Determinar la moneda efectiva. Si la seleccionada no está disponible:
  // - Si es USD y hay ARS, usar ARS.
  // - Si no, "Consultar precio".
  let effectiveCurrency = currency;
  if (!available.includes(currency)) {
    if (currency === 'USD' && available.includes('ARS')) {
      effectiveCurrency = 'ARS';
    } else if (currency === 'CRYPTO' && available.includes('USD')) {
      effectiveCurrency = 'USD';
    } else if (available.includes('ARS')) {
      effectiveCurrency = 'ARS';
    } else {
      effectiveCurrency = available[0];
    }
  }

  const isInstallments = course.paymentMode === 'installments';
  const duration = course.durationInMonths || 0;

  let currentPrice: number | null = null;
  let originalPrice: number | null = null;

  if (effectiveCurrency === 'ARS') {
    currentPrice = course.priceARS ?? (typeof course.price === 'number' ? course.price : null);
    originalPrice = course.originalPriceARS ?? null;
  } else if (effectiveCurrency === 'CRYPTO') {
    currentPrice = course.priceUSDT ? Number(course.priceUSDT) : null;
    originalPrice = course.originalPriceUSDT ? Number(course.originalPriceUSDT) : null;
  } else {
    currentPrice = course.priceUSD ?? null;
    originalPrice = course.originalPriceUSD ?? null;
  }

  if (currentPrice === null || currentPrice === undefined) {
    return {
      originalPriceLabel: '',
      currentPriceLabel: 'Consultar precio',
      hasOriginalPrice: false,
      priceValue: 0,
      isFree: false
    };
  }

  const formatVal = (val: number) => {
    if (effectiveCurrency === 'ARS') {
      return `$${Math.round(val).toLocaleString('es-AR')} ARS`;
    } else if (effectiveCurrency === 'CRYPTO') {
      const formatted = Number.isInteger(val) ? String(val) : val.toFixed(2);
      return `${formatted} USDT`;
    } else {
      return `$${Math.round(val).toLocaleString('es-AR')} USD`;
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
    isFree: currentPrice === 0,
    currentPrice,
    originalPrice,
    effectiveCurrency,
    isInstallments,
    durationInMonths: duration
  };
}

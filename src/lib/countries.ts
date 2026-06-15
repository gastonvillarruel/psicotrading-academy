export type DisplayCurrency = 'ARS' | 'USD';
export type CountryRegion = 'America Latina' | 'Norteamerica' | 'Europa';

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  timezone: string;
  cityName: string;
  region: CountryRegion;
  preferredCurrency: DisplayCurrency;
  visible?: boolean;
}

export const COUNTRY_STORAGE_KEY = 'psicoemotrading-country';
export const DEFAULT_COUNTRY_CODE = 'AR';

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'AR', name: 'Argentina', flag: '\u{1F1E6}\u{1F1F7}', timezone: 'America/Argentina/Buenos_Aires', cityName: 'Buenos Aires', region: 'America Latina', preferredCurrency: 'ARS' },
  { code: 'BO', name: 'Bolivia', flag: '\u{1F1E7}\u{1F1F4}', timezone: 'America/La_Paz', cityName: 'La Paz', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'BR', name: 'Brasil', flag: '\u{1F1E7}\u{1F1F7}', timezone: 'America/Sao_Paulo', cityName: 'Sao Paulo', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'CL', name: 'Chile', flag: '\u{1F1E8}\u{1F1F1}', timezone: 'America/Santiago', cityName: 'Santiago', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'CO', name: 'Colombia', flag: '\u{1F1E8}\u{1F1F4}', timezone: 'America/Bogota', cityName: 'Bogota', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'CU', name: 'Cuba', flag: '\u{1F1E8}\u{1F1FA}', timezone: 'America/Havana', cityName: 'La Habana', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'CR', name: 'Costa Rica', flag: '\u{1F1E8}\u{1F1F7}', timezone: 'America/Costa_Rica', cityName: 'San Jose', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'DO', name: 'Republica Dominicana', flag: '\u{1F1E9}\u{1F1F4}', timezone: 'America/Santo_Domingo', cityName: 'Santo Domingo', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'EC', name: 'Ecuador', flag: '\u{1F1EA}\u{1F1E8}', timezone: 'America/Guayaquil', cityName: 'Guayaquil', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'SV', name: 'El Salvador', flag: '\u{1F1F8}\u{1F1FB}', timezone: 'America/El_Salvador', cityName: 'San Salvador', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'GT', name: 'Guatemala', flag: '\u{1F1EC}\u{1F1F9}', timezone: 'America/Guatemala', cityName: 'Ciudad de Guatemala', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'GY', name: 'Guyana', flag: '\u{1F1EC}\u{1F1FE}', timezone: 'America/Guyana', cityName: 'Georgetown', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'HN', name: 'Honduras', flag: '\u{1F1ED}\u{1F1F3}', timezone: 'America/Tegucigalpa', cityName: 'Tegucigalpa', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'MX', name: 'Mexico', flag: '\u{1F1F2}\u{1F1FD}', timezone: 'America/Mexico_City', cityName: 'CDMX', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'NI', name: 'Nicaragua', flag: '\u{1F1F3}\u{1F1EE}', timezone: 'America/Managua', cityName: 'Managua', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'PA', name: 'Panama', flag: '\u{1F1F5}\u{1F1E6}', timezone: 'America/Panama', cityName: 'Ciudad de Panama', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'PY', name: 'Paraguay', flag: '\u{1F1F5}\u{1F1FE}', timezone: 'America/Asuncion', cityName: 'Asuncion', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'PE', name: 'Peru', flag: '\u{1F1F5}\u{1F1EA}', timezone: 'America/Lima', cityName: 'Lima', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'PR', name: 'Puerto Rico', flag: '\u{1F1F5}\u{1F1F7}', timezone: 'America/Puerto_Rico', cityName: 'San Juan', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'SR', name: 'Surinam', flag: '\u{1F1F8}\u{1F1F7}', timezone: 'America/Paramaribo', cityName: 'Paramaribo', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'UY', name: 'Uruguay', flag: '\u{1F1FA}\u{1F1FE}', timezone: 'America/Montevideo', cityName: 'Montevideo', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'VE', name: 'Venezuela', flag: '\u{1F1FB}\u{1F1EA}', timezone: 'America/Caracas', cityName: 'Caracas', region: 'America Latina', preferredCurrency: 'USD' },
  { code: 'US', name: 'Estados Unidos', flag: '\u{1F1FA}\u{1F1F8}', timezone: 'America/New_York', cityName: 'New York', region: 'Norteamerica', preferredCurrency: 'USD' },
  { code: 'ES', name: 'Espana', flag: '\u{1F1EA}\u{1F1F8}', timezone: 'Europe/Madrid', cityName: 'Madrid', region: 'Europa', preferredCurrency: 'USD' },
  { code: 'GB', name: 'Reino Unido', flag: '\u{1F1EC}\u{1F1E7}', timezone: 'Europe/London', cityName: 'Londres', region: 'Europa', preferredCurrency: 'USD' },
  { code: 'US_EAST', name: 'Estados Unidos Este', flag: '\u{1F1FA}\u{1F1F8}', timezone: 'America/New_York', cityName: 'New York / Miami', region: 'Norteamerica', preferredCurrency: 'USD', visible: false },
  { code: 'US_WEST', name: 'Estados Unidos Oeste', flag: '\u{1F1FA}\u{1F1F8}', timezone: 'America/Los_Angeles', cityName: 'Los Angeles', region: 'Norteamerica', preferredCurrency: 'USD', visible: false },
  { code: 'EU_CENTRAL', name: 'Europa Central', flag: '\u{1F1EA}\u{1F1FA}', timezone: 'Europe/Paris', cityName: 'Paris / Berlin / Roma', region: 'Europa', preferredCurrency: 'USD', visible: false },
];

export const PUBLIC_COUNTRY_OPTIONS = COUNTRY_OPTIONS.filter((country) => country.visible !== false);

const DETECTION_FALLBACKS: Record<string, string> = {
  CA: 'US',
  DE: 'ES',
  FR: 'ES',
  IT: 'ES',
  PT: 'ES',
  BE: 'ES',
  NL: 'ES',
  CH: 'ES',
  AT: 'ES',
  IE: 'GB',
};

function normalizeCountryCode(code: string | null | undefined): string {
  return (code || '').trim().toUpperCase();
}

export function getDefaultCountry(): CountryOption {
  return COUNTRY_OPTIONS.find((country) => country.code === DEFAULT_COUNTRY_CODE) || COUNTRY_OPTIONS[0];
}

export function normalizeDetectedCountry(country: CountryOption | null): CountryOption | null {
  if (!country) return null;
  if (country.code === 'US_EAST' || country.code === 'US_WEST') {
    return findCountryByCode('US') || country;
  }
  if (country.code === 'EU_CENTRAL') {
    return findCountryByCode('ES') || country;
  }
  return country;
}

export function findCountryByCode(code: string | null | undefined, options?: { publicOnly?: boolean; normalizeDetected?: boolean }): CountryOption | null {
  const normalizedCode = normalizeCountryCode(code);
  if (!normalizedCode) return null;

  const source = options?.publicOnly ? PUBLIC_COUNTRY_OPTIONS : COUNTRY_OPTIONS;
  const directMatch = source.find((country) => country.code === normalizedCode) || COUNTRY_OPTIONS.find((country) => country.code === normalizedCode) || null;

  const fallbackCode = DETECTION_FALLBACKS[normalizedCode];
  const fallbackMatch = !directMatch && fallbackCode ? COUNTRY_OPTIONS.find((country) => country.code === fallbackCode) || null : null;

  const matched = directMatch || fallbackMatch;
  if (!matched) return null;

  const normalizedMatch = options?.normalizeDetected ? normalizeDetectedCountry(matched) : matched;
  if (!normalizedMatch) return null;

  if (options?.publicOnly && normalizedMatch.visible === false) {
    return normalizeDetectedCountry(normalizedMatch);
  }

  return normalizedMatch;
}

export function getPreferredCurrencyForCountry(country: CountryOption | string | null | undefined): DisplayCurrency {
  const resolvedCountry = typeof country === 'string'
    ? findCountryByCode(country, { normalizeDetected: true })
    : normalizeDetectedCountry(country || null);

  return resolvedCountry?.preferredCurrency || getDefaultCountry().preferredCurrency;
}

export function getPublicCountriesByRegion(region: CountryRegion): CountryOption[] {
  return PUBLIC_COUNTRY_OPTIONS.filter((country) => country.region === region);
}

function createArgentinaDateTimeUTC(dateInput: Date | string, hour: number, minute: number): Date {
  const baseDate = new Date(dateInput);
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth();
  const day = baseDate.getUTCDate();
  const utcTime = Date.UTC(year, month, day, hour + 3, minute);
  return new Date(utcTime);
}

export function formatCourseStartDate(startDate: Date | string | number): string {
  const date = new Date(startDate);
  if (isNaN(date.getTime())) return 'Fecha a confirmar';

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

export function shiftDateAndTimeIANA(
  startDateInput: Date | string,
  startTimeStr: string | null,
  targetTimezone: string
): { formattedDate: string; formattedTime: string | null; shiftedDateObj: Date } {
  const baseDate = new Date(startDateInput);
  if (!startTimeStr) {
    return {
      formattedDate: formatCourseStartDate(baseDate),
      formattedTime: null,
      shiftedDateObj: baseDate,
    };
  }

  const regex = /^(Lunes|Martes|Miercoles|Mi\u00e9rcoles|Jueves|Viernes|Sabado|S\u00e1bado|Domingo)?\s*(\d{1,2}):(\d{2})(?:\s*a\s*(\d{1,2}):(\d{2}))?\s*(.*)$/i;
  const match = startTimeStr.trim().match(regex);
  if (!match) {
    return {
      formattedDate: formatCourseStartDate(baseDate),
      formattedTime: startTimeStr,
      shiftedDateObj: baseDate,
    };
  }

  const startH = parseInt(match[2], 10);
  const startM = parseInt(match[3], 10);
  const hasEnd = match[4] !== undefined;
  const endH = hasEnd ? parseInt(match[4], 10) : 0;
  const endM = hasEnd ? parseInt(match[5], 10) : 0;
  const suffix = match[6] || '';

  const startTargetDateObj = createArgentinaDateTimeUTC(startDateInput, startH, startM);

  const startFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: targetTimezone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const formattedDateRaw = startFormatter.format(startTargetDateObj);
  const formattedDate = formattedDateRaw
    .split(' ')
    .map((word, idx) => (idx === 0 || idx === 3 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');

  const timeFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: targetTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const startHourVal = timeFormatter.format(startTargetDateObj);

  const weekdayFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: targetTimezone,
    weekday: 'long',
  });
  const rawWeekday = weekdayFormatter.format(startTargetDateObj);
  const weekdayVal = rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1);

  let endHourVal = '';
  if (hasEnd) {
    const endTargetDateObj = createArgentinaDateTimeUTC(startDateInput, endH, endM);
    endHourVal = timeFormatter.format(endTargetDateObj);
  }

  const formattedTime = hasEnd
    ? `${weekdayVal} de ${startHourVal} a ${endHourVal}${suffix ? ' ' + suffix : ''}`
    : `${weekdayVal} de ${startHourVal}${suffix ? ' ' + suffix : ''}`;

  return {
    formattedDate,
    formattedTime,
    shiftedDateObj: startTargetDateObj,
  };
}

export function findCountryByTimezone(targetTimezone: string, options?: { publicOnly?: boolean }): CountryOption | null {
  let matched = COUNTRY_OPTIONS.find((country) => country.timezone.toLowerCase() === targetTimezone.toLowerCase()) || null;
  if (matched) {
    return options?.publicOnly ? normalizeDetectedCountry(matched) : matched;
  }

  try {
    const now = new Date();
    const getOffset = (timezone: string) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'longOffset',
      }).formatToParts(now);
      const timezonePart = parts.find((part) => part.type === 'timeZoneName');
      return timezonePart ? timezonePart.value : '';
    };

    const targetOffset = getOffset(targetTimezone);
    if (targetOffset) {
      matched = COUNTRY_OPTIONS.find((country) => getOffset(country.timezone) === targetOffset) || null;
    }
  } catch (error) {
    console.error('Error calculando offsets de huso horario:', error);
  }

  if (!matched) return null;
  return options?.publicOnly ? normalizeDetectedCountry(matched) : matched;
}

export async function detectCountryFromClient(): Promise<CountryOption> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (response.ok) {
      const data = await response.json();
      const detected = findCountryByCode(data?.country_code, { normalizeDetected: true, publicOnly: true });
      if (detected) {
        return detected;
      }
    }
  } catch (error) {
    console.error('Error detectando pais por IP:', error);
  }

  try {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const detectedByTimezone = userTimezone ? findCountryByTimezone(userTimezone, { publicOnly: true }) : null;
    if (detectedByTimezone) {
      return detectedByTimezone;
    }
  } catch (error) {
    console.error('Error detectando pais por timezone:', error);
  }

  return getDefaultCountry();
}

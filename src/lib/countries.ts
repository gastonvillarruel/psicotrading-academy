export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  timezone: string;
  cityName: string;
  region: 'América Latina' | 'Norteamérica' | 'Europa';
  currencies: ('ARS' | 'USD' | 'CRYPTO')[];
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  // América Latina
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', timezone: 'America/Argentina/Buenos_Aires', cityName: 'Buenos Aires', region: 'América Latina', currencies: ['ARS', 'CRYPTO'] },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾', timezone: 'America/Montevideo', cityName: 'Montevideo', region: 'América Latina', currencies: ['USD', 'CRYPTO'] },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', timezone: 'America/Santiago', cityName: 'Santiago', region: 'América Latina', currencies: ['USD', 'CRYPTO'] },
  { code: 'BO', name: 'Bolivia', flag: '🇧🇴', timezone: 'America/La_Paz', cityName: 'La Paz', region: 'América Latina', currencies: ['USD', 'CRYPTO'] },
  { code: 'PY', name: 'Paraguay', flag: '🇵🇾', timezone: 'America/Asuncion', cityName: 'Asunción', region: 'América Latina', currencies: ['USD', 'CRYPTO'] },
  { code: 'PE', name: 'Perú', flag: '🇵🇪', timezone: 'America/Lima', cityName: 'Lima', region: 'América Latina', currencies: ['USD', 'CRYPTO'] },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', timezone: 'America/Bogota', cityName: 'Bogotá', region: 'América Latina', currencies: ['USD', 'CRYPTO'] },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨', timezone: 'America/Guayaquil', cityName: 'Guayaquil', region: 'América Latina', currencies: ['USD', 'CRYPTO'] },
  { code: 'MX', name: 'México', flag: '🇲🇽', timezone: 'America/Mexico_City', cityName: 'CDMX', region: 'América Latina', currencies: ['USD', 'CRYPTO'] },
  // Norteamérica
  { code: 'US_EAST', name: 'Estados Unidos Este', flag: '🇺🇸', timezone: 'America/New_York', cityName: 'New York / Miami', region: 'Norteamérica', currencies: ['USD', 'CRYPTO'] },
  { code: 'US_WEST', name: 'Estados Unidos Oeste', flag: '🇺🇸', timezone: 'America/Los_Angeles', cityName: 'Los Ángeles', region: 'Norteamérica', currencies: ['USD', 'CRYPTO'] },
  // Europa
  { code: 'ES', name: 'España', flag: '🇪🇸', timezone: 'Europe/Madrid', cityName: 'Madrid / Barcelona', region: 'Europa', currencies: ['USD', 'CRYPTO'] },
  { code: 'GB', name: 'Reino Unido', flag: '🇬🇧', timezone: 'Europe/London', cityName: 'Londres', region: 'Europa', currencies: ['USD', 'CRYPTO'] },
  { code: 'EU_CENTRAL', name: 'Alemania / Francia / Italia', flag: '🇪🇺', timezone: 'Europe/Paris', cityName: 'París / Berlín / Roma', region: 'Europa', currencies: ['USD', 'CRYPTO'] },
];

function createArgentinaDateTimeUTC(dateInput: Date | string, hour: number, minute: number): Date {
  const baseDate = new Date(dateInput);
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth(); // 0-indexed month
  const day = baseDate.getUTCDate();
  // Argentina is currently UTC-3, so to represent this time in UTC, we add 3 hours.
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
      shiftedDateObj: baseDate
    };
  }

  const regex = /^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)?\s*(\d{1,2}):(\d{2})(?:\s*a\s*(\d{1,2}):(\d{2}))?\s*(.*)$/i;
  const match = startTimeStr.trim().match(regex);
  if (!match) {
    return {
      formattedDate: formatCourseStartDate(baseDate),
      formattedTime: startTimeStr,
      shiftedDateObj: baseDate
    };
  }

  const startH = parseInt(match[2], 10);
  const startM = parseInt(match[3], 10);
  const hasEnd = match[4] !== undefined;
  const endH = hasEnd ? parseInt(match[4], 10) : 0;
  const endM = hasEnd ? parseInt(match[5], 10) : 0;
  const suffix = match[6] || '';

  // Create UTC Date representing start time in Argentina
  const startTargetDateObj = createArgentinaDateTimeUTC(startDateInput, startH, startM);

  // Format start time in target timezone
  const startFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: targetTimezone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const formattedDateRaw = startFormatter.format(startTargetDateObj);
  // Capitalize first letter of weekday and month
  const formattedDate = formattedDateRaw
    .split(' ')
    .map((word, idx) => (idx === 0 || idx === 3 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');

  const timeFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: targetTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const startHourVal = timeFormatter.format(startTargetDateObj);

  let weekdayVal = '';
  const weekdayFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: targetTimezone,
    weekday: 'long'
  });
  const rawWeekday = weekdayFormatter.format(startTargetDateObj);
  weekdayVal = rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1);

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
    shiftedDateObj: startTargetDateObj
  };
}

export function findCountryByTimezone(targetTimezone: string): CountryOption | null {
  // 1. Coincidencia exacta de nombre de zona horaria
  let matched = COUNTRY_OPTIONS.find(c => c.timezone.toLowerCase() === targetTimezone.toLowerCase());
  if (matched) return matched;

  // 2. Coincidencia por offset (GMT-3, GMT-5, etc.) en la fecha actual
  try {
    const now = new Date();
    const getOffset = (tz: string) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset'
      }).formatToParts(now);
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      return tzPart ? tzPart.value : '';
    };

    const targetOffset = getOffset(targetTimezone);
    if (targetOffset) {
      matched = COUNTRY_OPTIONS.find(c => getOffset(c.timezone) === targetOffset);
      if (matched) return matched;
    }
  } catch (e) {
    console.error('Error calculando offsets de huso horario:', e);
  }
  return null;
}

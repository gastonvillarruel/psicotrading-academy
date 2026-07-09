/**
 * Módulo central para el manejo de fechas y zonas horarias (Timezones) en el proyecto.
 * Proporciona utilidades para parsear, formatear y desplazar fechas entre UTC y husos horarios locales.
 */

/**
 * Convierte un string de fecha/hora local (ej: "2026-07-09T23:00" o "2026-07-09")
 * en una zona horaria IANA determinada a un objeto Date en UTC real.
 * 
 * Sigue la regla:
 * - Date-only (YYYY-MM-DD) -> Se trata como fecha de calendario pura, sin conversión de zona horaria (UTC medianoche).
 * - DateTime (YYYY-MM-DDTHH:mm) -> Se convierte al instante UTC correspondiente según la zona horaria.
 */
export function localToUTC(dateStr: string, timezone: string): Date {
  const cleanStr = dateStr.trim();
  
  // Condición Date-only (YYYY-MM-DD): Se trata como fecha pura de calendario
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
    return new Date(`${cleanStr}T00:00:00.000Z`);
  }

  // Si es solo hora (HH:mm), le añadimos una fecha base de época
  let parsedStr = cleanStr;
  if (/^\d{2}:\d{2}$/.test(cleanStr)) {
    parsedStr = `1970-01-01T${cleanStr}`;
  }

  const [datePart, timePart] = parsedStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  // Estimación inicial interpretando la hora local directamente en UTC
  let utcEstimate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Ajuste iterativo para calcular el offset exacto de la zona horaria en ese instante
  for (let i = 0; i < 3; i++) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(utcEstimate);
    const p: Record<string, number> = {};
    parts.forEach(({ type, value }) => {
      if (type !== 'literal') p[type] = Number(value);
    });

    const formattedHour = p.hour === 24 ? 0 : p.hour;
    const currentLocal = Date.UTC(p.year, p.month - 1, p.day, formattedHour, p.minute);
    const targetLocal = Date.UTC(year, month - 1, day, hour, minute);

    const diff = targetLocal - currentLocal;
    if (diff === 0) break;
    utcEstimate = new Date(utcEstimate.getTime() + diff);
  }

  return utcEstimate;
}

/**
 * Formatea una fecha (Date, string ISO o timestamp) en una zona horaria IANA específica.
 */
export function formatInTimezone(
  dateInput: Date | string | number,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
  locale: string = 'es-AR'
): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: timezone,
  }).format(date);
}

/**
 * Desplaza y formatea un inicio de clases/comisión desde su zona horaria de origen (sourceTimezone)
 * a la zona horaria del alumno (targetTimezone).
 * 
 * Si no se especifica hora (startTimeStr es nulo), se formatea usando UTC para evitar
 * el corrimiento de día (fecha de calendario pura).
 */
export function shiftDateAndTimeIANA(
  startDateInput: Date | string,
  startTimeStr: string | null,
  targetTimezone: string,
  sourceTimezone: string = 'America/Argentina/Buenos_Aires'
): { formattedDate: string; formattedTime: string | null; shiftedDateObj: Date } {
  const baseDate = new Date(startDateInput);

  const getLongFormattedDate = (dateObj: Date, tz: string) => {
    return formatInTimezone(dateObj, tz, {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    .split(' ')
    .map((word, idx) => (idx === 0 || idx === 3 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
  };

  // Condición Date-only (sin hora): Formatear en UTC puro para evitar corrimiento de días
  if (!startTimeStr) {
    return {
      formattedDate: getLongFormattedDate(baseDate, 'UTC'),
      formattedTime: null,
      shiftedDateObj: baseDate,
    };
  }

  const regex = /^(Lunes|Martes|Miercoles|Mi\u00e9rcoles|Jueves|Viernes|Sabado|S\u00e1bado|Domingo)?\s*(\d{1,2}):(\d{2})(?:\s*a\s*(\d{1,2}):(\d{2}))?\s*(.*)$/i;
  const match = startTimeStr.trim().match(regex);
  if (!match) {
    return {
      formattedDate: getLongFormattedDate(baseDate, 'UTC'),
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

  // Extraer componentes UTC para recrear el string local YYYY-MM-DD
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth() + 1;
  const day = baseDate.getUTCDate();
  
  const pad = (n: number) => String(n).padStart(2, '0');
  const startLocalStr = `${year}-${pad(month)}-${pad(day)}T${pad(startH)}:${pad(startM)}`;
  
  // Convertir la fecha y hora de la comisión local a su UTC real
  const startTargetDateObj = localToUTC(startLocalStr, sourceTimezone);
  const formattedDate = getLongFormattedDate(startTargetDateObj, targetTimezone);

  const startHourVal = formatInTimezone(startTargetDateObj, targetTimezone, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const rawWeekday = formatInTimezone(startTargetDateObj, targetTimezone, {
    weekday: 'long',
  });
  const weekdayVal = rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1);

  let endHourVal = '';
  if (hasEnd) {
    const endLocalStr = `${year}-${pad(month)}-${pad(day)}T${pad(endH)}:${pad(endM)}`;
    const endTargetDateObj = localToUTC(endLocalStr, sourceTimezone);
    endHourVal = formatInTimezone(endTargetDateObj, targetTimezone, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
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

/**
 * Convierte un instante UTC (Date, string ISO o timestamp) a un string local format YYYY-MM-DDTHH:mm
 * en una zona horaria determinada para ser usado por inputs datetime-local de HTML.
 */
export function utcToLocalString(dateInput: Date | string | number, timezone: string): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  
  const year = formatInTimezone(date, timezone, { year: 'numeric' });
  const month = formatInTimezone(date, timezone, { month: '2-digit' });
  const day = formatInTimezone(date, timezone, { day: '2-digit' });
  const hour = formatInTimezone(date, timezone, { hour: '2-digit', hour12: false });
  const minute = formatInTimezone(date, timezone, { minute: '2-digit' });
  
  // Si hour es "24", reemplazar con "00"
  const cleanHour = hour === '24' ? '00' : hour;

  return `${year}-${month}-${day}T${cleanHour}:${minute}`;
}


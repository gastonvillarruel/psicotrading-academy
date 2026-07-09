export interface CourseStartDate {
  id: string;
  courseId: string;
  startDate: Date | string;
  startTime: string | null;
  teacherName: string | null;
  isActive: boolean;
  scheduleOptionId?: string | null;
  scheduleOption?: { isActive: boolean; timezone?: string | null; name?: string } | null;
}

export interface CourseWithStartDates {
  scheduledAt?: Date | string | null;
  startDates?: CourseStartDate[];
}

/**
 * Retorna la lista ordenada cronológicamente de fechas activas.
 * Si no hay fechas dinámicas pero el curso tiene el campo legacy `scheduledAt`,
 * retorna esa única fecha como fallback.
 */
export function getAvailableStartDates(course: CourseWithStartDates): CourseStartDate[] {
  if (course.startDates && course.startDates.length > 0) {
    const activeDates = course.startDates.filter((d) => d.isActive !== false);
    if (activeDates.length > 0) {
      return [...activeDates].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
    }
  }

  if (course.scheduledAt) {
    return [
      {
        id: 'legacy-default',
        courseId: '',
        startDate: course.scheduledAt,
        startTime: null,
        teacherName: null,
        isActive: true,
      },
    ];
  }

  return [];
}

/**
 * Retorna todas las fechas de inicio cargadas, incluyendo las inactivas.
 */
export function getAllStartDates(course: CourseWithStartDates): CourseStartDate[] {
  if (course.startDates && course.startDates.length > 0) {
    return [...course.startDates].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
  }

  if (course.scheduledAt) {
    return [
      {
        id: 'legacy-default',
        courseId: '',
        startDate: course.scheduledAt,
        startTime: null,
        teacherName: null,
        isActive: true,
      },
    ];
  }

  return [];
}

/**
 * Determina si una comisión/fecha de inicio está activa y disponible.
 * No disponible si está inactiva en sí misma, o si su comisión (scheduleOption) asociada está inactiva.
 */
export function isScheduleOptionAvailable(option: CourseStartDate): boolean {
  if (option.isActive === false) return false;
  if (option.scheduleOption && option.scheduleOption.isActive === false) return false;

  return true;
}

/**
 * Retorna la etiqueta correspondiente si la opción no está disponible.
 */
export function getScheduleOptionStatusLabel(option: CourseStartDate): string {
  if (option.isActive === false || (option.scheduleOption && option.scheduleOption.isActive === false)) {
    return 'Cupos completos';
  }

  return '';
}

/**
 * Retorna la primera fecha disponible o null.
 */
export function getDefaultStartDate(course: CourseWithStartDates): CourseStartDate | null {
  const dates = getAvailableStartDates(course);
  return dates.length > 0 ? dates[0] : null;
}

/**
 * Formatea la fecha a formato DD/MM/YYYY usando UTC para consistencia SSR.
 */
export function formatCourseStartDate(startDate: Date | string | number): string {
  const date = new Date(startDate);
  if (isNaN(date.getTime())) return 'Fecha a confirmar';
  
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Normaliza visualmente el horario.
 * Si recibe "18:00", devuelve "18:00".
 * Si recibe "Lunes de 18:00", devuelve "18:00".
 * Si recibe "Jueves 20:30 hs", devuelve "20:30".
 * Si no hay horario o no se encuentra una hora válida, devuelve "".
 */
export function normalizeTimeLabel(value: string | null | undefined): string {
  if (!value) return '';
  
  // Buscar un patrón de hora tipo HH:mm (ej. 18:00, 20:30, 9:15)
  const timeRegex = /(\d{1,2}):(\d{2})/;
  const match = value.match(timeRegex);
  if (match) {
    const hours = match[1].padStart(2, '0');
    const minutes = match[2];
    return `${hours}:${minutes}`;
  }
  
  return '';
}



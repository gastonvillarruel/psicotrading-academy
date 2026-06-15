export interface CourseStartDate {
  id: string;
  courseId: string;
  startDate: Date | string;
  startTime: string | null;
  teacherName: string | null;
  isActive: boolean;
  scheduleOptionId?: string | null;
  scheduleOption?: { isActive: boolean } | null;
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

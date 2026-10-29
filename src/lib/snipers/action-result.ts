import { SnipersError, type SnipersErrorCode } from './errors';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: SnipersErrorCode | 'UNAVAILABLE'; message: string };
const messages: Record<SnipersErrorCode, string> = {
  DISABLED: 'Grupo de Snipers no está disponible.', CONFIGURATION: 'Grupo de Snipers no está disponible.', SESSION: 'Tu sesión ya no es válida. Volvé a ingresar.',
  FORBIDDEN: 'No tenés permiso para esta operación.', VALIDATION: 'Revisá los datos ingresados, sus límites y los motivos requeridos.',
  NOT_FOUND: 'El registro no existe.', STALE: 'Las condiciones cambiaron. Recargá y revisá nuevamente.',
  OVERLAP: 'Las fechas se superponen con una cobertura existente.', DUPLICATE_REFERENCE: 'El comprobante ya tiene un pago registrado.',
  IDEMPOTENCY_CONFLICT: 'Esta operación no coincide con el intento original. Consultá el historial.',
  INVALID_STATE: 'El estado actual no permite la operación. Revisá el plan, la reapertura o el reemplazo seleccionado.',
  INTEGRITY: 'No se pudo completar la operación.', CONCURRENT: 'Hay una operación concurrente. Reintentá el mismo envío.',
};
export async function respond<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await body() }; }
  catch (error) {
    if (error instanceof SnipersError) return { ok: false, code: error.code, message: messages[error.code] };
    // Known permission-service business errors; never serialize arbitrary database/auth errors.
    if (error instanceof Error && error.message === 'No se puede revocar al último administrador de Snipers.') {
      return { ok: false, code: 'INVALID_STATE', message: error.message };
    }
    console.error('Snipers: operación no disponible.');
    return { ok: false, code: 'UNAVAILABLE', message: 'No se pudo confirmar el resultado. Conservá el intento y consultá su estado.' };
  }
}

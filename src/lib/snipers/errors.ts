export type SnipersErrorCode = 'DISABLED' | 'CONFIGURATION' | 'SESSION' | 'FORBIDDEN' |
  'VALIDATION' | 'NOT_FOUND' | 'STALE' | 'OVERLAP' | 'DUPLICATE_REFERENCE' | 'DUPLICATE_SLUG' |
  'IDEMPOTENCY_CONFLICT' | 'INVALID_STATE' | 'INTEGRITY' | 'CONCURRENT';

export class SnipersError extends Error {
  constructor(public readonly code: SnipersErrorCode, message: string) {
    super(message);
    this.name = 'SnipersError';
  }
}

export function reject(code: SnipersErrorCode, message: string): never {
  throw new SnipersError(code, message);
}

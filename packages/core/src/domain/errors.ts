export class CoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = 'CoreError'
  }
}

export function toCoreError(error: unknown): CoreError {
  if (error instanceof CoreError) return error
  return new CoreError('internal_error', error instanceof Error ? error.message : String(error))
}

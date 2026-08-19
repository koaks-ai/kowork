export const CLIENT_SETTINGS_ERROR_CODES = [
  'CLIENT_SETTINGS_INVALID',
  'CLIENT_SETTINGS_IO',
  'BACKGROUND_INVALID',
  'BACKGROUND_UNAVAILABLE'
] as const

export type ClientSettingsErrorCode = (typeof CLIENT_SETTINGS_ERROR_CODES)[number]

export interface ClientSettingsErrorDto {
  code: ClientSettingsErrorCode
  message: string
  path?: string
  issues?: ReadonlyArray<{ path: string; message: string }>
}

export class ClientSettingsError extends Error {
  readonly code: ClientSettingsErrorCode
  readonly path?: string
  readonly issues?: ClientSettingsErrorDto['issues']

  constructor(error: ClientSettingsErrorDto, options?: ErrorOptions) {
    super(error.message, options)
    this.name = 'ClientSettingsError'
    this.code = error.code
    this.path = error.path
    this.issues = error.issues
  }

  toDto(): ClientSettingsErrorDto {
    return {
      code: this.code,
      message: this.message,
      ...(this.path ? { path: this.path } : {}),
      ...(this.issues ? { issues: this.issues } : {})
    }
  }
}

export class ClientSettingsParseError extends ClientSettingsError {
  constructor(issues: ClientSettingsErrorDto['issues']) {
    const path = issues?.[0]?.path
    super({
      code: 'CLIENT_SETTINGS_INVALID',
      message: path ? `客户端设置在 ${path} 处无效` : '客户端设置格式无效',
      ...(path ? { path } : {}),
      ...(issues ? { issues } : {})
    })
    this.name = 'ClientSettingsParseError'
  }
}

export function toClientSettingsErrorDto(error: unknown): ClientSettingsErrorDto {
  if (error instanceof ClientSettingsError) return error.toDto()
  return {
    code: 'CLIENT_SETTINGS_IO',
    message: error instanceof Error ? error.message : '客户端设置操作失败'
  }
}

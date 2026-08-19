import type {
  ClientLayoutKey,
  ClientSettingsPatch,
  ClientSettingsSnapshot,
  LegacyLayoutInput
} from './schema'
import type { ClientSettingsErrorDto } from './errors'

export type ClientSettingsWarning =
  | {
      code: 'LEGACY_LAYOUT_INVALID'
      key: ClientLayoutKey
      reason: 'invalid'
      defaultValue: number
    }
  | { code: 'BACKGROUND_CLEARED'; reason: 'missing-or-invalid' }
  | {
      code: 'BACKGROUND_CLEANUP_FAILED'
      operation: 'replace' | 'clear' | 'reset' | 'startup'
    }

export type ClientSettingsState =
  | {
      status: 'ready'
      snapshot: ClientSettingsSnapshot
      warnings?: readonly ClientSettingsWarning[]
    }
  | { status: 'error'; error: ClientSettingsErrorDto }

export type ClientSettingsResult<T> =
  { ok: true; value: T } | { ok: false; error: ClientSettingsErrorDto }

export interface ClientSettingsBootstrapRequest {
  legacyLayout: LegacyLayoutInput
}

export interface ClientSettingsBootstrapResponse {
  state: ClientSettingsState
  removeLegacyKeys: boolean
}

export interface ClientSettingsApi {
  get(): Promise<ClientSettingsState>
  patch(patch: ClientSettingsPatch): Promise<ClientSettingsSnapshot>
  chooseBackground(): Promise<ClientSettingsSnapshot>
  clearBackground(): Promise<ClientSettingsSnapshot>
  reset(): Promise<ClientSettingsSnapshot>
  subscribe(listener: (state: ClientSettingsState) => void): () => void
}

export interface ClientSettingsBridgeApi extends ClientSettingsApi {
  bootstrap(legacyLayout: LegacyLayoutInput): ClientSettingsBootstrapResponse
}

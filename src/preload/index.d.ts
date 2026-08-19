import type { KoWorkApi } from '@kowork/contracts'
import type { ClientSettingsBridgeApi } from '@kowork/client-settings'

declare global {
  interface Window {
    kowork: KoWorkApi & { clientSettings: ClientSettingsBridgeApi }
  }
}

export {}

import { ipcRenderer } from 'electron'
import {
  ClientSettingsError,
  type ClientSettingsBridgeApi,
  type ClientSettingsBootstrapResponse,
  type ClientSettingsResult,
  type ClientSettingsSnapshot,
  type ClientSettingsState,
  type LegacyLayoutInput
} from '@kowork/client-settings'

const CHANNELS = {
  bootstrap: 'kowork:client-settings:bootstrap',
  get: 'kowork:client-settings:get',
  patch: 'kowork:client-settings:patch',
  chooseBackground: 'kowork:client-settings:choose-background',
  clearBackground: 'kowork:client-settings:clear-background',
  reset: 'kowork:client-settings:reset',
  changed: 'kowork:client-settings:changed'
} as const

async function unwrap<T>(promise: Promise<ClientSettingsResult<T>>): Promise<T> {
  const result = await promise
  if (result.ok) return result.value
  throw new ClientSettingsError(result.error)
}

export const clientSettingsApi: ClientSettingsBridgeApi = {
  bootstrap: (legacyLayout: LegacyLayoutInput) =>
    ipcRenderer.sendSync(CHANNELS.bootstrap, {
      legacyLayout
    }) as ClientSettingsBootstrapResponse,
  get: () => unwrap<ClientSettingsState>(ipcRenderer.invoke(CHANNELS.get)),
  patch: (patch) => unwrap<ClientSettingsSnapshot>(ipcRenderer.invoke(CHANNELS.patch, patch)),
  chooseBackground: () =>
    unwrap<ClientSettingsSnapshot>(ipcRenderer.invoke(CHANNELS.chooseBackground)),
  clearBackground: () =>
    unwrap<ClientSettingsSnapshot>(ipcRenderer.invoke(CHANNELS.clearBackground)),
  reset: () => unwrap<ClientSettingsSnapshot>(ipcRenderer.invoke(CHANNELS.reset)),
  subscribe(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, state: ClientSettingsState): void =>
      listener(state)
    ipcRenderer.on(CHANNELS.changed, wrapped)
    return () => ipcRenderer.removeListener(CHANNELS.changed, wrapped)
  }
}

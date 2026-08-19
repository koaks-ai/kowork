import { BrowserWindow, ipcMain } from 'electron'
import {
  ClientSettingsError,
  DEFAULT_BACKGROUND,
  toClientSettingsErrorDto,
  type ClientSettingsBootstrapRequest,
  type ClientSettingsResult,
  type ClientSettingsSnapshot,
  type ClientSettingsState
} from '@kowork/client-settings'
import type { BackgroundAssetStore } from './backgrounds'
import type { ClientSettingsStore } from './store'

const CHANNELS = {
  bootstrap: 'kowork:client-settings:bootstrap',
  get: 'kowork:client-settings:get',
  patch: 'kowork:client-settings:patch',
  chooseBackground: 'kowork:client-settings:choose-background',
  clearBackground: 'kowork:client-settings:clear-background',
  reset: 'kowork:client-settings:reset',
  changed: 'kowork:client-settings:changed'
} as const

async function result<T>(operation: () => Promise<T>): Promise<ClientSettingsResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error) {
    return { ok: false, error: toClientSettingsErrorDto(error) }
  }
}

function broadcast(state: ClientSettingsState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(CHANNELS.changed, state)
  }
}

export function registerClientSettingsIpc(
  store: ClientSettingsStore,
  backgrounds: BackgroundAssetStore
): () => void {
  const unsubscribe = store.subscribe(broadcast)

  ipcMain.on(CHANNELS.bootstrap, (event, request: ClientSettingsBootstrapRequest) => {
    try {
      event.returnValue = store.bootstrapLegacy(request?.legacyLayout ?? {})
    } catch (error) {
      event.returnValue = { state: store.getState(), removeLegacyKeys: false }
      console.error('Failed to bootstrap client settings', toClientSettingsErrorDto(error))
    }
  })

  ipcMain.handle(CHANNELS.get, () => result(async () => store.getState()))
  ipcMain.handle(CHANNELS.patch, (_event, patch) => result(() => store.patch(patch)))
  ipcMain.handle(CHANNELS.chooseBackground, () =>
    result(async () => {
      const current = store.getSnapshot()
      const assetId = await backgrounds.chooseAndImport()
      if (!assetId) return current
      let updated: ClientSettingsSnapshot
      try {
        updated = await store.patch({
          section: 'appearance',
          value: {
            ...current.appearance,
            background: { assetId, ...DEFAULT_BACKGROUND }
          }
        })
      } catch (error) {
        try {
          await backgrounds.remove(assetId)
        } catch (cleanupError) {
          console.error('Failed to clean up uncommitted background', cleanupError)
        }
        throw error
      }
      const previous = current.appearance.background?.assetId
      if (previous && previous !== assetId) {
        void backgrounds.remove(previous).catch((error) => {
          store.addWarning({ code: 'BACKGROUND_CLEANUP_FAILED', operation: 'replace' })
          console.error('Failed to clean up replaced background', error)
        })
      }
      return updated
    })
  )
  ipcMain.handle(CHANNELS.clearBackground, () =>
    result(async () => {
      const current = store.getSnapshot()
      if (!current.appearance.background) return current
      const previous = current.appearance.background.assetId
      const updated = await store.patch({
        section: 'appearance',
        value: { ...current.appearance, background: null }
      })
      void backgrounds.remove(previous).catch((error) => {
        store.addWarning({ code: 'BACKGROUND_CLEANUP_FAILED', operation: 'clear' })
        console.error('Failed to clean up cleared background', error)
      })
      return updated
    })
  )
  ipcMain.handle(CHANNELS.reset, () =>
    result(async () => {
      const previous = store.getState()
      const assetId =
        previous.status === 'ready' ? previous.snapshot.appearance.background?.assetId : undefined
      const updated = await store.reset()
      if (assetId) {
        void backgrounds.remove(assetId).catch((error) => {
          store.addWarning({ code: 'BACKGROUND_CLEANUP_FAILED', operation: 'reset' })
          console.error('Failed to clean up reset background', error)
        })
      }
      return updated
    })
  )

  return () => {
    unsubscribe()
    ipcMain.removeAllListeners(CHANNELS.bootstrap)
    ipcMain.removeHandler(CHANNELS.get)
    ipcMain.removeHandler(CHANNELS.patch)
    ipcMain.removeHandler(CHANNELS.chooseBackground)
    ipcMain.removeHandler(CHANNELS.clearBackground)
    ipcMain.removeHandler(CHANNELS.reset)
  }
}

export function requireReadyState(state: ClientSettingsState): ClientSettingsSnapshot {
  if (state.status === 'ready') return state.snapshot
  throw new ClientSettingsError(state.error)
}

export const clientSettingsChannels = CHANNELS

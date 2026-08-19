import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { CoreSupervisor } from '../core/core-supervisor'
import { registerIpc } from '../ipc/register-ipc'
import { createMainWindow } from '../windows/create-main-window'
import { CredentialStore } from '../system/credential-store'
import { BackgroundAssetStore } from '../client-settings/backgrounds'
import { ClientSettingsStore } from '../client-settings/store'
import { registerBackgroundProtocol } from '../client-settings/protocol'
import { resolveNativeColorScheme, synchronizeNativeTheme } from '../client-settings/native-theme'

export async function startApplication(): Promise<void> {
  await app.whenReady()
  electronApp.setAppUserModelId('ai.koaks.kowork')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const dataPath = app.getPath('userData')
  const backgrounds = new BackgroundAssetStore(join(dataPath, 'backgrounds'))
  const clientSettings = new ClientSettingsStore({
    filePath: join(dataPath, 'client-settings.json'),
    resolveColorScheme: resolveNativeColorScheme,
    validateBackground: (assetId) => backgrounds.validate(assetId).then(() => undefined)
  })
  await clientSettings.initialize()
  const clientSettingsState = clientSettings.getState()
  if (clientSettingsState.status === 'ready') {
    const currentBackground = clientSettingsState.snapshot.appearance.background?.assetId ?? null
    try {
      await backgrounds.garbageCollect(currentBackground)
    } catch (error) {
      clientSettings.addWarning({ code: 'BACKGROUND_CLEANUP_FAILED', operation: 'startup' })
      console.error('Failed to clean up unreferenced backgrounds', error)
    }
  }
  const stopNativeTheme = synchronizeNativeTheme(clientSettings)
  const unregisterBackgroundProtocol = registerBackgroundProtocol(
    backgrounds,
    () => {
      const state = clientSettings.getState()
      return state.status === 'ready'
        ? (state.snapshot.appearance.background?.assetId ?? null)
        : null
    },
    async (assetId) => {
      await clientSettings.clearInvalidBackground(assetId)
    }
  )
  const credentials = new CredentialStore(join(dataPath, 'credentials.json'))
  const supervisor = new CoreSupervisor(dataPath, credentials)
  await supervisor.start()
  const providers = await supervisor.request('providers.list', {})
  for (const provider of providers) {
    const credentialConfigured = await credentials.has(provider.id)
    if (provider.credentialConfigured !== credentialConfigured) {
      await supervisor.request('providers.update', {
        providerId: provider.id,
        credentialId: credentialConfigured ? provider.id : null
      })
    }
  }
  let mainWindow: BrowserWindow | undefined
  const ensureWindow = (): BrowserWindow => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      const state = clientSettings.getState()
      const scheme = state.status === 'ready' ? state.snapshot.resolvedColorScheme : 'light'
      mainWindow = createMainWindow(scheme)
      mainWindow.on('closed', () => {
        mainWindow = undefined
      })
    }
    return mainWindow
  }
  const unregisterIpc = registerIpc(
    supervisor,
    credentials,
    ensureWindow,
    clientSettings,
    backgrounds
  )
  ensureWindow()

  app.on('activate', () => ensureWindow().show())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  let shutdownStarted = false
  app.on('before-quit', (event) => {
    if (shutdownStarted) return
    shutdownStarted = true
    event.preventDefault()
    unregisterIpc()
    unregisterBackgroundProtocol()
    stopNativeTheme()
    void supervisor.shutdown().finally(() => app.quit())
  })
}

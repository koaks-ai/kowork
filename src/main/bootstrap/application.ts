import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { CoreSupervisor } from '../core/core-supervisor'
import { registerIpc } from '../ipc/register-ipc'
import { createMainWindow } from '../windows/create-main-window'
import { CredentialStore } from '../system/credential-store'

export async function startApplication(): Promise<void> {
  await app.whenReady()
  electronApp.setAppUserModelId('ai.koaks.kowork')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const dataPath = app.getPath('userData')
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
      mainWindow = createMainWindow()
      mainWindow.on('closed', () => {
        mainWindow = undefined
      })
    }
    return mainWindow
  }
  const unregisterIpc = registerIpc(supervisor, credentials, ensureWindow)
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
    void supervisor.shutdown().finally(() => app.quit())
  })
}

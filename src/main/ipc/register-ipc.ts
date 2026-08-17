import { BrowserWindow, ipcMain } from 'electron'
import {
  parseRpcInput,
  providerCreateRequestSchema,
  providerUpdateRequestSchema,
  type RpcMethod
} from '@kowork/contracts'
import type { CoreSupervisor } from '../core/core-supervisor'
import { notifyApprovalIfUnattended } from '../system/approval-notifier'
import { pickProject } from '../system/project-picker'
import type { CredentialStore } from '../system/credential-store'

export function registerIpc(
  supervisor: CoreSupervisor,
  credentials: CredentialStore,
  ensureWindow: () => BrowserWindow
): () => void {
  ipcMain.handle('kowork:rpc', async (_event, method: RpcMethod, payload: unknown) => {
    return await supervisor.request(method, parseRpcInput(method, payload))
  })

  ipcMain.handle('kowork:pick-project', () => pickProject(supervisor))

  ipcMain.handle('kowork:providers-create', async (_event, rawInput: unknown) => {
    const input = providerCreateRequestSchema.parse(rawInput)
    const providerId = `provider-${crypto.randomUUID()}`
    const apiKey = input.apiKey
    if (apiKey) await credentials.set(providerId, apiKey)
    try {
      return await supervisor.request('providers.create', {
        id: providerId,
        name: input.name,
        kind: input.kind,
        protocol: input.protocol,
        baseUrl: input.baseUrl,
        credentialId: apiKey ? providerId : null,
        defaultContextWindowTokens: input.defaultContextWindowTokens
      })
    } catch (error) {
      if (apiKey) await credentials.remove(providerId).catch(() => undefined)
      throw error
    }
  })

  ipcMain.handle('kowork:providers-update', async (_event, rawInput: unknown) => {
    const input = providerUpdateRequestSchema.parse(rawInput)
    const { providerId, apiKey, ...changes } = input
    const changesCredential = Object.hasOwn(input, 'apiKey')
    const previousCredential = changesCredential ? await credentials.get(providerId) : undefined
    if (changesCredential) {
      if (apiKey) await credentials.set(providerId, apiKey)
      else await credentials.remove(providerId)
    }
    try {
      return await supervisor.request('providers.update', {
        providerId,
        ...changes,
        ...(changesCredential ? { credentialId: apiKey ? providerId : null } : {})
      })
    } catch (error) {
      if (changesCredential) {
        if (previousCredential) await credentials.set(providerId, previousCredential)
        else await credentials.remove(providerId)
      }
      throw error
    }
  })

  ipcMain.handle('kowork:providers-archive', async (_event, providerId: unknown) => {
    const parsedProviderId = String(providerId)
    const provider = await supervisor.request('providers.archive', {
      providerId: parsedProviderId
    })
    await credentials.remove(parsedProviderId)
    return provider
  })

  const unsubscribe = supervisor.subscribe(({ event }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('kowork:event', event)
    }
    notifyApprovalIfUnattended(event, ensureWindow)
  })

  return () => {
    unsubscribe()
    ipcMain.removeHandler('kowork:rpc')
    ipcMain.removeHandler('kowork:pick-project')
    ipcMain.removeHandler('kowork:providers-create')
    ipcMain.removeHandler('kowork:providers-update')
    ipcMain.removeHandler('kowork:providers-archive')
  }
}

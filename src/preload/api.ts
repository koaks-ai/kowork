import { ipcRenderer } from 'electron'
import {
  resolveHostPlatform,
  type KoWorkApi,
  type RpcInput,
  type RpcMethod,
  type RpcOutput,
  type RunEventDto
} from '@kowork/contracts'

async function invoke<M extends RpcMethod>(method: M, payload: RpcInput<M>): Promise<RpcOutput<M>> {
  return await ipcRenderer.invoke('kowork:rpc', method, payload)
}

export const koWorkApi: KoWorkApi = {
  platform: resolveHostPlatform(process.platform, process.getSystemVersion()),
  bootstrap: () => invoke('app.bootstrap', {}),
  projects: {
    list: (includeDeleted = false) => invoke('projects.list', { includeDeleted }),
    add: () => ipcRenderer.invoke('kowork:pick-project'),
    archive: (projectId) => invoke('projects.archive', { projectId }),
    restore: (projectId) => invoke('projects.restore', { projectId })
  },
  threads: {
    list: (projectId, includeDeleted = false) =>
      invoke('threads.list', { projectId, includeDeleted }),
    create: (projectId, title) =>
      invoke('threads.create', { projectId, ...(title ? { title } : {}) }),
    update: (threadId, changes) => invoke('threads.update', { threadId, ...changes }),
    archive: (threadId) => invoke('threads.archive', { threadId }),
    restore: (threadId) => invoke('threads.restore', { threadId })
  },
  runs: {
    enqueue: (threadId, input) => invoke('runs.enqueue', { threadId, input }),
    cancel: (runId) => invoke('runs.cancel', { runId }),
    resumeQueue: (threadId) => invoke('runs.resumeQueue', { threadId }),
    removeQueued: (requestId) => invoke('runs.removeQueued', { requestId }),
    list: (threadId) => invoke('runs.list', { threadId }),
    queue: (threadId) => invoke('runs.queue', { threadId })
  },
  events: {
    list: (threadId, afterSequence) =>
      invoke('events.list', {
        ...(threadId ? { threadId } : {}),
        ...(afterSequence !== undefined ? { afterSequence } : {})
      }),
    subscribe(listener) {
      const wrapped = (_event: Electron.IpcRendererEvent, event: RunEventDto): void =>
        listener(event)
      ipcRenderer.on('kowork:event', wrapped)
      return () => ipcRenderer.removeListener('kowork:event', wrapped)
    }
  },
  approvals: {
    list: (threadId, pendingOnly = false) =>
      invoke('approvals.list', { ...(threadId ? { threadId } : {}), pendingOnly }),
    respond: (approvalId, decision) => invoke('approvals.respond', { approvalId, decision })
  },
  providers: {
    list: () => invoke('providers.list', {}),
    create: (input) => ipcRenderer.invoke('kowork:providers-create', input),
    update: (input) => ipcRenderer.invoke('kowork:providers-update', input),
    archive: (providerId) => ipcRenderer.invoke('kowork:providers-archive', providerId),
    refreshModels: (providerId) => invoke('providers.refreshModels', { providerId }),
    addModel: (providerId, model, contextWindowTokens, name) =>
      invoke('models.add', { providerId, model, contextWindowTokens, name }),
    archiveModel: (modelProfileId) => invoke('models.archive', { modelProfileId })
  },
  settings: {
    get: () => invoke('settings.get', {}),
    update: (changes) => invoke('settings.update', changes)
  },
  files: {
    list: (projectId, relativePath) =>
      invoke('files.list', { projectId, ...(relativePath ? { relativePath } : {}) }),
    read: (projectId, relativePath) => invoke('files.read', { projectId, relativePath })
  },
  git: {
    status: (projectId) => invoke('git.status', { projectId }),
    summary: (projectId) => invoke('git.summary', { projectId }),
    diff: (projectId, relativePath) =>
      invoke('git.diff', { projectId, ...(relativePath ? { relativePath } : {}) })
  }
}

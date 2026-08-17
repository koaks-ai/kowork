import { CoreError } from '../domain/errors'
import type { ToolLockMode } from './tool-spec'

type Release = () => void

interface LockWaiter {
  mode: ToolLockMode
  grant(): void
}

interface LockState {
  readers: number
  writer: boolean
  queue: LockWaiter[]
}

function cancellationError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason
  return new CoreError(
    'tool_cancelled',
    typeof signal.reason === 'string' ? signal.reason : 'Tool call was cancelled'
  )
}

export class ProjectToolLocks {
  private readonly states = new Map<string, LockState>()

  async withLock<T>(
    projectId: string,
    mode: ToolLockMode,
    signal: AbortSignal,
    block: () => Promise<T>
  ): Promise<T> {
    const release = await this.acquire(projectId, mode, signal)
    try {
      return await block()
    } finally {
      release()
    }
  }

  private async acquire(
    projectId: string,
    mode: ToolLockMode,
    signal: AbortSignal
  ): Promise<Release> {
    if (signal.aborted) throw cancellationError(signal)
    const state = this.states.get(projectId) ?? { readers: 0, writer: false, queue: [] }
    this.states.set(projectId, state)

    return await new Promise<Release>((resolve, reject) => {
      let settled = false
      const abort = (): void => {
        if (settled) return
        settled = true
        const index = state.queue.indexOf(waiter)
        if (index >= 0) state.queue.splice(index, 1)
        signal.removeEventListener('abort', abort)
        reject(cancellationError(signal))
        this.drain(projectId, state)
      }
      const waiter: LockWaiter = {
        mode,
        grant: () => {
          if (settled) return
          settled = true
          signal.removeEventListener('abort', abort)
          let released = false
          resolve(() => {
            if (released) return
            released = true
            if (mode === 'read') state.readers -= 1
            else state.writer = false
            this.drain(projectId, state)
          })
        }
      }
      state.queue.push(waiter)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      else this.drain(projectId, state)
    })
  }

  private drain(projectId: string, state: LockState): void {
    if (state.writer) return
    const first = state.queue[0]
    if (!first) {
      if (state.readers === 0) this.states.delete(projectId)
      return
    }
    if (first.mode === 'write') {
      if (state.readers > 0) return
      state.queue.shift()
      state.writer = true
      first.grant()
      return
    }
    while (state.queue[0]?.mode === 'read' && !state.writer) {
      const reader = state.queue.shift()!
      state.readers += 1
      reader.grant()
    }
  }
}

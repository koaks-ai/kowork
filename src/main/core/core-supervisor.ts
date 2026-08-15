import { join } from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import {
  PROTOCOL_VERSION,
  coreToMainMessageSchema,
  parseRpcOutput,
  rpcRequestEnvelopeSchema,
  type CoreEventEnvelope,
  type RpcInput,
  type RpcMethod,
  type RpcOutput
} from '@kowork/contracts'
import type { CredentialStore } from '../system/credential-store'

const isSensitiveEnvironmentKey = (key: string): boolean =>
  /(?:^|_)(?:API_?KEY|ACCESS_?TOKEN|SECRET|PASSWORD)$/iu.test(key)

interface PendingRequest {
  method: RpcMethod
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

export class CoreSupervisor {
  private process?: UtilityProcess
  private readyPromise?: Promise<void>
  private resolveReady?: () => void
  private rejectReady?: (reason: unknown) => void
  private readonly pending = new Map<string, PendingRequest>()
  private readonly eventListeners = new Set<(event: CoreEventEnvelope) => void>()
  private shuttingDown = false
  private restartAttempt = 0
  private restartTimer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly dataPath: string,
    private readonly credentials: CredentialStore,
    private readonly testMode = process.env.KOWORK_FAKE_AGENT === '1'
  ) {}

  async start(): Promise<void> {
    if (this.readyPromise) return await this.readyPromise
    if (this.shuttingDown) throw new Error('KoWork Core is shutting down')
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    let child: UtilityProcess
    try {
      child = utilityProcess.fork(join(__dirname, 'core.js'), [], {
        serviceName: 'KoWork Core',
        env: this.sanitizedEnvironment()
      })
    } catch (error) {
      const failed = this.readyPromise
      this.rejectReady?.(error)
      this.readyPromise = undefined
      this.resolveReady = undefined
      this.rejectReady = undefined
      return await failed
    }
    this.process = child
    child.on('message', (raw) => this.handleMessage(child, raw))
    child.on('exit', (code) => this.handleExit(child, code))
    child.postMessage({
      type: 'bootstrap',
      version: PROTOCOL_VERSION,
      dataPath: this.dataPath,
      testMode: this.testMode
    })
    return await this.readyPromise
  }

  private sanitizedEnvironment(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(process.env)
        .filter(
          ([key, value]) =>
            value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && !isSensitiveEnvironmentKey(key)
        )
        .map(([key, value]) => [key, value!])
    )
  }

  private handleMessage(child: UtilityProcess, raw: unknown): void {
    if (this.process !== child) return
    const message = coreToMainMessageSchema.parse(raw)
    if (message.type === 'ready') {
      this.restartAttempt = 0
      this.resolveReady?.()
      this.resolveReady = undefined
      this.rejectReady = undefined
      return
    }
    if (message.type === 'event') {
      for (const listener of this.eventListeners) listener(message.envelope)
      return
    }
    if (message.type === 'credential-request') {
      void this.respondWithCredential(child, message.requestId, message.providerId)
      return
    }
    if (message.type === 'rpc') {
      const pending = this.pending.get(message.response.id)
      if (!pending) return
      this.pending.delete(message.response.id)
      if (message.response.ok) {
        pending.resolve(parseRpcOutput(pending.method, message.response.result))
      } else {
        pending.reject(
          Object.assign(new Error(message.response.error.message), {
            code: message.response.error.code
          })
        )
      }
      return
    }
    if (message.type === 'fatal') {
      console.error('KoWork Core fatal error:', message.message)
      this.rejectReady?.(new Error(message.message))
      child.kill()
    }
  }

  private async respondWithCredential(
    child: UtilityProcess,
    requestId: string,
    providerId: string
  ): Promise<void> {
    try {
      const credential = await this.credentials.get(providerId)
      if (this.process === child) {
        child.postMessage({
          type: 'credential-response',
          requestId,
          credential: credential ?? null
        })
      }
    } catch {
      if (this.process === child) {
        child.postMessage({
          type: 'credential-response',
          requestId,
          credential: null,
          error: 'Secure credential could not be read'
        })
      }
    }
  }

  private handleExit(child: UtilityProcess, code: number): void {
    if (this.process !== child) return
    const error = new Error(`KoWork Core exited with code ${code}`)
    this.rejectReady?.(error)
    this.process = undefined
    this.readyPromise = undefined
    this.resolveReady = undefined
    this.rejectReady = undefined
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    if (this.shuttingDown) return
    const delay = Math.min(500 * 2 ** this.restartAttempt++, 5_000)
    this.restartTimer = setTimeout(
      () =>
        void this.start().catch((error) => console.error('Failed to restart KoWork Core', error)),
      delay
    )
  }

  subscribe(listener: (event: CoreEventEnvelope) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  async request<M extends RpcMethod>(method: M, payload: RpcInput<M>): Promise<RpcOutput<M>> {
    await this.start()
    const child = this.process
    if (!child) throw new Error('KoWork Core is unavailable')
    const id = crypto.randomUUID()
    const request = rpcRequestEnvelopeSchema.parse({
      version: PROTOCOL_VERSION,
      id,
      method,
      payload
    })
    return await new Promise<RpcOutput<M>>((resolve, reject) => {
      this.pending.set(id, { method, resolve: resolve as (value: unknown) => void, reject })
      child.postMessage({ type: 'rpc', request })
    })
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = undefined
    const child = this.process
    if (!child) {
      this.rejectReady?.(new Error('KoWork Core shut down before becoming ready'))
      this.readyPromise = undefined
      this.resolveReady = undefined
      this.rejectReady = undefined
      return
    }
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill()
        resolve()
      }, 8_000)
      const onMessage = (raw: unknown): void => {
        const message = coreToMainMessageSchema.safeParse(raw)
        if (message.success && message.data.type === 'shutdown-complete') {
          clearTimeout(timeout)
          child.off('message', onMessage)
          resolve()
        }
      }
      child.on('message', onMessage)
      child.postMessage({ type: 'shutdown' })
    })
  }
}

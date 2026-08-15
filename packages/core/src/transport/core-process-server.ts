import {
  PROTOCOL_VERSION,
  coreEventEnvelopeSchema,
  mainToCoreMessageSchema,
  parseRpcOutput,
  type CoreToMainMessage,
  type RpcMethod
} from '@kowork/contracts'
import { CoreApplication } from '../application/core-application'
import { CoreError } from '../domain/errors'
import type { CredentialProvider } from '../infrastructure/credentials/credential-provider'

export interface CoreParentPort {
  postMessage(message: CoreToMainMessage): void
  on(event: 'message', listener: (message: { data: unknown }) => void): void
}

export function startCoreProcessServer(parentPort: CoreParentPort): void {
  let application: CoreApplication | undefined
  const credentialRequests = new Map<
    string,
    { resolve: (credential: string | undefined) => void; reject: (error: Error) => void }
  >()
  const send = (message: CoreToMainMessage): void => parentPort.postMessage(message)
  const credentials: CredentialProvider = {
    get: async (providerId) => {
      const requestId = crypto.randomUUID()
      return await new Promise<string | undefined>((resolve, reject) => {
        const timeout = setTimeout(() => {
          credentialRequests.delete(requestId)
          reject(new CoreError('credential_timeout', 'Credential request timed out'))
        }, 10_000)
        credentialRequests.set(requestId, {
          resolve: (credential) => {
            clearTimeout(timeout)
            resolve(credential)
          },
          reject: (error) => {
            clearTimeout(timeout)
            reject(error)
          }
        })
        send({ type: 'credential-request', requestId, providerId })
      })
    }
  }

  parentPort.on('message', ({ data }) => {
    void (async () => {
      const message = mainToCoreMessageSchema.parse(data)
      if (message.type === 'credential-response') {
        const pending = credentialRequests.get(message.requestId)
        if (!pending) return
        credentialRequests.delete(message.requestId)
        if (message.error) pending.reject(new CoreError('credential_unavailable', message.error))
        else pending.resolve(message.credential ?? undefined)
        return
      }
      if (message.type === 'bootstrap') {
        if (application) return
        application = new CoreApplication(message.dataPath, credentials, message.testMode)
        application.subscribe((event) => {
          const envelope = coreEventEnvelopeSchema.parse({ version: PROTOCOL_VERSION, event })
          send({ type: 'event', envelope })
        })
        send({ type: 'ready' })
        return
      }
      if (message.type === 'shutdown') {
        await application?.close()
        for (const pending of credentialRequests.values()) {
          pending.reject(new CoreError('core_shutting_down', 'Core is shutting down'))
        }
        credentialRequests.clear()
        send({ type: 'shutdown-complete' })
        return
      }
      if (!application) throw new CoreError('core_not_ready', 'Core has not been bootstrapped')
      const method = message.request.method as RpcMethod
      try {
        const result = await application.handle(method, message.request.payload)
        send({
          type: 'rpc',
          response: {
            version: PROTOCOL_VERSION,
            id: message.request.id,
            ok: true,
            result: parseRpcOutput(method, result)
          }
        })
      } catch (error) {
        const coreError =
          error instanceof CoreError
            ? error
            : new CoreError(
                'internal_error',
                error instanceof Error ? error.message : String(error)
              )
        send({
          type: 'rpc',
          response: {
            version: PROTOCOL_VERSION,
            id: message.request.id,
            ok: false,
            error: { code: coreError.code, message: coreError.message, details: coreError.details }
          }
        })
      }
    })().catch((error) => {
      send({
        type: 'fatal',
        message: error instanceof Error ? (error.stack ?? error.message) : String(error)
      })
    })
  })
}

import { z } from 'zod'
import {
  appBootstrapSchema,
  appSettingsSchema,
  approvalSchema,
  fileContentSchema,
  fileEntrySchema,
  gitChangeSchema,
  gitDiffSchema,
  gitSummarySchema,
  modelProfileSchema,
  modelRefreshResultSchema,
  permissionModeSchema,
  projectSchema,
  providerKindSchema,
  providerProtocolSchema,
  providerSchema,
  queuedRequestSchema,
  runEventSchema,
  runSchema,
  threadSchema
} from './models'

export const PROTOCOL_VERSION = 5 as const

const emptySchema = z.object({})

export const rpcSchemas = {
  'app.bootstrap': { input: emptySchema, output: appBootstrapSchema },
  'projects.list': {
    input: z.object({ includeDeleted: z.boolean().optional() }),
    output: z.array(projectSchema)
  },
  'projects.add': { input: z.object({ rootPath: z.string().min(1) }), output: projectSchema },
  'projects.archive': { input: z.object({ projectId: z.string() }), output: projectSchema },
  'projects.restore': { input: z.object({ projectId: z.string() }), output: projectSchema },
  'threads.list': {
    input: z.object({ projectId: z.string(), includeDeleted: z.boolean().optional() }),
    output: z.array(threadSchema)
  },
  'threads.create': {
    input: z.object({ projectId: z.string(), title: z.string().optional() }),
    output: threadSchema
  },
  'threads.update': {
    input: z.object({
      threadId: z.string(),
      title: z.string().min(1).optional(),
      modelProfileId: z.string().optional(),
      permissionMode: permissionModeSchema.optional(),
      contextWindowTokens: z.number().int().positive().nullable().optional()
    }),
    output: threadSchema
  },
  'threads.archive': { input: z.object({ threadId: z.string() }), output: threadSchema },
  'threads.restore': { input: z.object({ threadId: z.string() }), output: threadSchema },
  'runs.enqueue': {
    input: z.object({ threadId: z.string(), input: z.string().trim().min(1) }),
    output: queuedRequestSchema
  },
  'runs.cancel': { input: z.object({ runId: z.string() }), output: runSchema },
  'runs.resumeQueue': { input: z.object({ threadId: z.string() }), output: threadSchema },
  'runs.removeQueued': { input: z.object({ requestId: z.string() }), output: queuedRequestSchema },
  'runs.list': { input: z.object({ threadId: z.string() }), output: z.array(runSchema) },
  'runs.queue': {
    input: z.object({ threadId: z.string() }),
    output: z.array(queuedRequestSchema)
  },
  'events.list': {
    input: z.object({
      threadId: z.string().optional(),
      afterSequence: z.number().int().nonnegative().optional()
    }),
    output: z.array(runEventSchema)
  },
  'approvals.list': {
    input: z.object({ threadId: z.string().optional(), pendingOnly: z.boolean().optional() }),
    output: z.array(approvalSchema)
  },
  'approvals.respond': {
    input: z.object({ approvalId: z.string(), decision: z.enum(['allow', 'deny']) }),
    output: approvalSchema
  },
  'providers.list': { input: emptySchema, output: z.array(providerSchema) },
  'providers.create': {
    input: z.object({
      id: z.string(),
      name: z.string().trim().min(1),
      kind: providerKindSchema,
      protocol: providerProtocolSchema,
      baseUrl: z.string().trim().url(),
      credentialId: z.string().nullable(),
      defaultContextWindowTokens: z.number().int().positive()
    }),
    output: providerSchema
  },
  'providers.update': {
    input: z.object({
      providerId: z.string(),
      name: z.string().trim().min(1).optional(),
      kind: providerKindSchema.optional(),
      protocol: providerProtocolSchema.optional(),
      baseUrl: z.string().trim().url().optional(),
      credentialId: z.string().nullable().optional(),
      defaultContextWindowTokens: z.number().int().positive().optional(),
      enabled: z.boolean().optional()
    }),
    output: providerSchema
  },
  'providers.archive': { input: z.object({ providerId: z.string() }), output: providerSchema },
  'providers.refreshModels': {
    input: z.object({ providerId: z.string() }),
    output: modelRefreshResultSchema
  },
  'models.add': {
    input: z.object({
      providerId: z.string(),
      model: z.string().trim().min(1),
      name: z.string().trim().min(1).optional(),
      contextWindowTokens: z.number().int().positive()
    }),
    output: modelProfileSchema
  },
  'models.archive': { input: z.object({ modelProfileId: z.string() }), output: modelProfileSchema },
  'settings.get': { input: emptySchema, output: appSettingsSchema },
  'settings.update': {
    input: z.object({
      defaultModelProfileId: z.string().nullable().optional(),
      defaultPermissionMode: permissionModeSchema.optional()
    }),
    output: appSettingsSchema
  },
  'files.list': {
    input: z.object({ projectId: z.string(), relativePath: z.string().optional() }),
    output: z.array(fileEntrySchema)
  },
  'files.read': {
    input: z.object({ projectId: z.string(), relativePath: z.string() }),
    output: fileContentSchema
  },
  'git.status': { input: z.object({ projectId: z.string() }), output: z.array(gitChangeSchema) },
  'git.summary': { input: z.object({ projectId: z.string() }), output: gitSummarySchema },
  'git.diff': {
    input: z.object({ projectId: z.string(), relativePath: z.string().optional() }),
    output: gitDiffSchema
  }
} as const

export type RpcMethod = keyof typeof rpcSchemas
export type RpcInput<M extends RpcMethod> = z.infer<(typeof rpcSchemas)[M]['input']>
export type RpcOutput<M extends RpcMethod> = z.infer<(typeof rpcSchemas)[M]['output']>

export const rpcRequestEnvelopeSchema = z.object({
  version: z.literal(PROTOCOL_VERSION),
  id: z.string(),
  method: z.string(),
  payload: z.unknown()
})

export const rpcResponseEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string(),
    ok: z.literal(true),
    result: z.unknown()
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string(),
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() })
  })
])

export const coreEventEnvelopeSchema = z.object({
  version: z.literal(PROTOCOL_VERSION),
  event: runEventSchema
})

export type RpcRequestEnvelope = z.infer<typeof rpcRequestEnvelopeSchema>
export type RpcResponseEnvelope = z.infer<typeof rpcResponseEnvelopeSchema>
export type CoreEventEnvelope = z.infer<typeof coreEventEnvelopeSchema>

export function parseRpcInput<M extends RpcMethod>(method: M, input: unknown): RpcInput<M> {
  return rpcSchemas[method].input.parse(input) as RpcInput<M>
}

export function parseRpcOutput<M extends RpcMethod>(method: M, output: unknown): RpcOutput<M> {
  return rpcSchemas[method].output.parse(output) as RpcOutput<M>
}

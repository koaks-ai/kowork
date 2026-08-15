import { z } from 'zod'
import {
  PROTOCOL_VERSION,
  coreEventEnvelopeSchema,
  rpcRequestEnvelopeSchema,
  rpcResponseEnvelopeSchema
} from './protocol'

export const mainToCoreMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('bootstrap'),
    version: z.literal(PROTOCOL_VERSION),
    dataPath: z.string(),
    testMode: z.boolean().optional()
  }),
  z.object({ type: z.literal('rpc'), request: rpcRequestEnvelopeSchema }),
  z.object({
    type: z.literal('credential-response'),
    requestId: z.string(),
    credential: z.string().nullable(),
    error: z.string().optional()
  }),
  z.object({ type: z.literal('shutdown') })
])

export const coreToMainMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('rpc'), response: rpcResponseEnvelopeSchema }),
  z.object({ type: z.literal('event'), envelope: coreEventEnvelopeSchema }),
  z.object({
    type: z.literal('credential-request'),
    requestId: z.string(),
    providerId: z.string()
  }),
  z.object({ type: z.literal('shutdown-complete') }),
  z.object({ type: z.literal('fatal'), message: z.string() })
])

export type MainToCoreMessage = z.infer<typeof mainToCoreMessageSchema>
export type CoreToMainMessage = z.infer<typeof coreToMainMessageSchema>

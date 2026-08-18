import { z } from 'zod'
import { serverInfoSchema } from './domain/server'
import { eventSchema } from './events'
import { kapErrorSchema } from './errors'
import { idSchema } from './primitives'

/**
 * KAP 帧层。
 *
 * 传输是**单条 WebSocket 连接**，JSON 文本帧。所有帧在顶层用 `kind` 判别 —— 这样 TS 的
 * `z.discriminatedUnion` 与 Kotlin 的 `@Serializable` 密封接口（`classDiscriminator = "kind"`）
 * 能一一对应，不需要任何一侧写手工分发。
 *
 * 响应刻意拆成 `result` 与 `error` 两种 kind，而不是 `{ kind: 'response', ok: boolean }`：
 * 顶层单一判别键让两侧的反序列化都是纯声明式的。
 *
 * 帧层只负责路由，**不校验** `params` / `value` 的内容；那是 `methods.ts` 的职责。
 */

// ——————————————————————————————————————————————————————————————
// 客户端 → 服务端
// ——————————————————————————————————————————————————————————————

/**
 * 握手。必须是连接建立后的第一帧，在收到 `welcome` 之前发送任何 `request` 都会得到
 * `handshake_required`。
 *
 * `token` 是 server 的接入密钥：本地模式由客户端拉起 sidecar 时生成的一次性 token，
 * 远程模式是用户在设置里录入的服务器密钥。
 */
export const helloFrameSchema = z.object({
  kind: z.literal('hello'),
  minVersion: z.number().int().positive(),
  maxVersion: z.number().int().positive(),
  token: z.string(),
  client: z.object({
    name: z.string(),
    version: z.string(),
    os: z.string()
  })
})
export type HelloFrame = z.infer<typeof helloFrameSchema>

export const requestFrameSchema = z.object({
  kind: z.literal('request'),
  /** 客户端生成，需在连接内唯一。响应会带回同一个 id。 */
  id: idSchema,
  method: z.string(),
  params: z.unknown()
})
export type RequestFrame = z.infer<typeof requestFrameSchema>

/**
 * 请求取消。
 *
 * 尽力而为：server 可能已经完成处理。被成功取消的请求会收到 `request_cancelled` 错误帧，
 * 因此每个 `request` 最终**恰好**收到一个 `result` 或 `error`，客户端的 pending 表不会泄漏。
 */
export const cancelFrameSchema = z.object({
  kind: z.literal('cancel'),
  id: idSchema
})
export type CancelFrame = z.infer<typeof cancelFrameSchema>

export const clientFrameSchema = z.discriminatedUnion('kind', [
  helloFrameSchema,
  requestFrameSchema,
  cancelFrameSchema
])
export type ClientFrame = z.infer<typeof clientFrameSchema>

// ——————————————————————————————————————————————————————————————
// 服务端 → 客户端
// ——————————————————————————————————————————————————————————————

/** 握手成功。`server` 里带能力位，客户端据此做功能降级。 */
export const welcomeFrameSchema = z.object({
  kind: z.literal('welcome'),
  server: serverInfoSchema
})
export type WelcomeFrame = z.infer<typeof welcomeFrameSchema>

export const resultFrameSchema = z.object({
  kind: z.literal('result'),
  id: idSchema,
  value: z.unknown()
})
export type ResultFrame = z.infer<typeof resultFrameSchema>

export const errorFrameSchema = z.object({
  kind: z.literal('error'),
  id: idSchema,
  error: kapErrorSchema
})
export type ErrorFrame = z.infer<typeof errorFrameSchema>

/**
 * 事件推送。
 *
 * server 向**所有已握手的连接**广播事件，客户端自行按 projectId / threadId 过滤。
 * 断线重连后用 `events.list` 带上最后收到的 `sequence` 补齐空档。
 *
 * 慢客户端不得阻塞 run 循环：server 侧的广播必须是有界队列 + 丢弃后让客户端走补发路径，
 * 而不是同步等待写入完成（旧实现的 `CoreEventBus` 是同步广播，这是被修复的问题之一）。
 */
export const eventFrameSchema = z.object({
  kind: z.literal('event'),
  event: eventSchema
})
export type EventFrame = z.infer<typeof eventFrameSchema>

/** 连接级致命错误。server 发出后会主动关闭连接。 */
export const fatalFrameSchema = z.object({
  kind: z.literal('fatal'),
  error: kapErrorSchema
})
export type FatalFrame = z.infer<typeof fatalFrameSchema>

export const serverFrameSchema = z.discriminatedUnion('kind', [
  welcomeFrameSchema,
  resultFrameSchema,
  errorFrameSchema,
  eventFrameSchema,
  fatalFrameSchema
])
export type ServerFrame = z.infer<typeof serverFrameSchema>

export function parseClientFrame(value: unknown): ClientFrame {
  return clientFrameSchema.parse(value)
}

export function parseServerFrame(value: unknown): ServerFrame {
  return serverFrameSchema.parse(value)
}

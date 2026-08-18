import { z } from 'zod'

/**
 * 协议共用的标量与小结构。
 *
 * 这里的 `usage` / `annotation` / `reasoningKind` 等类型在旧实现里是直接把 Koaks 框架的
 * `Usage` / `Annotation` / `ModelEvent` 透传到 renderer 的（`timeline-model.ts` 曾直接
 * `import type { Annotation, ModelEvent } from '@koaks/node'`）。KAP 明确禁止框架类型外泄：
 * 协议持有自己的等价定义，Koaks 只是 server 的一个内部实现细节。
 */

export const epochMillisSchema = z.number().int().nonnegative()

export const idSchema = z.string().min(1)

/** 单调递增的事件序号，客户端用它做断线补发的游标。 */
export const sequenceSchema = z.number().int().nonnegative()

export const usageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  reasoningOutputTokens: z.number().int().nonnegative()
})
export type UsageDto = z.infer<typeof usageSchema>

export const ZERO_USAGE: UsageDto = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedInputTokens: 0,
  reasoningOutputTokens: 0
}

/**
 * `legacy` 表示模型没有区分推理内容的种类。保留它是因为部分供应商只回一段未标注的推理文本，
 * 客户端需要能把它和 `summary` / `raw` 区分开来展示。
 */
export const reasoningKindSchema = z.enum(['summary', 'raw', 'legacy'])
export type ReasoningKind = z.infer<typeof reasoningKindSchema>

/** 结构化输出的收尾步骤与普通步骤要区分，插件的 before-model hook 通常应跳过收尾步骤。 */
export const modelCallPhaseSchema = z.enum(['normal', 'structured_finalization'])
export type ModelCallPhase = z.infer<typeof modelCallPhaseSchema>

export const annotationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('url_citation'),
    url: z.string(),
    title: z.string().optional(),
    startIndex: z.number().int().nonnegative().optional(),
    endIndex: z.number().int().nonnegative().optional()
  }),
  z.object({
    type: z.literal('file_citation'),
    fileId: z.string(),
    filename: z.string().optional(),
    startIndex: z.number().int().nonnegative().optional(),
    endIndex: z.number().int().nonnegative().optional()
  }),
  z.object({
    type: z.literal('generic'),
    kind: z.string(),
    payload: z.string()
  })
])
export type AnnotationDto = z.infer<typeof annotationSchema>

/** 模型请求里引用的条目锚点，客户端用它把增量事件归并到同一段内容上。 */
export const itemRefSchema = z.string().min(1)

/**
 * 只接受 http/https 的 URL。
 *
 * 比 `z.string().url()` 更严：后者会放过 `ftp://` 之类。限定 scheme 的另一个原因是 Kotlin 侧
 * 的 `require()` 校验必须能给出完全一致的判定，否则 conformance fixture 会在两侧结论不同。
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), {
    message: 'URL 必须以 http:// 或 https:// 开头'
  })

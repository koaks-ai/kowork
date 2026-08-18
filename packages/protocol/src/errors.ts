import { z } from 'zod'

/**
 * KAP 错误码。
 *
 * 客户端只允许对这张表里的码做行为分支；`message` 仅用于展示，不得参与逻辑判断。
 * 新增错误码属于向后兼容变更，客户端遇到未知码必须按 `internal_error` 兜底处理。
 */
export const KAP_ERROR_CODES = [
  // —— 握手与鉴权 ——
  'unsupported_protocol_version',
  'handshake_required',
  'handshake_already_completed',
  'unauthenticated',
  'invalid_token',

  // —— 请求层 ——
  'unknown_method',
  'method_not_implemented',
  'invalid_params',
  'invalid_response',
  'request_cancelled',
  'payload_too_large',
  'rate_limited',

  // —— 领域：项目与会话 ——
  'project_not_found',
  'project_archived',
  'thread_not_found',
  'thread_archived',

  // —— 领域：运行与队列 ——
  'run_not_found',
  'run_not_active',
  'request_not_found',
  'request_not_queued',

  // —— 领域：审批 ——
  'approval_not_found',
  'approval_not_pending',

  // —— 领域：供应商与模型 ——
  'provider_not_found',
  'provider_builtin_immutable',
  'model_profile_not_found',
  'no_model_available',
  'credential_missing',
  'model_discovery_failed',

  // —— 工作区与路径 ——
  'path_outside_project',
  'path_not_found',
  'path_forbidden',
  'not_a_directory',
  'not_a_file',
  'file_too_large',
  'binary_file',
  'not_a_git_repository',

  // —— 权限与工具 ——
  'permission_denied',
  'approval_denied',
  'tool_timeout',
  'tool_not_found',

  // —— 插件（阶段 5 预留） ——
  'plugin_not_found',
  'plugin_disabled',
  'plugin_load_failed',
  'plugin_host_unavailable',

  // —— 服务端 ——
  'server_shutting_down',
  'unavailable',
  'internal_error'
] as const

export const kapErrorCodeSchema = z.enum(KAP_ERROR_CODES)
export type KapErrorCode = z.infer<typeof kapErrorCodeSchema>

export const kapErrorSchema = z.object({
  code: kapErrorCodeSchema,
  message: z.string(),
  /** 结构化补充信息，仅用于日志与诊断展示。 */
  details: z.record(z.string(), z.unknown()).optional()
})
export type KapError = z.infer<typeof kapErrorSchema>

export function kapError(
  code: KapErrorCode,
  message: string,
  details?: Record<string, unknown>
): KapError {
  return details ? { code, message, details } : { code, message }
}

/** 未知错误码按 `internal_error` 兜底，保证跨版本前向兼容。 */
export function normalizeErrorCode(code: string): KapErrorCode {
  return (KAP_ERROR_CODES as readonly string[]).includes(code)
    ? (code as KapErrorCode)
    : 'internal_error'
}

import { z } from 'zod'
import { idSchema } from '../primitives'
import { permissionModeSchema } from './thread'

/**
 * ServerSettings —— 由 agent server 拥有的设置。
 *
 * 设置被明确切成两半，这是决策 2「server 拥有全部 Agent 状态，客户端只保留设备级偏好」的
 * 直接结果：
 *
 * **归 server（走 KAP，跟着服务器走）**
 * - 默认模型 Profile
 * - 默认权限模式
 * - 供应商与 API Key
 * - 工具预算与超时
 *
 * **归客户端（不进协议，存在本机 `userData/client-settings.json`）**
 * - 主题、强调色
 * - 背景图片及其模糊度/透明度
 * - 面板宽度与布局
 * - 界面语言
 * - 连接配置（本地/远程、host、port、密钥）
 *
 * 判据很简单：换一台电脑接同一个 server 时，**应该跟着走的**归 server，**应该留在这台机器上的**
 * 归客户端。主题是设备级审美偏好，所以留在客户端；权限模式影响 server 上的真实文件操作，
 * 所以归 server。
 */
export const serverSettingsSchema = z.object({
  defaultModelProfileId: idSchema.nullable(),
  defaultPermissionMode: permissionModeSchema
})
export type ServerSettingsDto = z.infer<typeof serverSettingsSchema>

/**
 * `settings.update` 用**整体替换**语义，输入就是完整的 [serverSettingsSchema]。
 *
 * 刻意不做 partial patch。原因是 `defaultModelProfileId` 需要区分「不改」与「清空」，而
 * `字段缺省 / null / 有值` 这种三态在 Kotlin 的 kotlinx.serialization 里无法和 TS 的
 * `.nullable().optional()` 精确对齐：Kotlin 的 `String? = null` 会把「缺省」和「显式 null」
 * 合并成同一个值。ServerSettings 只有两个字段，整体替换的代价可以忽略，换来的是两侧语义完全一致。
 *
 * 同样的理由决定了另外两处设计：凭据改动走独立的 `providers.setCredential`，
 * 会话上下文窗口改动走 [contextWindowOverrideSchema] 这个显式判别联合。
 */
export const serverSettingsReplaceSchema = serverSettingsSchema
export type ServerSettingsReplaceInput = z.infer<typeof serverSettingsReplaceSchema>

package dev.kowork.protocol

import kotlinx.serialization.Serializable

/**
 * ServerSettings —— 由 agent server 拥有的设置。
 *
 * 设置被明确切成两半，这是决策 2「server 拥有全部 Agent 状态，客户端只保留设备级偏好」的直接结果：
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
 * 判据：换一台电脑接同一个 server 时，**应该跟着走的**归 server，**应该留在这台机器上的**归客户端。
 * 主题是设备级审美偏好，所以留在客户端；权限模式影响 server 上的真实文件操作，所以归 server。
 *
 * `settings.replace` 用**整体替换**语义，入参就是本类型。刻意不做 partial patch：
 * [defaultModelProfileId] 需要区分「不改」与「清空」，而「缺省 / 显式 null / 有值」这种三态在
 * kotlinx.serialization 里无法与 TS 的 `.nullable().optional()` 精确对齐 —— `String? = null`
 * 会把缺省和显式 null 合并成同一个值。本类型只有两个字段，整体替换的代价可以忽略。
 */
@Serializable
data class ServerSettings(
    val defaultModelProfileId: String?,
    val defaultPermissionMode: PermissionMode
)


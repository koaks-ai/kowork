/**
 * `@kowork/protocol` —— KoWork Agent Protocol (KAP) v1 的 TypeScript 侧。
 *
 * 真源是 `agent/protocol`（Kotlin `@Serializable`）。本包是它的镜像，两侧通过 `conformance/`
 * 下的共享 JSON fixture 做一致性校验（见 `tests/unit/protocol-conformance.test.ts` 与
 * `agent/protocol` 的 `ConformanceTest`）。
 *
 * 修改协议的流程：先改 `docs/protocol/kap-v1.md` 与 Kotlin 真源，再改本包，最后更新 fixture。
 */

export * from './version'
export * from './errors'
export * from './primitives'
export * from './events'
export * from './frames'
export * from './methods'

export * from './domain/approval'
export * from './domain/plugin'
export * from './domain/project'
export * from './domain/provider'
export * from './domain/run'
export * from './domain/server'
export * from './domain/settings'
export * from './domain/thread'
export * from './domain/workspace'

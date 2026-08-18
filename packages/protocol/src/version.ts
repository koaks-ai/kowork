/**
 * KAP 版本协商。
 *
 * 旧的 `@kowork/contracts` 用 `z.literal(PROTOCOL_VERSION)` 校验版本，任何不匹配都会直接
 * parse 失败，没有协商余地。KoWork 现在要面对「客户端和远程 server 由用户各自升级」的现实，
 * 因此改为区间协商：双方各自声明支持的最小/最大版本，取交集的最大值。
 */

/** 当前实现所对应的协议版本。 */
export const KAP_VERSION = 1 as const

/** 本实现能接受的最低协议版本。 */
export const KAP_MIN_VERSION = 1

/** 本实现能接受的最高协议版本。 */
export const KAP_MAX_VERSION = 1

export interface VersionRange {
  minVersion: number
  maxVersion: number
}

export const LOCAL_VERSION_RANGE: VersionRange = {
  minVersion: KAP_MIN_VERSION,
  maxVersion: KAP_MAX_VERSION
}

/**
 * 取两个版本区间的交集上界。无交集时返回 `null`，调用方应回 `unsupported_protocol_version`
 * 并把自己的区间告知对端，便于用户判断该升级哪一侧。
 */
export function negotiateVersion(
  remote: VersionRange,
  local: VersionRange = LOCAL_VERSION_RANGE
): number | null {
  const min = Math.max(remote.minVersion, local.minVersion)
  const max = Math.min(remote.maxVersion, local.maxVersion)
  return min <= max ? max : null
}

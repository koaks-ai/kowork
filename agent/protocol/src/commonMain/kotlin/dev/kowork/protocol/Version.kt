package dev.kowork.protocol

/**
 * KAP 版本协商。
 *
 * 旧的 TS `@kowork/contracts` 用 `z.literal(PROTOCOL_VERSION)` 校验版本，任何不匹配都直接
 * parse 失败，没有协商余地。KoWork 现在要面对「客户端与远程 server 由用户各自升级」的现实，
 * 因此改为区间协商：双方各自声明支持的最小/最大版本，取交集的最大值。
 */
public object KapVersion {
    /** 当前实现所对应的协议版本。 */
    public const val CURRENT: Int = 1

    /** 本实现能接受的最低协议版本。 */
    public const val MIN: Int = 1

    /** 本实现能接受的最高协议版本。 */
    public const val MAX: Int = 1

    /**
     * 取两个版本区间的交集上界。无交集时返回 `null`，此时 server 应回 `fatal` 帧并附带
     * `unsupported_protocol_version`，把自己的区间告知客户端，便于用户判断该升级哪一侧。
     */
    public fun negotiate(
        remoteMin: Int,
        remoteMax: Int,
        localMin: Int = MIN,
        localMax: Int = MAX
    ): Int? {
        val min = maxOf(remoteMin, localMin)
        val max = minOf(remoteMax, localMax)
        return if (min <= max) max else null
    }
}

# KoWork Agent Native Spike

这是阶段 3 的 macOS Arm 前置纵切，目的是验证 Ktor CIO WebSocket、kmp-process、SQLDelight
Native driver 与 Koaks Agent 能在同一个 Native binary 中共存。模块长期保留为回归门，但不属于
正式 Agent Server，也不应被生产模块依赖。

当前只实现 KAP 的 `hello/welcome` 与 `runs.enqueue` 子集。请求使用合成的 `spike-thread`，事件
使用内存数据库先写后发；没有正式队列、审批、权限、恢复、多客户端广播、Provider、插件或远程
部署能力。脚本模型会确定性地产生一次 `read_file` 调用，测试不需要 API Key 或网络。

## 构建

```bash
./agent/gradlew -p agent \
  -PkoaksDir=/Users/atri/DevLab/Kotlin/koaks \
  :spike:macosArmTest

./agent/gradlew -p agent \
  -PkoaksDir=/Users/atri/DevLab/Kotlin/koaks \
  :spike:verifyMacosArmSpike
```

也可以设置 `KOAKS_DIR`。Spike 使用仅供 composite substitution 的本地版本选择器；未配置本地
Koaks 时不会回退到 Maven Central。release executable 位于
`agent/spike/build/bin/macosArm/releaseExecutable/kowork-agent-spike.kexe`。

入口支持 `self-test` 和 `serve`。`serve` 只监听 `127.0.0.1`：

```text
kowork-agent-spike.kexe self-test
kowork-agent-spike.kexe serve --project-root <绝对路径> --read-path README.md --token dev --port 8765
```

`self-test` 是当前验收入口；其它 KAP 方法会返回 `method_not_implemented`，不要把这个行为当作
阶段 3f 的协议实现。

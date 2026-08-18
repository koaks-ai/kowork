package dev.kowork.protocol

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * KAP v1 跨语言一致性测试。
 *
 * 用例来自 `conformance/kap-v1-cases.json`，由 Gradle 任务 `generateConformanceFixtures`
 * 编译进 [KAP_V1_CASES_JSON]。TS 侧的 `tests/unit/protocol-conformance.test.ts` 读的是**同一份**
 * 文件。两侧必须对每条用例得出相同的 accept / reject 结论 —— 这是防止「真源在 Kotlin、镜像在 TS」
 * 这两份定义悄悄漂移的唯一机制。
 */
class ConformanceTest {

    @Serializable
    private data class ConformanceCase(
        val name: String,
        val schema: String,
        val method: String? = null,
        val expect: String,
        val note: String? = null,
        val value: JsonElement
    )

    @Serializable
    private data class ConformanceFile(
        val protocolVersion: Int,
        val description: String,
        val cases: List<ConformanceCase>
    )

    /** 用例文件本身用一个宽松的 Json 读取；被测数据一律走 [KapJson]。 */
    private val fixtureJson = Json { ignoreUnknownKeys = true }

    private val file: ConformanceFile =
        fixtureJson.decodeFromString(ConformanceFile.serializer(), KAP_V1_CASES_JSON)

    private fun serializerFor(case: ConformanceCase): KSerializer<*> = when (case.schema) {
        "clientFrame" -> ClientFrame.serializer()
        "serverFrame" -> ServerFrame.serializer()
        "event" -> KapEvent.serializer()
        "methodInput", "methodOutput" -> {
            val name = case.method ?: fail("用例 ${case.name} 缺少 method 字段")
            val method = KapMethod.fromName(name)
                ?: fail("用例 ${case.name} 引用了未知方法 '$name'")
            if (case.schema == "methodInput") method.paramsSerializer() else method.resultSerializer()
        }
        else -> fail("用例 ${case.name} 使用了未知的 schema 选择器 '${case.schema}'")
    }

    /**
     * 解析一条用例。
     *
     * 捕获 [Throwable] 而不是某个具体异常类型：结构错误来自
     * `SerializationException`，而不变量校验来自 `init` 块里 `require` 抛出的
     * `IllegalArgumentException`。对「这条用例该不该被接受」而言两者等价。
     */
    private fun tryDecode(case: ConformanceCase): Result<Any?> = runCatching {
        KapJson.decodeFromJsonElement(serializerFor(case), case.value)
    }

    @Test
    fun 用例文件声明的协议版本与实现一致() {
        assertEquals(KapVersion.CURRENT, file.protocolVersion)
    }

    @Test
    fun 用例名唯一且非空() {
        assertTrue(file.cases.isNotEmpty(), "用例文件为空")
        val names = file.cases.map { it.name }
        assertEquals(names.size, names.toSet().size, "存在重名用例")
    }

    @Test
    fun 全部accept用例都能解析() {
        val failures = file.cases
            .filter { it.expect == "accept" }
            .mapNotNull { case ->
                tryDecode(case).exceptionOrNull()?.let { "${case.name}: ${it.message}" }
            }
        assertTrue(failures.isEmpty(), "以下用例本应通过但解析失败：\n${failures.joinToString("\n")}")
    }

    @Test
    fun 全部reject用例都被拒绝() {
        val leaks = file.cases
            .filter { it.expect == "reject" }
            .filter { tryDecode(it).isSuccess }
            .map { it.name }
        assertTrue(leaks.isEmpty(), "以下用例本应被拒绝却通过了：\n${leaks.joinToString("\n")}")
    }

    /**
     * 每种事件类型都必须有 accept 用例。
     *
     * 这条同时守住了两件事：[KapEventTypes.ALL] 里的名字确实出现在用例文件里；而这些用例能通过
     * [KapEvent] 的密封序列化器解析，说明各实现上的 `@SerialName` 与这份清单一致。
     */
    @Test
    fun 每种事件类型都至少有一条accept用例() {
        val covered = file.cases
            .filter { it.schema == "event" && it.expect == "accept" }
            .mapNotNull { case ->
                (case.value as? kotlinx.serialization.json.JsonObject)
                    ?.get("type")
                    ?.let { it as? kotlinx.serialization.json.JsonPrimitive }
                    ?.content
            }
            .toSet()
        val missing = KapEventTypes.ALL.filterNot { it in covered }
        assertTrue(missing.isEmpty(), "以下事件类型缺少 accept 用例：$missing")
    }

    @Test
    fun 已移除旧协议里从未被publish的coreRecovered() {
        assertTrue("core.recovered" !in KapEventTypes.ALL)
    }

    @Test
    fun 事件名与方法名统一为域点驼峰动作() {
        val pattern = Regex("^[a-z]+\\.[a-z][a-zA-Z]*$")
        val badEvents = KapEventTypes.ALL.filterNot { pattern.matches(it) }
        assertTrue(badEvents.isEmpty(), "事件名不符合命名规范：$badEvents")
        val badMethods = KapMethod.entries.map { it.methodName }.filterNot { pattern.matches(it) }
        assertTrue(badMethods.isEmpty(), "方法名不符合命名规范：$badMethods")
    }

    @Test
    fun 方法名唯一() {
        val names = KapMethod.entries.map { it.methodName }
        assertEquals(names.size, names.toSet().size, "存在重复的方法名")
    }

    /**
     * accept 用例必须能编码回去再解析出等价对象。
     *
     * 这一条能抓住 optional / nullable 的编码语义错误：如果给某个 TS `.nullable()` 字段错误地
     * 加了 Kotlin 默认值，编码时该字段会被 `encodeDefaults = false` 省略，往返后就不再等价。
     */
    @Test
    fun accept用例往返稳定() {
        val failures = mutableListOf<String>()
        for (case in file.cases.filter { it.expect == "accept" }) {
            @Suppress("UNCHECKED_CAST")
            val serializer = serializerFor(case) as KSerializer<Any?>
            val first = KapJson.decodeFromJsonElement(serializer, case.value)
            val encoded = KapJson.encodeToJsonElement(serializer, first)
            val second = runCatching { KapJson.decodeFromJsonElement(serializer, encoded) }
            when {
                second.isFailure ->
                    failures += "${case.name}: 重新解析失败 ${second.exceptionOrNull()?.message}"
                second.getOrNull() != first ->
                    failures += "${case.name}: 往返后不等价\n  原始=$first\n  往返=${second.getOrNull()}"
            }
        }
        assertTrue(failures.isEmpty(), "往返不稳定：\n${failures.joinToString("\n")}")
    }
}

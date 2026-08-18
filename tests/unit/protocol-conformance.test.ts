import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  EVENT_TYPES,
  METHOD_NAMES,
  clientFrameSchema,
  eventSchema,
  isMethodName,
  methodSpec,
  serverFrameSchema
} from '../../packages/protocol/src/index'

/**
 * KAP v1 跨语言一致性测试。
 *
 * `conformance/kap-v1-cases.json` 是 TS 与 Kotlin 两侧共用的**同一份**用例。Kotlin 侧的
 * `agent/protocol` 有一个等价的 ConformanceTest 读取同一个文件。两侧必须对每条用例得出相同的
 * accept / reject 结论 —— 这是防止「协议真源在 Kotlin，镜像在 TS」这两份定义悄悄漂移的唯一机制。
 *
 * 新增或修改协议时，用例文件必须同步更新，否则两侧的测试都会失败。
 */

interface ConformanceCase {
  name: string
  schema: 'clientFrame' | 'serverFrame' | 'event' | 'methodInput' | 'methodOutput'
  method?: string
  expect: 'accept' | 'reject'
  note?: string
  value: unknown
}

interface ConformanceFile {
  protocolVersion: number
  description: string
  cases: ConformanceCase[]
}

const CASES_PATH = join(process.cwd(), 'conformance', 'kap-v1-cases.json')

const file: ConformanceFile = JSON.parse(readFileSync(CASES_PATH, 'utf8')) as ConformanceFile

function schemaFor(testCase: ConformanceCase): z.ZodTypeAny {
  switch (testCase.schema) {
    case 'clientFrame':
      return clientFrameSchema
    case 'serverFrame':
      return serverFrameSchema
    case 'event':
      return eventSchema
    case 'methodInput':
    case 'methodOutput': {
      const method = testCase.method
      if (!method || !isMethodName(method)) {
        throw new Error(`用例 ${testCase.name} 引用了未知方法 '${method}'`)
      }
      const spec = methodSpec(method)
      return testCase.schema === 'methodInput' ? spec.input : spec.output
    }
  }
}

describe('KAP v1 一致性用例', () => {
  it('用例文件声明的协议版本与实现一致', () => {
    expect(file.protocolVersion).toBe(1)
  })

  it('用例文件非空', () => {
    expect(file.cases.length).toBeGreaterThan(0)
  })

  it('用例名唯一', () => {
    const names = file.cases.map((testCase) => testCase.name)
    expect(new Set(names).size).toBe(names.length)
  })

  for (const testCase of file.cases) {
    const label = testCase.note ? `${testCase.name} — ${testCase.note}` : testCase.name

    if (testCase.expect === 'accept') {
      it(`接受 ${label}`, () => {
        const result = schemaFor(testCase).safeParse(testCase.value)
        if (!result.success) {
          throw new Error(
            `用例 ${testCase.name} 本应通过，实际失败：\n${JSON.stringify(result.error.issues, null, 2)}`
          )
        }
      })

      it(`往返稳定 ${testCase.name}`, () => {
        const schema = schemaFor(testCase)
        const first = schema.parse(testCase.value)
        const second = schema.parse(JSON.parse(JSON.stringify(first)))
        expect(second).toStrictEqual(first)
      })
    } else {
      it(`拒绝 ${label}`, () => {
        const result = schemaFor(testCase).safeParse(testCase.value)
        expect(result.success).toBe(false)
      })
    }
  }
})

describe('KAP v1 协议面完整性', () => {
  it('每种事件类型都至少有一条 accept 用例', () => {
    const covered = new Set<string>()
    for (const testCase of file.cases) {
      if (testCase.schema !== 'event' || testCase.expect !== 'accept') continue
      const type = (testCase.value as { type?: unknown }).type
      if (typeof type === 'string') covered.add(type)
    }
    const missing = EVENT_TYPES.filter((type) => !covered.has(type))
    expect(missing).toStrictEqual([])
  })

  it('已移除旧协议里从未被 publish 的 core.recovered', () => {
    expect(EVENT_TYPES as readonly string[]).not.toContain('core.recovered')
  })

  it('事件类型命名统一为 <域>.<驼峰动作>', () => {
    const offenders = EVENT_TYPES.filter((type) => !/^[a-z]+\.[a-z][a-zA-Z]*$/.test(type))
    expect(offenders).toStrictEqual([])
  })

  it('方法名命名统一为 <域>.<驼峰动作>', () => {
    const offenders = METHOD_NAMES.filter((name) => !/^[a-z]+\.[a-z][a-zA-Z]*$/.test(name))
    expect(offenders).toStrictEqual([])
  })

  it('能力位门控的方法都被标注了 capability', () => {
    // 这些方法在阶段 3f / 阶段 5 才实现，客户端必须先做能力探测再暴露入口。
    const gated = [
      'fs.browse',
      'files.upload',
      'auth.rotateKey',
      'plugins.list',
      'plugins.install',
      'plugins.uninstall',
      'plugins.setEnabled',
      'plugins.reload'
    ] as const
    for (const method of gated) {
      expect(methodSpec(method).capability, `${method} 缺少 capability 标注`).toBeDefined()
    }
  })

  it('只读方法不得标记为 mutating', () => {
    const readOnly = [
      'server.info',
      'app.bootstrap',
      'projects.list',
      'threads.list',
      'runs.list',
      'runs.queue',
      'events.list',
      'approvals.list',
      'providers.list',
      'settings.get',
      'files.list',
      'files.read',
      'fs.browse',
      'git.status',
      'git.summary',
      'git.diff',
      'plugins.list'
    ] as const
    for (const method of readOnly) {
      expect(methodSpec(method).mutating, `${method} 被错误标记为 mutating`).toBe(false)
    }
  })
})

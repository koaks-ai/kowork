import { mkdtemp, mkdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import type { HookExecutionContext, JsonValue, ToolExecutionContext } from '@koaks/node'
import type { ProjectDto, RunDto, ThreadDto } from '@kowork/contracts'
import { ApprovalService } from '../../packages/core/src/application/approval-service'
import { CoreEventBus } from '../../packages/core/src/application/event-bus'
import { AppDatabase } from '../../packages/core/src/infrastructure/db/database'
import { GitService } from '../../packages/core/src/infrastructure/git/git-service'
import { CommandRunner } from '../../packages/core/src/infrastructure/shell/command-runner'
import { FileService } from '../../packages/core/src/infrastructure/workspace/file-service'
import { coreToolSpecs } from '../../packages/core/src/tools/catalog'
import { ProjectToolLocks } from '../../packages/core/src/tools/tool-lock'
import { ToolRegistry } from '../../packages/core/src/tools/tool-registry'
import { defineTool } from '../../packages/core/src/tools/tool-spec'

interface RegistryFixture {
  root: string
  projectRoot: string
  database: AppDatabase
  approvals: ApprovalService
  project: ProjectDto
  thread: ThreadDto
  run: RunDto
  registry: ToolRegistry
}

async function fixture(permissionMode: 'ask' | 'auto' | 'yolo' = 'auto'): Promise<RegistryFixture> {
  const root = await mkdtemp(join(tmpdir(), 'kowork-registry-'))
  const requestedProjectRoot = join(root, 'project')
  await mkdir(requestedProjectRoot)
  const projectRoot = await realpath(requestedProjectRoot)
  const database = new AppDatabase(join(root, 'kowork.sqlite'))
  const events = new CoreEventBus(database)
  const approvals = new ApprovalService(database, events)
  const project = database.addProject(projectRoot, 'project')
  const thread = database.createThread(project.id, 'Registry', 'openai-gpt-4.1-mini', permissionMode)
  const request = database.enqueueRequest(thread, 'test tools', 32_000)
  const run = database.createRun(request)
  const registry = new ToolRegistry(
    coreToolSpecs(),
    {
      project,
      files: new FileService(),
      commands: new CommandRunner(),
      git: new GitService()
    },
    database,
    approvals
  )
  return { root, projectRoot, database, approvals, project, thread, run, registry }
}

function call(
  name: string,
  argumentsValue: Record<string, unknown> = {}
): Record<string, JsonValue> {
  return {
    call: {
      id: `call-${name}`,
      name,
      argumentsJson: JSON.stringify(argumentsValue)
    }
  }
}

function execution(runId?: string): HookExecutionContext {
  return {
    ...(runId ? { correlationId: runId } : {}),
    signal: new AbortController().signal
  }
}

function toolExecutionContext(): ToolExecutionContext {
  return {
    executionId: 'execution-test',
    callId: 'call-test',
    toolName: 'deadline_test',
    signal: new AbortController().signal,
    runtime: {},
    reportProgress: async () => undefined
  } as unknown as ToolExecutionContext
}

describe('ToolRegistry', () => {
  it('rejects duplicate names and emits definitions in stable name order', async () => {
    const setup = await fixture()
    try {
      const definitions = setup.registry.definitions()
      expect(definitions.map((definition) => definition.name)).toEqual(
        [...definitions.map((definition) => definition.name)].sort()
      )
      expect(
        () =>
          new ToolRegistry(
            [coreToolSpecs()[0]!, coreToolSpecs()[0]!],
            {
              project: setup.project,
              files: new FileService(),
              commands: new CommandRunner(),
              git: new GitService()
            },
            setup.database,
            setup.approvals
          )
      ).toThrowError(expect.objectContaining({ code: 'duplicate_tool' }))
    } finally {
      setup.approvals.close()
      setup.database.close()
    }
  })

  it('uses the same Zod schema for JSON Schema and local validation', async () => {
    const setup = await fixture()
    try {
      const definition = setup.registry
        .definitions()
        .find((candidate) => candidate.name === 'list_files')!
      expect(definition.inputSchema).toMatchObject({
        type: 'object',
        properties: {
          limit: expect.objectContaining({ default: 200, maximum: 500 })
        }
      })
      await expect(definition.execute({ limit: 0 }, {} as never)).rejects.toMatchObject({
        code: 'invalid_tool_input',
        message: expect.stringContaining('[invalid_tool_input]')
      })
    } finally {
      setup.approvals.close()
      setup.database.close()
    }
  })

  it('denies unknown, uncorrelated, and undeclared access by default', async () => {
    const setup = await fixture()
    try {
      const beforeTool = setup.registry.hook().beforeTool!
      await expect(beforeTool(call('missing_tool'), execution())).resolves.toMatchObject({
        action: 'deny'
      })
      await expect(beforeTool(call('git_status'), execution())).resolves.toMatchObject({
        action: 'deny',
        reason: expect.stringContaining('missing_run_correlation')
      })

      const unsafe = defineTool({
        name: 'unsafe',
        description: 'test fixture',
        inputSchema: z.object({}),
        hasSideEffects: false,
        fileAccess: null,
        shellAccess: false,
        lockMode: 'read',
        timeoutMs: 1_000,
        maxOutputChars: 1_000,
        prepare: (input) => ({
          input,
          access: [
            {
              kind: 'path',
              path: setup.projectRoot,
              mode: 'read',
              directory: true,
              title: 'unsafe',
              detail: 'unsafe'
            }
          ]
        }),
        execute: () => 'unused',
        format: (output) => output
      })
      const unsafeRegistry = new ToolRegistry(
        [unsafe],
        {
          project: setup.project,
          files: new FileService(),
          commands: new CommandRunner(),
          git: new GitService()
        },
        setup.database,
        setup.approvals
      )
      await expect(
        unsafeRegistry.hook().beforeTool!(call('unsafe'), execution(setup.run.id))
      ).resolves.toMatchObject({
        action: 'deny',
        reason: expect.stringContaining('undeclared_tool_access')
      })
    } finally {
      setup.approvals.close()
      setup.database.close()
    }
  })

  it('reads the current thread permission mode for every tool call', async () => {
    const setup = await fixture('auto')
    try {
      const beforeTool = setup.registry.hook().beforeTool!
      await expect(
        beforeTool(
          call('write_file', { path: 'first.txt', content: 'first' }),
          execution(setup.run.id)
        )
      ).resolves.toMatchObject({ action: 'replace' })
      expect(setup.database.listApprovals(setup.thread.id, true)).toHaveLength(0)

      setup.database.updateThread(setup.thread.id, { permissionMode: 'ask' })
      const authorization = beforeTool(
        call('write_file', { path: 'second.txt', content: 'second' }),
        execution(setup.run.id)
      )
      await expect.poll(() => setup.database.listApprovals(setup.thread.id, true).length).toBe(1)
      const approval = setup.database.listApprovals(setup.thread.id, true)[0]!
      expect(approval.requestedAccess).toBe('write')
      setup.approvals.respond(approval.id, 'allow')
      await expect(authorization).resolves.toMatchObject({ action: 'replace' })
    } finally {
      setup.approvals.close()
      setup.database.close()
    }
  })

  it('enforces a hard deadline even when execution ignores cancellation', async () => {
    const setup = await fixture()
    try {
      const delayed = defineTool({
        name: 'deadline_test',
        description: 'deadline fixture',
        inputSchema: z.object({}),
        hasSideEffects: false,
        fileAccess: null,
        shellAccess: false,
        lockMode: 'read',
        timeoutMs: 25,
        maxOutputChars: 1_000,
        prepare: (input) => ({ input, access: [] }),
        execute: async () =>
          await new Promise<string>((resolve) => setTimeout(() => resolve('late'), 250)),
        format: (output) => output
      })
      const registry = new ToolRegistry(
        [delayed],
        {
          project: setup.project,
          files: new FileService(),
          commands: new CommandRunner(),
          git: new GitService()
        },
        setup.database,
        setup.approvals
      )
      const definition = registry.definitions()[0]!
      const startedAt = Date.now()
      await expect(definition.execute({}, toolExecutionContext())).rejects.toMatchObject({
        code: 'tool_timed_out'
      })
      expect(Date.now() - startedAt).toBeLessThan(200)
    } finally {
      setup.approvals.close()
      setup.database.close()
    }
  })

  it('includes project lock wait time in the tool deadline', async () => {
    const setup = await fixture()
    let releaseBlock: (() => void) | undefined
    let holding: Promise<void> | undefined
    try {
      const locks = new ProjectToolLocks()
      const blocked = new Promise<void>((resolve) => {
        releaseBlock = resolve
      })
      let markAcquired: (() => void) | undefined
      const acquired = new Promise<void>((resolve) => {
        markAcquired = resolve
      })
      holding = locks.withLock(
        setup.project.id,
        'write',
        new AbortController().signal,
        async () => {
          markAcquired?.()
          await blocked
        }
      )
      await acquired
      const waiting = defineTool({
        name: 'deadline_test',
        description: 'lock deadline fixture',
        inputSchema: z.object({}),
        hasSideEffects: false,
        fileAccess: null,
        shellAccess: false,
        lockMode: 'read',
        timeoutMs: 25,
        maxOutputChars: 1_000,
        prepare: (input) => ({ input, access: [] }),
        execute: () => 'unreachable',
        format: (output) => output
      })
      const registry = new ToolRegistry(
        [waiting],
        {
          project: setup.project,
          files: new FileService(),
          commands: new CommandRunner(),
          git: new GitService()
        },
        setup.database,
        setup.approvals,
        locks
      )
      const definition = registry.definitions()[0]!
      const startedAt = Date.now()
      await expect(definition.execute({}, toolExecutionContext())).rejects.toMatchObject({
        code: 'tool_timed_out'
      })
      expect(Date.now() - startedAt).toBeLessThan(200)
    } finally {
      releaseBlock?.()
      await holding
      setup.approvals.close()
      setup.database.close()
    }
  })

  it('allows concurrent readers while keeping writers exclusive', async () => {
    const locks = new ProjectToolLocks()
    const events: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const signal = new AbortController().signal
    const first = locks.withLock('project-lock-test', 'read', signal, async () => {
      events.push('read-1')
      await firstBlocked
    })
    await expect.poll(() => events).toEqual(['read-1'])

    const second = locks.withLock('project-lock-test', 'read', signal, async () => {
      events.push('read-2')
    })
    const writer = locks.withLock('project-lock-test', 'write', signal, async () => {
      events.push('write')
    })
    await second
    expect(events).toEqual(['read-1', 'read-2'])
    releaseFirst?.()
    await first
    await writer
    expect(events).toEqual(['read-1', 'read-2', 'write'])
  })
})

import type {
  HookDefinition,
  HookExecutionContext,
  JsonSchema,
  JsonValue,
  ToolCall,
  ToolDecision,
  ToolDefinition,
  ToolExecutionContext
} from '@koaks/node'
import { z } from 'zod'
import { CoreError } from '../domain/errors'
import type { ApprovalService } from '../application/approval-service'
import type { AppDatabase } from '../infrastructure/db/database'
import { DEFAULT_TOOL_OUTPUT_LIMIT, limitToolOutput } from './tool-result'
import { ProjectToolLocks } from './tool-lock'
import type { PreparedToolCall, ToolDependencies, ToolSpec } from './tool-spec'

function validateDeclaredAccess(spec: ToolSpec, prepared: PreparedToolCall): void {
  for (const access of prepared.access) {
    if (access.kind === 'shell') {
      if (!spec.shellAccess) {
        throw new CoreError(
          'undeclared_tool_access',
          `Tool '${spec.name}' requested undeclared Shell access`
        )
      }
      continue
    }
    if (!spec.fileAccess || (access.mode === 'write' && spec.fileAccess !== 'write')) {
      throw new CoreError(
        'undeclared_tool_access',
        `Tool '${spec.name}' requested undeclared ${access.mode} file access`
      )
    }
  }
}

function callFrom(context: Record<string, JsonValue>): ToolCall {
  const call = context.call
  if (
    call === null ||
    typeof call !== 'object' ||
    Array.isArray(call) ||
    typeof call.id !== 'string' ||
    typeof call.name !== 'string' ||
    typeof call.argumentsJson !== 'string'
  ) {
    throw new CoreError('invalid_tool_context', 'Koaks did not provide a valid tool call')
  }
  return call as unknown as ToolCall
}

function rawArguments(call: ToolCall): unknown {
  try {
    return call.argumentsJson.trim() ? JSON.parse(call.argumentsJson) : {}
  } catch {
    throw new CoreError('invalid_tool_input', `Tool '${call.name}' arguments are not valid JSON`)
  }
}

function replaceCall(call: ToolCall, prepared: PreparedToolCall): ToolDecision {
  return {
    action: 'replace',
    call: { ...call, argumentsJson: JSON.stringify(prepared.input) }
  }
}

async function withDeadline<T>(
  parentSignal: AbortSignal,
  timeoutMs: number,
  block: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  if (parentSignal.aborted) {
    throw new CoreError(
      'tool_cancelled',
      typeof parentSignal.reason === 'string' ? parentSignal.reason : 'Tool call was cancelled'
    )
  }
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abortParent: (() => void) | undefined
  const interrupted = new Promise<never>((_resolve, reject) => {
    abortParent = (): void => {
      const error = new CoreError(
        'tool_cancelled',
        typeof parentSignal.reason === 'string' ? parentSignal.reason : 'Tool call was cancelled'
      )
      reject(error)
      controller.abort(error)
    }
    parentSignal.addEventListener('abort', abortParent, { once: true })
    if (parentSignal.aborted) abortParent()

    timer = setTimeout(() => {
      const error = new CoreError('tool_timed_out', `Tool execution exceeded ${timeoutMs} ms`)
      reject(error)
      controller.abort(error)
    }, timeoutMs)
  })
  const execution = Promise.resolve().then(async () => await block(controller.signal))
  try {
    return await Promise.race([execution, interrupted])
  } finally {
    if (timer) clearTimeout(timer)
    if (abortParent) parentSignal.removeEventListener('abort', abortParent)
  }
}

function assertToolActive(signal: AbortSignal): void {
  if (!signal.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new CoreError(
    'tool_cancelled',
    typeof signal.reason === 'string' ? signal.reason : 'Tool call was cancelled'
  )
}

export class ToolRegistry {
  private readonly specs: ToolSpec[]
  private readonly byName: Map<string, ToolSpec>

  constructor(
    specs: ToolSpec[],
    private readonly dependencies: ToolDependencies,
    private readonly database: AppDatabase,
    private readonly approvals: ApprovalService,
    private readonly locks = new ProjectToolLocks()
  ) {
    this.specs = [...specs].sort((left, right) =>
      left.name === right.name ? 0 : left.name < right.name ? -1 : 1
    )
    this.byName = new Map()
    for (const spec of this.specs) {
      if (!/^[a-z][a-z0-9_]*$/u.test(spec.name) || !spec.description.trim()) {
        throw new CoreError('invalid_tool_spec', `Tool '${spec.name}' has invalid metadata`)
      }
      if (
        !Number.isSafeInteger(spec.timeoutMs) ||
        spec.timeoutMs <= 0 ||
        !Number.isSafeInteger(spec.maxOutputChars) ||
        spec.maxOutputChars <= 0 ||
        spec.maxOutputChars > DEFAULT_TOOL_OUTPUT_LIMIT
      ) {
        throw new CoreError('invalid_tool_spec', `Tool '${spec.name}' has invalid execution limits`)
      }
      if (this.byName.has(spec.name)) {
        throw new CoreError('duplicate_tool', `Tool '${spec.name}' is registered more than once`)
      }
      this.byName.set(spec.name, spec)
    }
  }

  definitions(): ToolDefinition<Record<string, unknown>>[] {
    return this.specs.map((spec) => ({
      name: spec.name,
      description: spec.description,
      inputSchema: z.toJSONSchema(spec.inputSchema, {
        target: 'draft-7',
        io: 'input'
      }) as unknown as JsonSchema,
      hasSideEffects: spec.hasSideEffects,
      execute: async (rawInput, context) => await this.execute(spec, rawInput, context)
    }))
  }

  hook(): HookDefinition {
    return { beforeTool: (context, execution) => this.authorize(context, execution) }
  }

  private applicationRun(execution: HookExecutionContext): { runId: string; threadId: string } {
    const runId = execution.correlationId
    if (!runId)
      throw new CoreError('missing_run_correlation', 'Tool call has no application run ID')
    const run = this.database.getRun(runId)
    const thread = this.database.getThread(run.threadId)
    if (thread.projectId !== this.dependencies.project.id) {
      throw new CoreError('run_project_mismatch', `Run '${runId}' does not belong to this project`)
    }
    return { runId, threadId: thread.id }
  }

  private async authorize(
    context: Record<string, JsonValue>,
    execution: HookExecutionContext
  ): Promise<ToolDecision> {
    const call = callFrom(context)
    const spec = this.byName.get(call.name)
    if (!spec) return { action: 'deny', reason: `Tool '${call.name}' is not registered` }

    try {
      const active = this.applicationRun(execution)
      const thread = this.database.getThread(active.threadId)
      const parsed = spec.parse(rawArguments(call))
      const prepared = await spec.prepare(parsed, this.dependencies)
      validateDeclaredAccess(spec, prepared)
      for (const access of prepared.access) {
        if (access.kind === 'path') {
          await this.approvals.authorizePath({
            project: this.dependencies.project,
            thread,
            runId: active.runId,
            targetPath: access.path,
            targetIsDirectory: access.directory,
            access: access.mode,
            title: access.title,
            detail: access.detail,
            signal: execution.signal
          })
        } else {
          await this.approvals.authorizeShell({
            project: this.dependencies.project,
            thread,
            runId: active.runId,
            command: access.command,
            cwd: access.cwd,
            signal: execution.signal
          })
        }
      }
      return replaceCall(call, prepared)
    } catch (error) {
      if (execution.signal.aborted) throw error
      const coreError =
        error instanceof CoreError
          ? error
          : new CoreError('tool_authorization_failed', String(error))
      return { action: 'deny', reason: `[${coreError.code}] ${coreError.message}` }
    }
  }

  private async execute(
    spec: ToolSpec,
    rawInput: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<string | JsonValue> {
    try {
      const input = spec.parse(rawInput)
      return await withDeadline(
        context.signal,
        spec.timeoutMs,
        async (signal) =>
          await this.locks.withLock(
            this.dependencies.project.id,
            spec.lockMode,
            signal,
            async () => {
              assertToolActive(signal)
              const output = await spec.execute(
                input,
                {
                  signal,
                  reportProgress: async (progress) => {
                    assertToolActive(signal)
                    await context.reportProgress(progress)
                    assertToolActive(signal)
                  }
                },
                this.dependencies
              )
              assertToolActive(signal)
              return limitToolOutput(spec.format(output), spec.maxOutputChars)
            }
          )
      )
    } catch (error) {
      if (error instanceof CoreError && !error.message.startsWith(`[${error.code}]`)) {
        throw new CoreError(error.code, `[${error.code}] ${error.message}`, error.details)
      }
      if (!(error instanceof CoreError)) {
        throw new CoreError(
          'tool_execution_failed',
          `[tool_execution_failed] ${error instanceof Error ? error.message : String(error)}`
        )
      }
      throw error
    }
  }
}

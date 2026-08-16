import type {
  AgentConfig,
  AgentEvent,
  HookExecutionContext,
  JsonValue,
  KoaksAgent,
  KoaksRuntime,
  ModelItem,
  ModelProvider,
  ToolCall,
  ToolDecision,
  ToolDefinition
} from '@koaks/node'
import type {
  ModelProfileDto,
  ProjectDto,
  ProviderDto,
  QueuedRequestDto,
  ThreadDto
} from '@kowork/contracts'
import { CoreError } from '../../domain/errors'
import { selectRecentTurnCount, shouldCompress } from '../../domain/compression-policy'
import {
  createFallbackThreadTitle,
  MAX_GENERATED_THREAD_TITLE_LENGTH,
  normalizeGeneratedThreadTitle
} from '../../domain/thread-title'
import type { ApprovalService } from '../../application/approval-service'
import type { CoreEventBus } from '../../application/event-bus'
import type { AppDatabase } from '../db/database'
import type { FileService } from '../workspace/file-service'
import type { CommandRunner } from '../shell/command-runner'
import type { GitService } from '../git/git-service'
import type { CredentialProvider } from '../credentials/credential-provider'
import { resolveProjectPath } from '../workspace/path-policy'
import { PersistentThreadMemory } from './persistent-memory'
import type { AgentRuntimePort, AgentStreamEvent } from './runtime-port'

function estimateTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(value, 'utf8') / 3)
}

async function providerFor(
  profile: ModelProfileDto,
  provider: ProviderDto,
  credentials: CredentialProvider
): Promise<ModelProvider> {
  if (provider.protocol === 'ollama') {
    return { type: 'ollama', baseUrl: provider.baseUrl, model: profile.model }
  }
  const apiKey = await credentials.get(provider.id)
  if (!apiKey) throw new CoreError('api_key_missing', `Provider '${provider.name}' has no API key`)
  const common = { model: profile.model, baseUrl: provider.baseUrl, apiKey }
  if (provider.protocol === 'openai-responses') return { type: 'openai-responses', ...common }
  if (provider.protocol === 'anthropic') {
    return { type: 'anthropic', maxTokens: 8_192, ...common }
  }
  if (provider.protocol === 'qwen') return { type: 'qwen', ...common }
  return { type: 'openai', ...common }
}

function textFromItems(items: ModelItem[]): string {
  return items
    .map((item) => {
      if (item.type === 'message') {
        return `${item.role}: ${item.content.map((part) => (part.type === 'text' ? part.text : `[${part.type}]`)).join('\n')}`
      }
      if (item.type === 'tool_call') return `tool call ${item.name}: ${item.argumentsJson}`
      if (item.type === 'tool_result') return `tool result: ${item.output}`
      if (item.type === 'reasoning_summary') return `reasoning: ${item.text}`
      return item.displayText
    })
    .join('\n')
}

function toolCallFrom(context: Record<string, JsonValue>): ToolCall {
  const call = context.call
  if (
    call === null ||
    typeof call !== 'object' ||
    Array.isArray(call) ||
    typeof call.id !== 'string' ||
    typeof call.name !== 'string' ||
    typeof call.argumentsJson !== 'string'
  ) {
    throw new CoreError('invalid_tool_context', 'Koaks Hook did not provide a valid tool call')
  }
  return call as unknown as ToolCall
}

function toolArguments(call: ToolCall): Record<string, unknown> {
  try {
    const value = call.argumentsJson.trim() ? (JSON.parse(call.argumentsJson) as unknown) : {}
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  } catch {
    // Report a stable application error below.
  }
  throw new CoreError('invalid_tool_arguments', `Tool '${call.name}' arguments are not an object`)
}

function stringArgument(
  call: ToolCall,
  args: Record<string, unknown>,
  name: string,
  fallback?: string
): string {
  const value = args[name]
  if (typeof value === 'string') return value
  if (value === undefined && fallback !== undefined) return fallback
  throw new CoreError('invalid_tool_arguments', `Tool '${call.name}' requires string '${name}'`)
}

function replaceArguments(
  call: ToolCall,
  args: Record<string, unknown>,
  values: Record<string, string>
): ToolDecision {
  return {
    action: 'replace',
    call: { ...call, argumentsJson: JSON.stringify({ ...args, ...values }) }
  }
}

export class KoaksAgentRuntime implements AgentRuntimePort {
  private runtime?: KoaksRuntime
  private runtimePromise?: Promise<KoaksRuntime>
  private readonly agents = new Map<string, KoaksAgent>()
  private readonly summarizers = new Map<string, KoaksAgent>()
  private readonly titleGenerators = new Map<string, KoaksAgent>()
  private readonly titleGeneratorCreations = new Map<string, Promise<KoaksAgent>>()

  constructor(
    private readonly database: AppDatabase,
    private readonly credentials: CredentialProvider,
    private readonly files: FileService,
    private readonly commands: CommandRunner,
    private readonly git: GitService,
    private readonly approvals: ApprovalService,
    private readonly events: CoreEventBus
  ) {}

  private async getRuntime(): Promise<KoaksRuntime> {
    if (this.runtime) return this.runtime
    if (!this.runtimePromise) {
      this.runtimePromise = import('@koaks/node').then(({ createRuntime }) => {
        const runtime = createRuntime({
          maxConcurrency: 64,
          highWaterMark: 128,
          runEventBufferCapacity: 2_048
        })
        this.runtime = runtime
        return runtime
      })
    }
    try {
      return await this.runtimePromise
    } catch (error) {
      this.runtimePromise = undefined
      throw error
    }
  }

  private toolsFor(project: ProjectDto): ToolDefinition<Record<string, unknown>>[] {
    const files = this.files
    const commands = this.commands
    const git = this.git
    return [
      {
        name: 'list_files',
        description: 'List files and directories in the current project',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } }
        },
        async execute({ path = '.' }) {
          const authorized = await resolveProjectPath(project.rootPath, String(path))
          return await files.listForTool(authorized)
        }
      },
      {
        name: 'read_file',
        description: 'Read a UTF-8 text file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path']
        },
        async execute({ path }) {
          const authorized = await resolveProjectPath(project.rootPath, String(path))
          return await files.readForTool(authorized)
        }
      },
      {
        name: 'search_files',
        description: 'Search text in project files',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' }, path: { type: 'string' } },
          required: ['query']
        },
        async execute({ query, path = '.' }) {
          const authorized = await resolveProjectPath(project.rootPath, String(path))
          return await files.searchForTool(authorized, String(query))
        }
      },
      {
        name: 'apply_patch',
        description: 'Apply a unified diff patch to one file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' }, patch: { type: 'string' } },
          required: ['path', 'patch']
        },
        hasSideEffects: true,
        async execute({ path, patch }) {
          const authorized = await resolveProjectPath(project.rootPath, String(path), true)
          return await files.applyPatchForTool(authorized, String(patch))
        }
      },
      {
        name: 'run_command',
        description: 'Run a shell command in the project or an approved directory',
        inputSchema: {
          type: 'object',
          properties: { command: { type: 'string' }, cwd: { type: 'string' } },
          required: ['command']
        },
        hasSideEffects: true,
        async execute({ command, cwd = project.rootPath }, toolContext) {
          const authorized = await resolveProjectPath(project.rootPath, String(cwd))
          return await commands.run({
            command: String(command),
            cwd: authorized,
            signal: toolContext.signal,
            reportProgress: (progress) => toolContext.reportProgress(progress)
          })
        }
      },
      {
        name: 'git_status',
        description: 'Read git working tree status',
        inputSchema: { type: 'object', properties: {} },
        async execute() {
          return JSON.stringify(await git.status(project))
        }
      },
      {
        name: 'git_diff',
        description: 'Read the current unstaged git diff',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } }
        },
        async execute({ path }) {
          return await git
            .diff(project, path ? String(path) : undefined)
            .then((result) => result.diff)
        }
      }
    ]
  }

  private applicationRun(
    project: ProjectDto,
    execution: HookExecutionContext
  ): { runId: string; thread: ThreadDto } {
    const runId = execution.correlationId
    if (!runId) {
      throw new CoreError(
        'missing_run_correlation',
        `Koaks run '${execution.runId ?? 'unknown'}' has no application correlation ID`
      )
    }
    const run = this.database.getRun(runId)
    const thread = this.database.getThread(run.threadId)
    if (thread.projectId !== project.id) {
      throw new CoreError('run_project_mismatch', `Run '${runId}' does not belong to this project`)
    }
    return { runId, thread }
  }

  private async authorizeTool(
    project: ProjectDto,
    context: Record<string, JsonValue>,
    execution: HookExecutionContext
  ): Promise<ToolDecision> {
    const call = toolCallFrom(context)
    if (
      !['list_files', 'read_file', 'search_files', 'apply_patch', 'run_command'].includes(call.name)
    ) {
      return { action: 'proceed' }
    }

    const args = toolArguments(call)
    const active = this.applicationRun(project, execution)
    try {
      if (call.name === 'run_command') {
        const command = stringArgument(call, args, 'command')
        const cwd = stringArgument(call, args, 'cwd', project.rootPath)
        const authorized = await this.approvals.authorizeShell({
          project,
          ...active,
          command,
          cwd: await resolveProjectPath(project.rootPath, cwd),
          signal: execution.signal
        })
        return replaceArguments(call, args, { cwd: authorized })
      }

      const requestedPath = stringArgument(call, args, 'path', '.')
      const write = call.name === 'apply_patch'
      const authorized = await this.approvals.authorizePath({
        project,
        ...active,
        targetPath: await resolveProjectPath(project.rootPath, requestedPath, write),
        targetIsDirectory: call.name === 'list_files' || call.name === 'search_files',
        write,
        title: write ? '修改文件' : '访问文件',
        detail: `${call.name} ${requestedPath}`,
        signal: execution.signal
      })
      return replaceArguments(call, args, { path: authorized })
    } catch (error) {
      if (error instanceof CoreError && error.code === 'permission_denied') {
        return { action: 'deny', reason: error.message }
      }
      throw error
    }
  }

  private async getAgent(project: ProjectDto, profile: ModelProfileDto): Promise<KoaksAgent> {
    const provider = this.database.getProvider(profile.providerId)
    const key = `${project.id}:${profile.id}:${profile.updatedAt}:${provider.updatedAt}`
    const existing = this.agents.get(key)
    if (existing) return existing
    const runtime = await this.getRuntime()
    const config: AgentConfig = {
      id: `coding-${project.id}-${profile.id}`,
      name: 'KoWork Coding Agent',
      instructions: [
        {
          type: 'static',
          text: `You are KoWork, a pragmatic coding agent. The default workspace is ${project.rootPath}. Inspect before editing, use patches for file changes, and explain failures clearly.`
        }
      ],
      model: await providerFor(profile, provider, this.credentials),
      memory: {
        type: 'custom',
        id: 'kowork-sqlite-memory-v1',
        open: (threadId) => new PersistentThreadMemory(threadId, this.database)
      },
      tools: this.toolsFor(project),
      hooks: [
        {
          beforeTool: (context, execution) => this.authorizeTool(project, context, execution)
        }
      ],
      termination: { maxSteps: 1024 },
      runBudget: { maxTotalSteps: 4096 },
      errorPolicy: { type: 'retry_retriable', maxRetries: 2, delayMs: 800 }
    }
    const agent = await runtime.createAgent(config)
    await agent.prepare()
    this.agents.set(key, agent)
    return agent
  }

  private async getSummarizer(profile: ModelProfileDto): Promise<KoaksAgent> {
    const provider = this.database.getProvider(profile.providerId)
    const key = `${profile.id}:${profile.updatedAt}:${provider.updatedAt}`
    const existing = this.summarizers.get(key)
    if (existing) return existing
    const runtime = await this.getRuntime()
    const agent = await runtime.createAgent({
      id: `summarizer-${profile.id}`,
      name: 'KoWork Context Summarizer',
      instructions:
        'Create a compact, factual coding-session summary. Preserve user goals, architectural decisions, file changes, command outcomes, unresolved errors, and exact identifiers. Do not add advice.',
      model: await providerFor(profile, provider, this.credentials),
      memory: { type: 'none' },
      termination: { maxSteps: 4 }
    })
    this.summarizers.set(key, agent)
    return agent
  }

  private async getTitleGenerator(profile: ModelProfileDto): Promise<KoaksAgent> {
    const provider = this.database.getProvider(profile.providerId)
    const key = `${profile.id}:${profile.updatedAt}:${provider.updatedAt}`
    const existing = this.titleGenerators.get(key)
    if (existing) return existing
    const creating = this.titleGeneratorCreations.get(key)
    if (creating) return await creating

    const creation = (async () => {
      const runtime = await this.getRuntime()
      const agent = await runtime.createAgent({
        id: `title-${profile.id}-${profile.updatedAt}-${provider.updatedAt}`,
        name: 'KoWork Conversation Title Generator',
        instructions: `Create a short, specific conversation title from the first user message. The title must be no more than ${MAX_GENERATED_THREAD_TITLE_LENGTH} characters, including spaces and punctuation. Preserve the message language. Describe the user intent, not the assistant action. Return only the title text without JSON, quotes, Markdown, or commentary.`,
        model: await providerFor(profile, provider, this.credentials),
        memory: { type: 'none' },
        termination: { maxSteps: 2 },
        runBudget: { maxTotalSteps: 2 }
      })
      this.titleGenerators.set(key, agent)
      return agent
    })()
    this.titleGeneratorCreations.set(key, creation)
    try {
      return await creation
    } finally {
      this.titleGeneratorCreations.delete(key)
    }
  }

  async generateTitle(input: {
    message: string
    profile: ModelProfileDto
    signal: AbortSignal
  }): Promise<string> {
    const fallback = createFallbackThreadTitle(input.message)
    const agent = await this.getTitleGenerator(input.profile)
    const source = Array.from(input.message).slice(0, 8_000).join('')
    const result = await agent.run(
      `Generate the title from this first user message:\n${JSON.stringify(source)}`,
      { signal: input.signal }
    )
    if (result.status !== 'completed') return fallback
    return normalizeGeneratedThreadTitle(result.text, input.message)
  }

  async compressIfNeeded(input: {
    project: ProjectDto
    thread: ThreadDto
    request: QueuedRequestDto
    profile: ModelProfileDto
    signal: AbortSignal
  }): Promise<void> {
    const turns = this.database.getConversationTurns(input.thread.id)
    if (turns.length === 0) return
    const previous = this.database.latestCompression(input.thread.id)
    const visible = previous
      ? turns.filter((turn) => turn.ordinal > previous.coveredThroughOrdinal)
      : turns
    const visibleText = visible
      .map((turn) => textFromItems(JSON.parse(turn.itemsJson) as ModelItem[]))
      .join('\n')
    const projected = estimateTokens(
      `${previous?.summary ?? ''}\n${visibleText}\n${input.request.input}`
    )
    if (!shouldCompress(projected, input.request.contextWindowTokens)) return

    const keepCount = selectRecentTurnCount(
      visible.map((turn) => estimateTokens(turn.itemsJson)),
      input.request.contextWindowTokens
    )
    const oldTurns = visible.slice(0, Math.max(visible.length - keepCount, 0))
    if (oldTurns.length === 0) {
      throw new CoreError(
        'context_limit_reached',
        'The most recent conversation turn is too large to compress safely'
      )
    }
    const source = [
      previous ? `Previous summary:\n${previous.summary}` : '',
      ...oldTurns.map((turn) => textFromItems(JSON.parse(turn.itemsJson) as ModelItem[]))
    ]
      .filter(Boolean)
      .join('\n\n')
    const summarizer = await this.getSummarizer(input.profile)
    const result = await summarizer.run(`Summarize this conversation state:\n\n${source}`, {
      signal: input.signal
    })
    if (result.status !== 'completed' || !result.text.trim()) {
      throw new CoreError(
        'compression_failed',
        'Context compression did not produce a valid summary'
      )
    }
    const coveredThroughOrdinal = oldTurns.at(-1)!.ordinal
    this.database.addCompression({
      threadId: input.thread.id,
      modelProfileId: input.profile.id,
      summary: result.text.trim(),
      coveredThroughOrdinal,
      estimatedTokens: estimateTokens(result.text)
    })
    this.events.publish({
      projectId: input.project.id,
      threadId: input.thread.id,
      type: 'memory.compressed',
      payload: { summary: result.text.trim(), coveredThroughOrdinal, keptTurns: keepCount }
    })
  }

  async *stream(input: {
    project: ProjectDto
    thread: ThreadDto
    request: QueuedRequestDto
    runId: string
    signal: AbortSignal
  }): AsyncIterable<AgentStreamEvent> {
    const profile = this.database.getProfile(input.request.modelProfileId)
    const agent = await this.getAgent(input.project, profile)
    const handle = await agent.spawn(input.request.input, {
      threadId: input.thread.id,
      signal: input.signal,
      correlationId: input.runId
    })
    let terminal: AgentEvent | undefined
    try {
      for await (const envelope of handle.events({ signal: input.signal, highWaterMark: 128 })) {
        if (envelope.kind === 'history_gap') {
          throw new CoreError(
            'run_event_history_gap',
            `Run event history after ${envelope.requestedAfter} is unavailable; oldest retained sequence is ${envelope.oldestAvailable}`
          )
        }
        if (envelope.kind !== 'agent') continue
        const event = envelope.event
        if (
          event.type === 'completed' ||
          event.type === 'incomplete' ||
          event.type === 'terminated' ||
          event.type === 'failed'
        ) {
          terminal = event
        } else {
          yield event as AgentStreamEvent
        }
      }
      if (!terminal)
        throw new CoreError('run_missing_terminal_event', 'Koaks run ended without a result')
      yield terminal as AgentStreamEvent
    } finally {
      if (!terminal) {
        const reason =
          typeof input.signal.reason === 'string'
            ? input.signal.reason
            : 'KoWork stopped consuming run events'
        await handle.cancel(reason).catch(() => undefined)
        await handle.result().catch(() => undefined)
      }
      await handle.release()
    }
  }

  async close(): Promise<void> {
    const runtime = this.runtime ?? (await this.runtimePromise?.catch(() => undefined))
    await Promise.all(
      [...this.agents.values(), ...this.summarizers.values(), ...this.titleGenerators.values()].map(
        (agent) => agent.close().catch(() => undefined)
      )
    )
    this.agents.clear()
    this.summarizers.clear()
    this.titleGenerators.clear()
    this.titleGeneratorCreations.clear()
    await runtime?.close()
    this.runtime = undefined
    this.runtimePromise = undefined
  }
}

import type {
  AgentConfig,
  AgentEvent,
  KoaksAgent,
  KoaksRuntime,
  ModelItem,
  ModelProvider,
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
import type { ApprovalService } from '../../application/approval-service'
import type { CoreEventBus } from '../../application/event-bus'
import type { AppDatabase } from '../db/database'
import type { FileService } from '../workspace/file-service'
import type { CommandRunner } from '../shell/command-runner'
import type { GitService } from '../git/git-service'
import type { CredentialProvider } from '../credentials/credential-provider'
import { PersistentThreadMemory } from './persistent-memory'
import type { AgentRuntimePort, AgentStreamEvent } from './runtime-port'

interface ActiveRunLookup {
  getRunId(threadId: string): string | undefined
}

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

export class KoaksAgentRuntime implements AgentRuntimePort {
  private runtime?: KoaksRuntime
  private readonly agents = new Map<string, KoaksAgent>()
  private readonly summarizers = new Map<string, KoaksAgent>()

  constructor(
    private readonly database: AppDatabase,
    private readonly credentials: CredentialProvider,
    private readonly activeRuns: ActiveRunLookup,
    private readonly files: FileService,
    private readonly commands: CommandRunner,
    private readonly git: GitService,
    _approvals: ApprovalService,
    private readonly events: CoreEventBus
  ) {}

  private async getRuntime(): Promise<KoaksRuntime> {
    if (!this.runtime) {
      const { createRuntime } = await import('@koaks/node')
      this.runtime = createRuntime({ maxConcurrency: 4, highWaterMark: 128 })
    }
    return this.runtime
  }

  private toolsFor(project: ProjectDto): ToolDefinition<Record<string, unknown>>[] {
    const files = this.files
    const commands = this.commands
    const git = this.git
    const context = (threadId?: string): { thread: ThreadDto; runId: string } => {
      if (!threadId)
        throw new CoreError('missing_thread_context', 'Tool execution has no thread context')
      const runId = this.activeRuns.getRunId(threadId)
      if (!runId)
        throw new CoreError('run_not_active', `No active application run for thread '${threadId}'`)
      return { thread: this.database.getThread(threadId), runId }
    }
    return [
      {
        name: 'list_files',
        description: 'List files and directories in the current project',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } }
        },
        async execute({ path = '.' }, { runtime }) {
          const active = context(runtime.threadId)
          return await files.listForTool({ project, ...active, path: String(path) })
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
        async execute({ path }, { runtime }) {
          const active = context(runtime.threadId)
          return await files.readForTool({ project, ...active, path: String(path) })
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
        async execute({ query, path = '.' }, { runtime }) {
          const active = context(runtime.threadId)
          return await files.searchForTool({
            project,
            ...active,
            query: String(query),
            path: String(path)
          })
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
        async execute({ path, patch }, { runtime }) {
          const active = context(runtime.threadId)
          return await files.applyPatch({
            project,
            ...active,
            path: String(path),
            patch: String(patch)
          })
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
          const active = context(toolContext.runtime.threadId)
          return await commands.run({
            project,
            ...active,
            executionId: toolContext.executionId,
            command: String(command),
            cwd: String(cwd),
            signal: toolContext.signal
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
      termination: { maxSteps: 80 },
      runBudget: { maxTotalSteps: 120 },
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
      termination: { maxSteps: 2 }
    })
    this.summarizers.set(key, agent)
    return agent
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
    for await (const event of agent.stream(input.request.input, {
      threadId: input.thread.id,
      signal: input.signal,
      highWaterMark: 128
    })) {
      yield event as AgentEvent as AgentStreamEvent
    }
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.agents.values(), ...this.summarizers.values()].map((agent) =>
        agent.close().catch(() => undefined)
      )
    )
    this.agents.clear()
    this.summarizers.clear()
    await this.runtime?.close()
    this.runtime = undefined
  }
}

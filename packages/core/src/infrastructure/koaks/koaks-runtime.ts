import type {
  AgentConfig,
  AgentEvent,
  KoaksAgent,
  KoaksRuntime,
  ModelItem,
  ModelProvider
} from '@koaks/node'
import type {
  ModelProfileDto,
  ProjectDto,
  ProviderDto,
  QueuedRequestDto,
  ThreadDto
} from '@kowork/contracts'
import { CoreError } from '../../domain/errors'
import { createId } from '../../domain/ids'
import { selectRecentTurnCount, shouldCompress } from '../../domain/compression-policy'
import {
  createFallbackThreadTitle,
  MAX_GENERATED_THREAD_TITLE_LENGTH,
  MAX_GENERATED_THREAD_TITLE_WORDS,
  normalizeGeneratedThreadTitle
} from '../../domain/thread-title'
import type { ApprovalService } from '../../application/approval-service'
import type { CoreEventBus } from '../../application/event-bus'
import type { AppDatabase } from '../db/database'
import type { FileService } from '../workspace/file-service'
import type { CommandRunner } from '../shell/command-runner'
import type { GitService } from '../git/git-service'
import type { CredentialProvider } from '../credentials/credential-provider'
import { coreToolSpecs } from '../../tools/catalog'
import { ProjectToolLocks } from '../../tools/tool-lock'
import { ToolRegistry } from '../../tools/tool-registry'
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

function textFromMessage(item: ModelItem): string {
  if (item.type !== 'message') return ''
  return item.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
}

function codingAgentInstructions(project: ProjectDto): string {
  return [
    `You are KoWork, an interactive coding agent that helps the user with software engineering tasks inside their project.`,
    ``,
    `# Environment`,
    `- Project root: ${project.rootPath}. Relative paths in tools resolve against this root; work only inside it.`,
    `- Platform: ${process.platform}. Shell commands must run non-interactively.`,
    ``,
    `# Workflow`,
    `- Understand before editing: locate relevant code with glob_files and search_files, then read_file it before changing anything.`,
    `- Make surgical changes with edit_file; its old text must match the file exactly, whitespace included. Use write_file only to create a file or when a complete rewrite is necessary.`,
    `- Prefer the dedicated file tools over shell equivalents: read_file over cat, search_files over grep, edit_file over sed.`,
    `- Match the surrounding code's style, naming, and comment density.`,
    `- After changing code, verify it: run the project's lint, tests, or build via run_command when they exist, and report results honestly, including failures.`,
    `- Use git_status and git_diff to inspect repository state before and after changes.`,
    ``,
    `# Safety`,
    `- run_command executes as the current user with no sandbox. Avoid destructive operations (deletes, resets, force-pushes) and system-wide changes unless the user explicitly asked for them.`,
    `- Some tool calls require user approval. If a call is denied, that is the user's decision: adjust the approach instead of repeating the same call.`,
    ``,
    `# Communication`,
    `- The user reads only your final message, not your intermediate steps. End every turn with a summary that leads with the outcome, then what changed, what was verified, and anything left undone.`,
    `- Reply in the user's language, in complete sentences, and ask only when the decision is genuinely the user's.`
  ].join('\n')
}

export class KoaksAgentRuntime implements AgentRuntimePort {
  private runtime?: KoaksRuntime
  private runtimePromise?: Promise<KoaksRuntime>
  private readonly agents = new Map<string, KoaksAgent>()
  private readonly agentCreations = new Map<string, Promise<KoaksAgent>>()
  private readonly toolLocks = new ProjectToolLocks()

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

  private async getAgent(
    project: ProjectDto,
    threadId: string,
    profile: ModelProfileDto
  ): Promise<KoaksAgent> {
    const provider = this.database.getProvider(profile.providerId)
    const key = `${project.id}:${threadId}:${profile.id}:${profile.updatedAt}:${provider.updatedAt}`
    const existing = this.agents.get(key)
    if (existing) return existing
    const creating = this.agentCreations.get(key)
    if (creating) return await creating

    const creation = (async () => {
      const runtime = await this.getRuntime()
      const registry = new ToolRegistry(
        coreToolSpecs(),
        { project, files: this.files, commands: this.commands, git: this.git },
        this.database,
        this.approvals,
        this.toolLocks
      )
      const config: AgentConfig = {
        id: `coding-${project.id}-${threadId}-${profile.id}-${profile.updatedAt}-${provider.updatedAt}`,
        name: 'KoWork Coding Agent',
        instructions: [
          {
            type: 'static',
            text: codingAgentInstructions(project)
          }
        ],
        model: await providerFor(profile, provider, this.credentials),
        memory: {
          type: 'custom',
          id: 'kowork-sqlite-memory-v1',
          open: (threadId) => new PersistentThreadMemory(threadId, this.database)
        },
        tools: registry.definitions(),
        hooks: [registry.hook()],
        termination: { maxSteps: 1024 },
        runBudget: { maxTotalSteps: 4096 },
        errorPolicy: { type: 'retry_retriable', maxRetries: 2, delayMs: 800 }
      }
      const agent = await runtime.createAgent(config)
      try {
        await agent.prepare()
      } catch (error) {
        await agent.close().catch(() => undefined)
        throw error
      }
      this.agents.set(key, agent)
      return agent
    })()
    this.agentCreations.set(key, creation)
    try {
      return await creation
    } finally {
      this.agentCreations.delete(key)
    }
  }

  private async withEphemeralAgent<T>(
    config: AgentConfig,
    run: (agent: KoaksAgent) => Promise<T>
  ): Promise<T> {
    const runtime = await this.getRuntime()
    const agent = await runtime.createAgent(config)
    try {
      return await run(agent)
    } finally {
      await agent.close().catch(() => undefined)
    }
  }

  async generateTitle(input: {
    message: string
    threadId: string
    profile: ModelProfileDto
    signal: AbortSignal
  }): Promise<string> {
    const fallback = createFallbackThreadTitle(input.message)
    const provider = this.database.getProvider(input.profile.providerId)
    const source = Array.from(input.message).slice(0, 8_000).join('')
    const result = await this.withEphemeralAgent(
      {
        id: createId('title'),
        name: 'KoWork Conversation Title Generator',
        instructions: [
          'Create a concise, specific conversation title from the first user message.',
          '',
          'Length limits (count spaces and punctuation):',
          `- Chinese / CJK text: at most ${MAX_GENERATED_THREAD_TITLE_LENGTH} characters.`,
          `- English / Latin text: at most ${MAX_GENERATED_THREAD_TITLE_WORDS} words.`,
          '',
          'Rules:',
          '- Keep the language of the original message.',
          '- Use a noun phrase that captures the user\'s core intent or task, e.g. "修复登录页面布局", "Refactor auth token refresh".',
          '- Do not write a full sentence, and do not describe what the assistant will do.',
          '- Drop filler words and trailing punctuation.',
          '- Output only the title text: no quotes, no Markdown, no JSON, no commentary.'
        ].join('\n'),
        model: await providerFor(input.profile, provider, this.credentials),
        memory: { type: 'none' },
        termination: { maxSteps: 2 }
      },
      (agent) =>
        agent.run(`Generate the title from this first user message:\n${JSON.stringify(source)}`, {
          threadId: `title:${input.threadId}`,
          signal: input.signal
        })
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
    const provider = this.database.getProvider(input.profile.providerId)
    const result = await this.withEphemeralAgent(
      {
        id: createId('summarizer'),
        name: 'KoWork Context Summarizer',
        instructions:
          'Create a compact, factual coding-session summary. Preserve user goals, architectural decisions, file changes, command outcomes, unresolved errors, and exact identifiers. Do not add advice.',
        model: await providerFor(input.profile, provider, this.credentials),
        memory: { type: 'none' },
        termination: { maxSteps: 4 }
      },
      (agent) =>
        agent.run(`Summarize this conversation state:\n\n${source}`, {
          threadId: `summarizer:${input.thread.id}`,
          signal: input.signal
        })
    )
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
    const agent = await this.getAgent(input.project, input.thread.id, profile)
    const handle = await agent.spawn(input.request.input, {
      threadId: input.thread.id,
      signal: input.signal,
      correlationId: input.runId,
      eventDetail: 'lossless'
    })
    let terminal: AgentEvent | undefined
    try {
      for await (const envelope of handle.events({ signal: input.signal, highWaterMark: 1_024 })) {
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
      if (terminal.type === 'completed') {
        yield {
          type: 'completed',
          usage: terminal.usage,
          finalText: textFromMessage(terminal.message)
        }
      } else {
        yield terminal as AgentStreamEvent
      }
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
      [...this.agents.values()].map((agent) => agent.close().catch(() => undefined))
    )
    this.agents.clear()
    this.agentCreations.clear()
    await runtime?.close()
    this.runtime = undefined
    this.runtimePromise = undefined
  }
}

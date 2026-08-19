import type {
  ApprovalDto,
  AppSettingsDto,
  KoWorkApi,
  ModelProfileDto,
  ProjectDto,
  ProviderDto,
  QueuedRequestDto,
  RunDto,
  RunEventDto,
  ThreadDto
} from '@kowork/contracts'
import {
  ClientSettingsError,
  DEFAULT_CLIENT_SETTINGS,
  layoutSchema,
  type ClientLayoutKey,
  type ClientSettingsBridgeApi,
  type ClientSettingsSnapshot,
  type ClientSettingsState,
  type ClientSettingsWarning,
  type LegacyLayoutInput
} from '@kowork/client-settings'

function previewHostOs(): string {
  if (navigator.userAgent.includes('Mac')) return 'darwin'
  if (navigator.userAgent.includes('Windows')) return 'win32'
  return 'linux'
}

function createFallbackThreadTitle(message: string): string {
  const value = message.replace(/\s+/gu, ' ').trim()
  const characters = Array.from(value || '新的会话')
  return characters.length <= 10 ? characters.join('') : `${characters.slice(0, 9).join('')}…`
}

const now = Date.now()
const project: ProjectDto = {
  id: 'preview-project',
  name: 'kowork',
  rootPath: '/Users/atri/DevLab/JavaScript/kowork',
  createdAt: now,
  updatedAt: now,
  deletedAt: null
}
let providers: ProviderDto[] = [
  {
    id: 'provider-openai-chat',
    name: 'OpenAI',
    kind: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.openai.com',
    credentialConfigured: true,
    enabled: true,
    available: true,
    builtin: true,
    defaultContextWindowTokens: 1_000_000,
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'provider-anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    credentialConfigured: false,
    enabled: true,
    available: false,
    builtin: true,
    defaultContextWindowTokens: 200_000,
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'provider-qwen',
    name: 'Qwen',
    kind: 'qwen',
    protocol: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    credentialConfigured: false,
    enabled: true,
    available: false,
    builtin: true,
    defaultContextWindowTokens: 131_072,
    createdAt: now,
    updatedAt: now
  }
]
let profiles: ModelProfileDto[] = [
  {
    id: 'openai-gpt-4.1-mini',
    providerId: 'provider-openai-chat',
    name: 'GPT-4.1 mini',
    model: 'gpt-4.1-mini',
    contextWindowTokens: 1_000_000,
    source: 'builtin',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    available: true
  },
  {
    id: 'anthropic-sonnet',
    providerId: 'provider-anthropic',
    name: 'Claude Sonnet 4.5',
    model: 'claude-sonnet-4-5',
    contextWindowTokens: 200_000,
    source: 'builtin',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    available: false
  }
]
let threads: ThreadDto[] = [
  {
    id: 'preview-thread',
    projectId: project.id,
    title: '',
    modelProfileId: profiles[0].id,
    permissionMode: 'auto',
    contextWindowTokens: null,
    queuePaused: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }
]
let events: RunEventDto[] = []
let runs: RunDto[] = []
let sequence = 0
let settings: AppSettingsDto = {
  defaultModelProfileId: profiles[0].id,
  defaultPermissionMode: 'auto'
}
const listeners = new Set<(event: RunEventDto) => void>()
const clientSettingsListeners = new Set<(state: ClientSettingsState) => void>()
let clientSettingsSnapshot: ClientSettingsSnapshot = {
  ...structuredClone(DEFAULT_CLIENT_SETTINGS),
  resolvedColorScheme: 'light'
}

const previewLayoutKeys = [
  'leftSidebarWidth',
  'rightSidebarWidth',
  'settingsProviderListWidth'
] as const satisfies readonly ClientLayoutKey[]

function migratePreviewLayout(legacyLayout: LegacyLayoutInput): readonly ClientSettingsWarning[] {
  const layout = { ...clientSettingsSnapshot.layout }
  const warnings: ClientSettingsWarning[] = []
  for (const key of previewLayoutKeys) {
    const rawValue = legacyLayout[key]
    if (rawValue === undefined || rawValue === null || rawValue === '') continue
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue)
    const parsed = layoutSchema.safeParse({ ...layout, [key]: value })
    if (parsed.success) {
      layout[key] = parsed.data[key]
    } else {
      layout[key] = DEFAULT_CLIENT_SETTINGS.layout[key]
      warnings.push({
        code: 'LEGACY_LAYOUT_INVALID',
        key,
        reason: 'invalid',
        defaultValue: DEFAULT_CLIENT_SETTINGS.layout[key]
      })
    }
  }
  clientSettingsSnapshot = { ...clientSettingsSnapshot, layout }
  return warnings
}

const clientSettingsApi: ClientSettingsBridgeApi = {
  bootstrap: (legacyLayout) => {
    const warnings = migratePreviewLayout(legacyLayout)
    return {
      state: {
        status: 'ready',
        snapshot: clientSettingsSnapshot,
        ...(warnings.length ? { warnings } : {})
      },
      removeLegacyKeys: true
    }
  },
  get: async () => ({ status: 'ready', snapshot: clientSettingsSnapshot }),
  patch: async (patch) => {
    clientSettingsSnapshot = {
      ...clientSettingsSnapshot,
      [patch.section]: patch.value,
      resolvedColorScheme:
        patch.section === 'appearance' && patch.value.colorScheme !== 'system'
          ? patch.value.colorScheme
          : clientSettingsSnapshot.resolvedColorScheme
    }
    const state: ClientSettingsState = { status: 'ready', snapshot: clientSettingsSnapshot }
    clientSettingsListeners.forEach((listener) => listener(state))
    return clientSettingsSnapshot
  },
  chooseBackground: async () => {
    throw new ClientSettingsError({
      code: 'BACKGROUND_UNAVAILABLE',
      message: '浏览器预览不支持选择本机背景图片'
    })
  },
  clearBackground: async () => {
    clientSettingsSnapshot = {
      ...clientSettingsSnapshot,
      appearance: { ...clientSettingsSnapshot.appearance, background: null }
    }
    const state: ClientSettingsState = { status: 'ready', snapshot: clientSettingsSnapshot }
    clientSettingsListeners.forEach((listener) => listener(state))
    return clientSettingsSnapshot
  },
  reset: async () => {
    clientSettingsSnapshot = {
      ...structuredClone(DEFAULT_CLIENT_SETTINGS),
      resolvedColorScheme: 'light'
    }
    const state: ClientSettingsState = { status: 'ready', snapshot: clientSettingsSnapshot }
    clientSettingsListeners.forEach((listener) => listener(state))
    return clientSettingsSnapshot
  },
  subscribe: (listener) => {
    clientSettingsListeners.add(listener)
    return () => clientSettingsListeners.delete(listener)
  }
}

function emit(
  type: RunEventDto['type'],
  payload: Record<string, unknown>,
  runId?: string,
  threadId = threads[0]?.id ?? null
): void {
  const event: RunEventDto = {
    sequence: ++sequence,
    id: crypto.randomUUID(),
    projectId: project.id,
    threadId,
    runId: runId ?? null,
    type,
    payload,
    createdAt: Date.now()
  }
  events = [...events, event]
  listeners.forEach((listener) => listener(event))
}

export function installBrowserPreviewApi(): void {
  if (!import.meta.env.DEV || window.kowork) return
  const api: KoWorkApi & { clientSettings: ClientSettingsBridgeApi } = {
    platform: { os: previewHostOs(), backdrop: 'none' },
    clientSettings: clientSettingsApi,
    bootstrap: async () => ({
      projects: [project],
      providers,
      modelProfiles: profiles,
      settings,
      activeRuns: [],
      pendingApprovals: [],
      lastEventSequence: sequence
    }),
    projects: {
      list: async () => [project],
      add: async () => project,
      archive: async () => project,
      restore: async () => project
    },
    threads: {
      list: async () => threads,
      create: async (_projectId, title) => {
        const thread: ThreadDto = {
          ...threads[0],
          id: crypto.randomUUID(),
          title: title ?? '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        threads = [thread, ...threads]
        return thread
      },
      update: async (threadId, changes) => {
        threads = threads.map((thread) =>
          thread.id === threadId ? { ...thread, ...changes, updatedAt: Date.now() } : thread
        )
        return threads.find((thread) => thread.id === threadId)!
      },
      archive: async (threadId) => {
        const target = threads.find((thread) => thread.id === threadId)
        if (!target) throw new Error('Thread not found')
        const archived = { ...target, deletedAt: Date.now(), updatedAt: Date.now() }
        threads = threads.filter((thread) => thread.id !== threadId)
        return archived
      },
      restore: async (threadId) => {
        const target = threads.find((thread) => thread.id === threadId)
        if (!target) throw new Error('Thread not found')
        const restored = { ...target, deletedAt: null, updatedAt: Date.now() }
        threads = threads.map((thread) => (thread.id === threadId ? restored : thread))
        return restored
      }
    },
    runs: {
      enqueue: async (threadId, input) => {
        const target = threads.find((thread) => thread.id === threadId)
        if (target && !target.title && !runs.some((run) => run.threadId === threadId)) {
          const updated = {
            ...target,
            title: createFallbackThreadTitle(input),
            updatedAt: Date.now()
          }
          threads = threads.map((thread) => (thread.id === threadId ? updated : thread))
          emit('thread.updated', { thread: updated, source: 'first_message' }, undefined, threadId)
        }
        const request: QueuedRequestDto = {
          id: crypto.randomUUID(),
          threadId,
          input,
          status: 'running',
          modelProfileId: profiles[0].id,
          contextWindowTokens: 128_000,
          position: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        const runId = crypto.randomUUID()
        runs = [
          {
            id: runId,
            requestId: request.id,
            threadId,
            status: 'running',
            modelProfileId: profiles[0].id,
            startedAt: Date.now(),
            finishedAt: null,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            error: null
          },
          ...runs
        ]
        emit('run.started', { input, requestId: request.id }, runId)
        setTimeout(() => emit('run.text', { text: '我先确认一下当前项目。', step: 1 }, runId), 40)
        setTimeout(
          () =>
            emit(
              'run.reasoning',
              { text: '我会先检查项目说明和当前文件状态，再整理出可验证的结论。' },
              runId
            ),
          80
        )
        setTimeout(
          () =>
            emit(
              'run.tool-call',
              {
                call: {
                  id: `read-readme-${runId}`,
                  name: 'read_file',
                  argumentsJson: JSON.stringify({ path: 'README.md', startLine: 1, endLine: 80 })
                }
              },
              runId
            ),
          700
        )
        setTimeout(
          () =>
            emit(
              'run.tool-output',
              {
                callId: `read-readme-${runId}`,
                text: 'README.md 已读取，共 42 行。',
                isError: false
              },
              runId
            ),
          800
        )
        setTimeout(
          () => emit('run.reasoning', { text: '项目结构已经确认，我现在汇总检查结果。' }, runId),
          900
        )
        const response =
          '### 检查结果\n\n- 已检查代码结构\n- 已确认当前改动\n\n接下来给出**可验证的实现**。'
        response
          .match(/.{1,6}/gs)
          ?.forEach((text, index) =>
            setTimeout(() => emit('run.text', { text, step: 2 }, runId), 1_000 + index * 70)
          )
        setTimeout(() => {
          runs = runs.map((run) =>
            run.id === runId
              ? {
                  ...run,
                  status: 'completed',
                  finishedAt: Date.now(),
                  promptTokens: 5_120,
                  completionTokens: 438,
                  totalTokens: 5_558
                }
              : run
          )
          emit(
            'run.completed',
            { usage: { totalTokens: 5_558 }, finalText: response, finalStep: 2 },
            runId
          )
        }, 1_900)
        return request
      },
      cancel: async (runId) => runs.find((run) => run.id === runId)!,
      resumeQueue: async (threadId) => threads.find((thread) => thread.id === threadId)!,
      removeQueued: async () => {
        throw new Error('No queued request')
      },
      list: async () => runs,
      queue: async () => []
    },
    events: {
      list: async () => events,
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    },
    approvals: {
      list: async () => [] as ApprovalDto[],
      respond: async () => {
        throw new Error('No pending approval')
      }
    },
    providers: {
      list: async () => providers,
      create: async (input) => {
        const provider: ProviderDto = {
          id: `provider-${crypto.randomUUID()}`,
          name: input.name,
          kind: input.kind,
          protocol: input.protocol,
          baseUrl: input.baseUrl,
          credentialConfigured: Boolean(input.apiKey),
          enabled: true,
          available: Boolean(input.apiKey),
          builtin: false,
          defaultContextWindowTokens: input.defaultContextWindowTokens,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        providers = [...providers, provider]
        return provider
      },
      update: async ({ providerId, apiKey, ...changes }) => {
        providers = providers.map((provider) =>
          provider.id === providerId
            ? {
                ...provider,
                ...changes,
                ...(apiKey === undefined
                  ? {}
                  : { credentialConfigured: apiKey !== null, available: apiKey !== null }),
                updatedAt: Date.now()
              }
            : provider
        )
        return providers.find((provider) => provider.id === providerId)!
      },
      archive: async (providerId) => {
        const provider = providers.find((item) => item.id === providerId)!
        providers = providers.filter((item) => item.id !== providerId)
        return { ...provider, enabled: false, available: false }
      },
      refreshModels: async (providerId) => ({
        providerId,
        discovered: profiles.filter((profile) => profile.providerId === providerId).length,
        models: profiles.filter((profile) => profile.providerId === providerId)
      }),
      addModel: async (providerId, model, contextWindowTokens, name) => {
        const profile: ModelProfileDto = {
          id: `model-${crypto.randomUUID()}`,
          providerId,
          name: name ?? model,
          model,
          contextWindowTokens,
          source: 'manual',
          enabled: true,
          available: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        profiles = [...profiles, profile]
        return profile
      },
      archiveModel: async (modelProfileId) => {
        profiles = profiles.map((profile) =>
          profile.id === modelProfileId ? { ...profile, enabled: false, available: false } : profile
        )
        return profiles.find((profile) => profile.id === modelProfileId)!
      }
    },
    settings: {
      get: async () => settings,
      update: async (changes) => {
        settings = { ...settings, ...changes }
        return settings
      }
    },
    files: {
      list: async () => [
        { name: 'src', relativePath: 'src', kind: 'directory', size: 0, modifiedAt: now },
        {
          name: 'package.json',
          relativePath: 'package.json',
          kind: 'file',
          size: 2_940,
          modifiedAt: now
        },
        { name: 'README.md', relativePath: 'README.md', kind: 'file', size: 640, modifiedAt: now }
      ],
      read: async (_projectId, relativePath) => ({
        relativePath,
        content: '{\n  "name": "kowork"\n}',
        size: 24,
        modifiedAt: now
      })
    },
    git: {
      status: async () => [
        { path: 'src/renderer/src/App.tsx', indexStatus: ' ', worktreeStatus: 'M' }
      ],
      summary: async () => ({ branch: 'main', additions: 24, deletions: 7 }),
      diff: async (_projectId, relativePath) => ({
        path: relativePath ?? null,
        diff: 'diff --git a/App.tsx b/App.tsx\n+ KoWork workspace'
      })
    }
  }
  window.kowork = api
}

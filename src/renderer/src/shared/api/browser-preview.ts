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
    id: 'provider-deepseek',
    name: 'DeepSeek',
    kind: 'deepseek',
    protocol: 'openai-chat',
    baseUrl: 'https://api.deepseek.com',
    credentialConfigured: true,
    enabled: true,
    available: true,
    defaultContextWindowTokens: 128_000,
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'provider-ollama',
    name: 'Ollama',
    kind: 'ollama',
    protocol: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    credentialConfigured: false,
    enabled: true,
    available: true,
    defaultContextWindowTokens: 32_768,
    createdAt: now,
    updatedAt: now
  }
]
let profiles: ModelProfileDto[] = [
  {
    id: 'deepseek-chat',
    providerId: 'provider-deepseek',
    name: 'DeepSeek Chat',
    model: 'deepseek-chat',
    contextWindowTokens: 128_000,
    source: 'builtin',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    available: true
  },
  {
    id: 'ollama-qwen3',
    providerId: 'provider-ollama',
    name: 'Ollama Qwen3',
    model: 'qwen3:8b',
    contextWindowTokens: 32_768,
    source: 'builtin',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    available: true
  }
]
let threads: ThreadDto[] = [
  {
    id: 'preview-thread',
    projectId: project.id,
    title: '新的会话',
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

function emit(type: RunEventDto['type'], payload: Record<string, unknown>, runId?: string): void {
  const event: RunEventDto = {
    sequence: ++sequence,
    id: crypto.randomUUID(),
    projectId: project.id,
    threadId: threads[0]?.id ?? null,
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
  const api: KoWorkApi = {
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
          title: title ?? '新的会话',
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
      archive: async (threadId) => threads.find((thread) => thread.id === threadId)!,
      restore: async (threadId) => threads.find((thread) => thread.id === threadId)!
    },
    runs: {
      enqueue: async (threadId, input) => {
        const request: QueuedRequestDto = {
          id: crypto.randomUUID(),
          threadId,
          input,
          status: 'running',
          modelProfileId: profiles[0].id,
          permissionMode: 'auto',
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
        setTimeout(() => emit('run.text', { text: '我先确认一下当前项目。' }, runId), 40)
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
            setTimeout(() => emit('run.text', { text }, runId), 1_000 + index * 70)
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
          emit('run.completed', { usage: { totalTokens: 5_558 } }, runId)
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
          available: input.kind === 'ollama' || Boolean(input.apiKey),
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
      diff: async (_projectId, relativePath) => ({
        path: relativePath ?? null,
        diff: 'diff --git a/App.tsx b/App.tsx\n+ KoWork workspace'
      })
    }
  }
  window.kowork = api
}

import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings,
  Trash2,
  X,
  XCircle
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AppBootstrapDto,
  AppSettingsDto,
  ModelProfileDto,
  PermissionMode,
  ProviderDto,
  ProviderKind,
  ProviderProtocol
} from '@kowork/contracts'
import { IconButton } from '../../shared/ui/IconButton'

interface ProviderDraft {
  name: string
  kind: ProviderKind
  protocol: ProviderProtocol
  baseUrl: string
  apiKey: string
  removeApiKey: boolean
  defaultContextWindowTokens: number
}

const protocolsByKind: Record<ProviderKind, ProviderProtocol[]> = {
  openai: ['openai-chat', 'openai-responses'],
  anthropic: ['anthropic'],
  deepseek: ['openai-chat', 'openai-responses', 'anthropic'],
  qwen: ['qwen'],
  ollama: ['ollama'],
  custom: ['openai-chat', 'openai-responses', 'anthropic']
}

const defaultsByKind: Record<
  ProviderKind,
  Pick<ProviderDraft, 'protocol' | 'baseUrl' | 'defaultContextWindowTokens'>
> = {
  openai: {
    protocol: 'openai-responses',
    baseUrl: 'https://api.openai.com',
    defaultContextWindowTokens: 1_000_000
  },
  anthropic: {
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultContextWindowTokens: 200_000
  },
  deepseek: {
    protocol: 'openai-chat',
    baseUrl: 'https://api.deepseek.com',
    defaultContextWindowTokens: 128_000
  },
  qwen: {
    protocol: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    defaultContextWindowTokens: 131_072
  },
  ollama: {
    protocol: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    defaultContextWindowTokens: 32_768
  },
  custom: {
    protocol: 'openai-chat',
    baseUrl: 'http://127.0.0.1:8000',
    defaultContextWindowTokens: 128_000
  }
}

function draftFromProvider(provider: ProviderDto): ProviderDraft {
  return {
    name: provider.name,
    kind: provider.kind,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey: '',
    removeApiKey: false,
    defaultContextWindowTokens: provider.defaultContextWindowTokens
  }
}

const fieldClassName =
  'mt-1.5 h-9 w-full rounded-md border border-neutral-200 bg-white px-2.5 text-sm text-neutral-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20'

export function SettingsDialog({
  providers,
  profiles,
  settings
}: {
  providers: ProviderDto[]
  profiles: ModelProfileDto[]
  settings: AppSettingsDto
}): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>(providers[0]?.id)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<ProviderDraft | undefined>(
    providers[0] ? draftFromProvider(providers[0]) : undefined
  )
  const [manualModel, setManualModel] = useState('')
  const [manualContext, setManualContext] = useState(128_000)

  const providerKindLabels: Record<ProviderKind, string> = {
    openai: t('providerOpenAI'),
    anthropic: t('providerAnthropic'),
    deepseek: t('providerDeepSeek'),
    qwen: t('providerQwen'),
    ollama: t('providerOllama'),
    custom: t('providerCustom')
  }
  const protocolLabels: Record<ProviderProtocol, string> = {
    'openai-chat': t('protocolChatCompletions'),
    'openai-responses': t('protocolResponses'),
    anthropic: t('protocolAnthropic'),
    qwen: t('protocolQwen'),
    ollama: t('protocolOllama')
  }
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId)
  const selectedModels = useMemo(
    () =>
      profiles.filter((profile) => profile.providerId === selectedProviderId && profile.enabled),
    [profiles, selectedProviderId]
  )

  const refreshBootstrap = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
  }
  const updateSettings = useMutation({
    mutationFn: (changes: Partial<AppSettingsDto>) => window.kowork.settings.update(changes),
    onSuccess: (updated) =>
      queryClient.setQueryData<AppBootstrapDto>(['bootstrap'], (current) =>
        current ? { ...current, settings: updated } : current
      )
  })
  const saveProvider = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error(t('providerFormIncomplete'))
      const apiKey = draft.apiKey.trim()
      if (creating) {
        return await window.kowork.providers.create({
          name: draft.name,
          kind: draft.kind,
          protocol: draft.protocol,
          baseUrl: draft.baseUrl,
          defaultContextWindowTokens: draft.defaultContextWindowTokens,
          ...(apiKey ? { apiKey } : {})
        })
      }
      if (!selectedProviderId) throw new Error(t('providerFormIncomplete'))
      return await window.kowork.providers.update({
        providerId: selectedProviderId,
        name: draft.name,
        kind: draft.kind,
        protocol: draft.protocol,
        baseUrl: draft.baseUrl,
        defaultContextWindowTokens: draft.defaultContextWindowTokens,
        ...(draft.removeApiKey ? { apiKey: null } : apiKey ? { apiKey } : {})
      })
    },
    onSuccess: (provider) => {
      setCreating(false)
      setSelectedProviderId(provider.id)
      setDraft(draftFromProvider(provider))
      refreshBootstrap()
    }
  })
  const archiveProvider = useMutation({
    mutationFn: (providerId: string) => window.kowork.providers.archive(providerId),
    onSuccess: (_provider, archivedProviderId) => {
      const next = providers.find((provider) => provider.id !== archivedProviderId)
      setCreating(false)
      setSelectedProviderId(next?.id)
      setDraft(next ? draftFromProvider(next) : undefined)
      refreshBootstrap()
    }
  })
  const refreshModels = useMutation({
    mutationFn: (providerId: string) => window.kowork.providers.refreshModels(providerId),
    onSuccess: () => refreshBootstrap()
  })
  const addModel = useMutation({
    mutationFn: () =>
      window.kowork.providers.addModel(selectedProviderId!, manualModel.trim(), manualContext),
    onSuccess: () => {
      setManualModel('')
      refreshBootstrap()
    }
  })
  const archiveModel = useMutation({
    mutationFn: (modelProfileId: string) => window.kowork.providers.archiveModel(modelProfileId),
    onSuccess: () => refreshBootstrap()
  })

  const beginCreate = (): void => {
    const kind: ProviderKind = 'openai'
    setCreating(true)
    setSelectedProviderId(undefined)
    setDraft({
      name: providerKindLabels[kind],
      kind,
      ...defaultsByKind[kind],
      apiKey: '',
      removeApiKey: false
    })
  }
  const chooseProvider = (provider: ProviderDto): void => {
    setCreating(false)
    setSelectedProviderId(provider.id)
    setDraft(draftFromProvider(provider))
    setManualContext(provider.defaultContextWindowTokens)
  }
  const changeKind = (kind: ProviderKind): void => {
    setDraft((current) =>
      current
        ? {
            ...current,
            name: creating ? providerKindLabels[kind] : current.name,
            kind,
            ...defaultsByKind[kind],
            apiKey: kind === 'ollama' ? '' : current.apiKey,
            removeApiKey: kind === 'ollama'
          }
        : current
    )
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <IconButton label={t('settings')}>
          <Settings size={17} />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[min(720px,calc(100vh-32px))] w-[min(940px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-neutral-900">
                {t('settings')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-neutral-500">
                {t('settingsDescription')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton label={t('close')}>
                <X size={17} />
              </IconButton>
            </Dialog.Close>
          </div>

          <Tabs.Root defaultValue="general" className="flex min-h-0 flex-1 flex-col">
            <Tabs.List className="flex h-11 shrink-0 items-end gap-5 border-b border-neutral-200 px-5">
              <Tabs.Trigger
                value="general"
                className="h-full border-b-2 border-transparent px-1 text-sm text-neutral-500 data-[state=active]:border-blue-600 data-[state=active]:font-medium data-[state=active]:text-blue-700"
              >
                {t('settingsGeneral')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="providers"
                className="h-full border-b-2 border-transparent px-1 text-sm text-neutral-500 data-[state=active]:border-blue-600 data-[state=active]:font-medium data-[state=active]:text-blue-700"
              >
                {t('modelProviders')}
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="general" className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
                <label className="text-xs font-medium text-neutral-600">
                  {t('defaultModel')}
                  <select
                    className={fieldClassName}
                    value={settings.defaultModelProfileId ?? ''}
                    onChange={(event) =>
                      updateSettings.mutate({ defaultModelProfileId: event.target.value || null })
                    }
                  >
                    <option value="">{t('automaticModel')}</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id} disabled={!profile.available}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-neutral-600">
                  {t('defaultPermission')}
                  <select
                    className={fieldClassName}
                    value={settings.defaultPermissionMode}
                    onChange={(event) =>
                      updateSettings.mutate({
                        defaultPermissionMode: event.target.value as PermissionMode
                      })
                    }
                  >
                    <option value="ask">{t('permissionAsk')}</option>
                    <option value="auto">{t('permissionAuto')}</option>
                    <option value="yolo">{t('permissionYolo')}</option>
                  </select>
                </label>
              </div>
            </Tabs.Content>

            <Tabs.Content value="providers" className="flex min-h-0 flex-1">
              <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/70">
                <div className="flex h-12 items-center justify-between border-b border-neutral-200 px-3">
                  <span className="text-xs font-semibold text-neutral-600">
                    {t('modelProviders')}
                  </span>
                  <IconButton label={t('addProvider')} onClick={beginCreate}>
                    <Plus size={15} />
                  </IconButton>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => chooseProvider(provider)}
                      className={`mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2.5 text-left ${provider.id === selectedProviderId && !creating ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-white/80'}`}
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${provider.available ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-800">
                          {provider.name}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-500">
                          {protocolLabels[provider.protocol]}
                        </span>
                      </span>
                    </button>
                  ))}
                  {providers.length === 0 && !creating && (
                    <div className="px-3 py-8 text-center text-xs text-neutral-500">
                      {t('noProviders')}
                    </div>
                  )}
                </div>
              </aside>

              <div className="min-w-0 flex-1 overflow-y-auto">
                {draft ? (
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-neutral-900">
                          {creating ? t('addProvider') : draft.name}
                        </h3>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                          {selectedProvider?.available ? (
                            <CheckCircle2 size={14} className="text-emerald-600" />
                          ) : (
                            <XCircle size={14} className="text-neutral-400" />
                          )}
                          {selectedProvider?.available ? t('available') : t('providerNotReady')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!creating && selectedProviderId && (
                          <button
                            className="flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs text-neutral-600 hover:border-red-200 hover:text-red-700"
                            onClick={() => {
                              if (window.confirm(t('removeProviderConfirm'))) {
                                archiveProvider.mutate(selectedProviderId)
                              }
                            }}
                          >
                            <Trash2 size={14} /> {t('remove')}
                          </button>
                        )}
                        <button
                          className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          disabled={saveProvider.isPending || !draft.name || !draft.baseUrl}
                          onClick={() => saveProvider.mutate()}
                        >
                          {saveProvider.isPending ? (
                            <LoaderCircle size={14} className="animate-spin" />
                          ) : (
                            <Save size={14} />
                          )}
                          {t('save')}
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <label className="text-xs font-medium text-neutral-600">
                        {t('providerName')}
                        <input
                          className={fieldClassName}
                          value={draft.name}
                          onChange={(event) =>
                            setDraft((current) =>
                              current ? { ...current, name: event.target.value } : current
                            )
                          }
                        />
                      </label>
                      <label className="text-xs font-medium text-neutral-600">
                        {t('providerKind')}
                        <select
                          className={fieldClassName}
                          value={draft.kind}
                          onChange={(event) => changeKind(event.target.value as ProviderKind)}
                        >
                          {(Object.keys(providerKindLabels) as ProviderKind[]).map((kind) => (
                            <option key={kind} value={kind}>
                              {providerKindLabels[kind]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-neutral-600">
                        {t('providerProtocol')}
                        <select
                          className={fieldClassName}
                          value={draft.protocol}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    protocol: event.target.value as ProviderProtocol
                                  }
                                : current
                            )
                          }
                        >
                          {protocolsByKind[draft.kind].map((protocol) => (
                            <option key={protocol} value={protocol}>
                              {protocolLabels[protocol]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-neutral-600">
                        {t('contextWindowTokens')}
                        <input
                          className={fieldClassName}
                          type="number"
                          min={1}
                          value={draft.defaultContextWindowTokens}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    defaultContextWindowTokens: Number(event.target.value)
                                  }
                                : current
                            )
                          }
                        />
                      </label>
                      <label className="text-xs font-medium text-neutral-600 sm:col-span-2">
                        {t('baseUrl')}
                        <input
                          className={fieldClassName}
                          type="url"
                          value={draft.baseUrl}
                          onChange={(event) =>
                            setDraft((current) =>
                              current ? { ...current, baseUrl: event.target.value } : current
                            )
                          }
                        />
                      </label>
                      {draft.kind !== 'ollama' && (
                        <label className="text-xs font-medium text-neutral-600 sm:col-span-2">
                          <span className="flex items-center justify-between">
                            <span>{t('apiKey')}</span>
                            {selectedProvider?.credentialConfigured && !draft.removeApiKey && (
                              <span className="flex items-center gap-1 font-normal text-emerald-700">
                                <KeyRound size={12} /> {t('apiKeyStored')}
                              </span>
                            )}
                          </span>
                          <input
                            className={fieldClassName}
                            type="password"
                            autoComplete="new-password"
                            disabled={draft.removeApiKey}
                            placeholder={
                              selectedProvider?.credentialConfigured
                                ? t('apiKeyKeepPlaceholder')
                                : t('apiKeyPlaceholder')
                            }
                            value={draft.apiKey}
                            onChange={(event) =>
                              setDraft((current) =>
                                current ? { ...current, apiKey: event.target.value } : current
                              )
                            }
                          />
                          {selectedProvider?.credentialConfigured && (
                            <label className="mt-2 flex items-center gap-2 text-xs font-normal text-neutral-500">
                              <input
                                type="checkbox"
                                checked={draft.removeApiKey}
                                onChange={(event) =>
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          removeApiKey: event.target.checked,
                                          apiKey: ''
                                        }
                                      : current
                                  )
                                }
                              />
                              {t('removeApiKey')}
                            </label>
                          )}
                        </label>
                      )}
                    </div>

                    {saveProvider.error && (
                      <p className="mt-3 text-xs text-red-700">
                        {saveProvider.error instanceof Error
                          ? saveProvider.error.message
                          : t('error')}
                      </p>
                    )}

                    {!creating && selectedProviderId && (
                      <section className="mt-6 border-t border-neutral-200 pt-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-neutral-900">
                              {t('providerModels')}
                            </h4>
                            <p className="mt-1 text-xs text-neutral-500">
                              {t('providerModelsDescription')}
                            </p>
                          </div>
                          <button
                            className="flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                            disabled={refreshModels.isPending}
                            onClick={() => refreshModels.mutate(selectedProviderId)}
                          >
                            <RefreshCw
                              size={14}
                              className={refreshModels.isPending ? 'animate-spin' : ''}
                            />
                            {t('refreshModels')}
                          </button>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <input
                            className="h-9 min-w-0 flex-1 rounded-md border border-neutral-200 px-2.5 text-sm outline-none focus:border-blue-600"
                            placeholder={t('manualModelPlaceholder')}
                            value={manualModel}
                            onChange={(event) => setManualModel(event.target.value)}
                          />
                          <input
                            aria-label={t('contextWindowTokens')}
                            className="h-9 w-32 rounded-md border border-neutral-200 px-2.5 text-sm outline-none focus:border-blue-600"
                            type="number"
                            min={1}
                            value={manualContext}
                            onChange={(event) => setManualContext(Number(event.target.value))}
                          />
                          <button
                            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                            disabled={!manualModel.trim() || addModel.isPending}
                            onClick={() => addModel.mutate()}
                          >
                            <Plus size={14} /> {t('addModel')}
                          </button>
                        </div>

                        {(refreshModels.error || addModel.error) && (
                          <p className="mt-3 text-xs text-red-700">
                            {(refreshModels.error ?? addModel.error) instanceof Error
                              ? (refreshModels.error ?? (addModel.error as Error)).message
                              : t('error')}
                          </p>
                        )}

                        <div className="mt-3 divide-y divide-neutral-100 border-y border-neutral-100">
                          {selectedModels.map((profile) => (
                            <div
                              key={profile.id}
                              className="flex min-h-11 items-center justify-between gap-3 py-2"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm text-neutral-800">
                                  {profile.name}
                                </div>
                                <div className="truncate font-mono text-[11px] text-neutral-500">
                                  {profile.model} · {profile.contextWindowTokens.toLocaleString()}{' '}
                                  tokens
                                </div>
                              </div>
                              <IconButton
                                label={t('removeModel')}
                                onClick={() => archiveModel.mutate(profile.id)}
                              >
                                <Trash2 size={14} />
                              </IconButton>
                            </div>
                          ))}
                          {selectedModels.length === 0 && (
                            <div className="flex items-center gap-2 py-5 text-xs text-neutral-500">
                              <Server size={15} /> {t('noModels')}
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <div className="grid h-full place-items-center px-8 text-center text-sm text-neutral-500">
                    {t('selectProvider')}
                  </div>
                )}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Server,
  Trash2,
  XCircle
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  catalogOptionFromProvider,
  PROVIDER_CATALOG_OPTIONS,
  providerCatalogDefaults,
  protocolsByKind,
  type ModelProfileDto,
  type ProviderCatalogOption,
  type ProviderDto,
  type ProviderProtocol
} from '@kowork/contracts'
import {
  Button,
  IconButton,
  Reveal,
  SelectableItem,
  SelectableList
} from '@kowork/design-system'
import { ResizablePanel } from '../../shared/ui/ResizablePanel'

interface ProviderDraft {
  name: string
  catalogOption: ProviderCatalogOption
  protocol: ProviderProtocol
  baseUrl: string
  apiKey: string
  removeApiKey: boolean
  defaultContextWindowTokens: number
}

function draftFromProvider(provider: ProviderDto): ProviderDraft {
  const catalogOption = catalogOptionFromProvider(provider.kind, provider.protocol)
  return {
    name: provider.name,
    catalogOption,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey: '',
    removeApiKey: false,
    defaultContextWindowTokens: provider.defaultContextWindowTokens
  }
}

function draftKind(option: ProviderCatalogOption): ProviderDto['kind'] {
  return providerCatalogDefaults[option].kind
}

const fieldClassName =
  'mt-1.5 h-9 w-full rounded-md border border-kw-border-default bg-kw-surface px-2.5 text-sm text-kw-text-secondary outline-none focus-visible:border-kw-accent focus-visible:ring-1 focus-visible:ring-kw-focus-ring'

export function ProviderSettings({
  providers,
  profiles
}: {
  providers: ProviderDto[]
  profiles: ModelProfileDto[]
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

  const catalogLabels: Record<ProviderCatalogOption, string> = {
    openai: t('providerOpenAI'),
    anthropic: t('providerAnthropic'),
    qwen: t('providerQwen'),
    'openai-compatible': t('providerOpenAICompatible'),
    'anthropic-compatible': t('providerAnthropicCompatible')
  }
  const protocolLabels: Record<ProviderProtocol, string> = {
    'openai-chat': t('protocolChatCompletions'),
    'openai-responses': t('protocolResponses'),
    anthropic: t('providerAnthropic'),
    qwen: t('providerQwen')
  }
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId)
  const builtinProviders = providers.filter((provider) => provider.builtin)
  const addedProviders = providers.filter((provider) => !provider.builtin)
  const selectedModels = useMemo(
    () =>
      profiles.filter((profile) => profile.providerId === selectedProviderId && profile.enabled),
    [profiles, selectedProviderId]
  )
  const kind = draft ? draftKind(draft.catalogOption) : undefined
  const showProtocol = kind === 'openai'
  const showIdentityFields = creating || Boolean(selectedProvider && !selectedProvider.builtin)

  const refreshBootstrap = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
  }
  const saveProvider = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error(t('providerFormIncomplete'))
      const defaults = providerCatalogDefaults[draft.catalogOption]
      const protocol = defaults.kind === 'openai' ? draft.protocol : defaults.protocol
      const apiKey = draft.apiKey.trim()
      if (creating) {
        return await window.kowork.providers.create({
          name: draft.name,
          kind: defaults.kind,
          protocol,
          baseUrl: draft.baseUrl,
          defaultContextWindowTokens: draft.defaultContextWindowTokens,
          ...(apiKey ? { apiKey } : {})
        })
      }
      if (!selectedProviderId) throw new Error(t('providerFormIncomplete'))
      return await window.kowork.providers.update({
        providerId: selectedProviderId,
        name: draft.name,
        kind: defaults.kind,
        protocol,
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
    const catalogOption: ProviderCatalogOption = 'openai'
    const defaults = providerCatalogDefaults[catalogOption]
    setCreating(true)
    setSelectedProviderId(undefined)
    setDraft({
      name: catalogLabels[catalogOption],
      catalogOption,
      protocol: defaults.protocol,
      baseUrl: defaults.baseUrl,
      defaultContextWindowTokens: defaults.defaultContextWindowTokens,
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
  const changeCatalogOption = (catalogOption: ProviderCatalogOption): void => {
    const defaults = providerCatalogDefaults[catalogOption]
    setDraft((current) =>
      current
        ? {
            ...current,
            name:
              current.name === catalogLabels[current.catalogOption]
                ? catalogLabels[catalogOption]
                : current.name,
            catalogOption,
            protocol: defaults.protocol,
            baseUrl: defaults.baseUrl,
            defaultContextWindowTokens: defaults.defaultContextWindowTokens
          }
        : current
    )
  }

  const providerSubtitle = (provider: ProviderDto): string | undefined => {
    if (provider.kind === 'openai') return protocolLabels[provider.protocol]
    if (provider.kind === 'custom') {
      return catalogLabels[catalogOptionFromProvider(provider.kind, provider.protocol)]
    }
    return provider.builtin ? undefined : catalogLabels[provider.kind]
  }

  const renderProviderButton = (provider: ProviderDto): React.JSX.Element => {
    const selected = provider.id === selectedProviderId && !creating
    const subtitle = providerSubtitle(provider)
    return (
      <SelectableItem value={provider.id} selected={selected} asChild>
      <button
        key={provider.id}
        type="button"
        data-selected={selected || undefined}
        onClick={() => chooseProvider(provider)}
        className={`mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2.5 text-left ${
          selected ? 'text-kw-text-primary' : 'text-kw-text-secondary'
        }`}
      >
        <span
          className={`size-2 shrink-0 rounded-full ${provider.available ? 'bg-kw-success' : 'bg-kw-border-strong'}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{provider.name}</span>
          {subtitle && (
            <span className="block truncate text-[11px] text-kw-text-muted">{subtitle}</span>
          )}
        </span>
      </button>
      </SelectableItem>
    )
  }

  return (
    <div className="flex min-h-0 flex-1">
      <ResizablePanel
        side="left"
        defaultWidth={208}
        minWidth={168}
        maxWidth={360}
        storageKey="kowork:settings-provider-list-width"
        resizeLabel={t('resizeProviderList')}
      >
        <aside className="flex h-full w-full flex-col border-r border-kw-border-default bg-kw-surface-subtle">
          <div className="flex h-12 items-center border-b border-kw-border-default px-3">
            <span className="truncate text-xs font-semibold text-kw-text-secondary">
              {t('modelProviders')}
            </span>
          </div>
          <SelectableList value={creating ? '__new__' : selectedProviderId} selectionStyle="sliding" className="min-h-0 flex-1 overflow-y-auto p-2">
            {builtinProviders.map(renderProviderButton)}
            {addedProviders.map(renderProviderButton)}
            <SelectableItem value="__new__" selected={creating} asChild>
            <button
              type="button"
              onClick={beginCreate}
              className={`mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2.5 text-left ${
                creating ? 'text-kw-text-primary' : 'text-kw-text-secondary'
              }`}
            >
              <Plus size={15} className="shrink-0" />
              <span className="truncate text-sm font-medium">{t('addProvider')}</span>
            </button>
            </SelectableItem>
            {providers.length === 0 && !creating && (
              <div className="px-3 py-8 text-center text-xs text-kw-text-muted">
                {t('noProviders')}
              </div>
            )}
          </SelectableList>
        </aside>
      </ResizablePanel>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {draft ? (
          <Reveal contentKey={creating ? 'creating' : selectedProviderId} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-kw-text-primary">
                  {creating ? t('addProvider') : draft.name}
                </h3>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-kw-text-muted">
                  {selectedProvider?.available ? (
                    <CheckCircle2 size={14} className="text-kw-success" />
                  ) : (
                    <XCircle size={14} className="text-kw-text-faint" />
                  )}
                  {selectedProvider?.available ? t('available') : t('providerNotReady')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!creating && selectedProviderId && !selectedProvider?.builtin && (
                  <button
                    className="kw-button kw-button-danger h-8"
                    onClick={() => {
                      if (window.confirm(t('removeProviderConfirm'))) {
                        archiveProvider.mutate(selectedProviderId)
                      }
                    }}
                  >
                    <Trash2 size={14} /> {t('remove')}
                  </button>
                )}
                <Button
                    variant="primary"
                    className="h-8"
                  disabled={saveProvider.isPending || !draft.name || !draft.baseUrl}
                  onClick={() => saveProvider.mutate()}
                >
                  {saveProvider.isPending ? (
                    <LoaderCircle size={14} className="kw-spinner" />
                  ) : (
                    <Save size={14} />
                  )}
                  {t('save')}
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {showIdentityFields && (
                <>
                  <label className="text-xs font-medium text-kw-text-secondary">
                    {t('provider')}
                    <select
                      className={fieldClassName}
                      value={draft.catalogOption}
                      onChange={(event) =>
                        changeCatalogOption(event.target.value as ProviderCatalogOption)
                      }
                    >
                      {PROVIDER_CATALOG_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {catalogLabels[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-kw-text-secondary">
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
                </>
              )}
              {showProtocol && (
                <label className="text-xs font-medium text-kw-text-secondary">
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
                    {protocolsByKind.openai.map((protocol) => (
                      <option key={protocol} value={protocol}>
                        {protocolLabels[protocol]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-xs font-medium text-kw-text-secondary">
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
              <label className="text-xs font-medium text-kw-text-secondary sm:col-span-2">
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
              <label className="text-xs font-medium text-kw-text-secondary sm:col-span-2">
                <span className="flex items-center justify-between">
                  <span>{t('apiKey')}</span>
                  {selectedProvider?.credentialConfigured && !draft.removeApiKey && (
                    <span className="flex items-center gap-1 font-normal text-kw-success">
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
                  <label className="mt-2 flex items-center gap-2 text-xs font-normal text-kw-text-muted">
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
            </div>

            {saveProvider.error && (
              <p className="mt-3 text-xs text-kw-danger">
                {saveProvider.error instanceof Error ? saveProvider.error.message : t('error')}
              </p>
            )}

            {!creating && selectedProviderId && (
              <section className="mt-6 border-t border-kw-border-default pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-kw-text-primary">
                      {t('providerModels')}
                    </h4>
                    <p className="mt-1 text-xs text-kw-text-muted">
                      {t('providerModelsDescription')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={refreshModels.isPending}
                    onClick={() => refreshModels.mutate(selectedProviderId)}
                  >
                    <RefreshCw
                      size={14}
                      className={refreshModels.isPending ? 'kw-spinner' : ''}
                    />
                    {t('refreshModels')}
                  </Button>
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    className="h-9 min-w-0 flex-1 rounded-md border border-kw-border-default bg-kw-surface px-2.5 text-sm outline-none focus-visible:border-kw-accent"
                    placeholder={t('manualModelPlaceholder')}
                    value={manualModel}
                    onChange={(event) => setManualModel(event.target.value)}
                  />
                  <input
                    aria-label={t('contextWindowTokens')}
                    className="h-9 w-32 rounded-md border border-kw-border-default bg-kw-surface px-2.5 text-sm outline-none focus-visible:border-kw-accent"
                    type="number"
                    min={1}
                    value={manualContext}
                    onChange={(event) => setManualContext(Number(event.target.value))}
                  />
                  <Button
                    disabled={!manualModel.trim() || addModel.isPending}
                    onClick={() => addModel.mutate()}
                  >
                    <Plus size={14} /> {t('addModel')}
                  </Button>
                </div>

                {(refreshModels.error || addModel.error) && (
                  <p className="mt-3 text-xs text-kw-danger">
                    {(refreshModels.error ?? addModel.error) instanceof Error
                      ? (refreshModels.error ?? (addModel.error as Error)).message
                      : t('error')}
                  </p>
                )}

                <div className="mt-3 divide-y divide-kw-border-subtle border-y border-kw-border-subtle">
                  {selectedModels.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex min-h-11 items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-kw-text-secondary">{profile.name}</div>
                        <div className="truncate font-mono text-[11px] text-kw-text-muted">
                          {profile.model} · {profile.contextWindowTokens.toLocaleString()} tokens
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
                    <div className="flex items-center gap-2 py-5 text-xs text-kw-text-muted">
                      <Server size={15} /> {t('noModels')}
                    </div>
                  )}
                </div>
              </section>
            )}
          </Reveal>
        ) : (
          <div className="grid h-full place-items-center px-8 text-center text-sm text-kw-text-muted">
            {t('selectProvider')}
          </div>
        )}
      </div>
    </div>
  )
}

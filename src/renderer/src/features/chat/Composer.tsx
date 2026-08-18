import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronUp, CircleHelp, Gauge, Send, ShieldCheck, Square } from 'lucide-react'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ModelProfileDto,
  PermissionMode,
  ProviderDto,
  RunDto,
  ThreadDto
} from '@kowork/contracts'
import { Button, Reveal, SelectableItem, SelectableList, Surface } from '@kowork/design-system'
import { ApprovalBanner } from '../approvals/ApprovalBanner'

interface ComposerProps {
  thread: ThreadDto
  providers: ProviderDto[]
  profiles: ModelProfileDto[]
  activeRun?: RunDto
  queuedCount: number
  onHeightChange?(height: number): void
}

function groupProfilesByProvider(
  profiles: ModelProfileDto[],
  providers: ProviderDto[]
): Array<{ id: string; name: string; profiles: ModelProfileDto[] }> {
  const profilesByProvider = new Map<string, ModelProfileDto[]>()
  for (const profile of profiles) {
    const list = profilesByProvider.get(profile.providerId)
    if (list) list.push(profile)
    else profilesByProvider.set(profile.providerId, [profile])
  }

  const groups: Array<{ id: string; name: string; profiles: ModelProfileDto[] }> = []
  const seen = new Set<string>()
  for (const provider of providers) {
    const providerProfiles = profilesByProvider.get(provider.id)
    if (!providerProfiles?.length) continue
    groups.push({ id: provider.id, name: provider.name, profiles: providerProfiles })
    seen.add(provider.id)
  }
  for (const [providerId, providerProfiles] of profilesByProvider) {
    if (seen.has(providerId)) continue
    groups.push({ id: providerId, name: providerId, profiles: providerProfiles })
  }
  return groups
}

const permissionModes: PermissionMode[] = ['ask', 'auto', 'yolo']

export function Composer({
  thread,
  providers,
  profiles,
  activeRun,
  queuedCount,
  onHeightChange
}: ComposerProps): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const enqueue = useMutation({
    mutationFn: () => window.kowork.runs.enqueue(thread.id, value.trim()),
    onSuccess: () => {
      setValue('')
      if (textarea.current) textarea.current.style.height = 'auto'
      void queryClient.invalidateQueries({ queryKey: ['queue', thread.id] })
    }
  })
  const cancel = useMutation({ mutationFn: () => window.kowork.runs.cancel(activeRun!.id) })
  const updateThread = useMutation({
    mutationFn: (changes: Partial<Pick<ThreadDto, 'modelProfileId' | 'permissionMode'>>) =>
      window.kowork.threads.update(thread.id, changes),
    onSuccess: (updated) =>
      queryClient.setQueryData<ThreadDto[]>(['threads', thread.projectId], (current = []) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
  })
  const submit = (): void => {
    if (value.trim() && !enqueue.isPending) enqueue.mutate()
  }
  const selectedProfile = profiles.find((profile) => profile.id === thread.modelProfileId)
  const groupedProfiles = groupProfilesByProvider(profiles, providers)
  const modeIcons: Record<PermissionMode, React.ReactNode> = {
    ask: <CircleHelp size={14} />,
    auto: <ShieldCheck size={14} />,
    yolo: <Gauge size={14} />
  }
  const modeLabels: Record<PermissionMode, string> = {
    ask: t('permissionAsk'),
    auto: t('permissionAuto'),
    yolo: t('permissionYolo')
  }

  useLayoutEffect(() => {
    const element = container.current
    if (!element || !onHeightChange) return
    const updateHeight = (): void =>
      onHeightChange(Math.ceil(element.getBoundingClientRect().height))
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [onHeightChange])

  return (
    <div
      ref={container}
      data-chat-composer-overlay
      className="pointer-events-none absolute bottom-0 z-10"
    >
      <div data-chat-composer-frame className="mx-auto w-full max-w-[860px] px-5 pb-2.5 sm:px-8">
        <ApprovalBanner threadId={thread.id} />
        <div className="relative">
          <div
            aria-hidden="true"
            data-chat-composer-occlusion
            className="absolute inset-x-0 -bottom-2.5 top-4 bg-kw-surface"
          />
          <Surface asChild variant="card">
            <div
              data-chat-composer
              className="pointer-events-auto relative rounded-xl border-kw-border-default/80 bg-kw-surface shadow-kw-composer focus-within:border-kw-border-default"
            >
              <textarea
                ref={textarea}
                value={value}
                rows={1}
                className="max-h-40 min-h-14 w-full resize-none border-0 bg-transparent px-4 pb-2 pt-4 text-sm leading-6 text-kw-text-primary outline-none placeholder:text-kw-text-faint"
                placeholder={t('promptPlaceholder')}
                onChange={(event) => {
                  setValue(event.target.value)
                  event.currentTarget.style.height = 'auto'
                  event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit()
                  }
                }}
              />
              <div className="flex min-h-11 items-center justify-between gap-3 px-3 pb-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <DropdownMenu.Root open={modelMenuOpen} onOpenChange={setModelMenuOpen}>
                    <DropdownMenu.Trigger asChild>
                      <Button
                        data-model-selector
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1.5 px-2 text-xs"
                      >
                        <span className="max-w-36 truncate">
                          {selectedProfile?.name ?? t('model')}
                        </span>
                        <ChevronUp size={12} />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content side="top" align="start" asChild>
                        <Reveal asChild variant="from-bottom">
                          <Surface
                            variant="popover"
                            className="z-50 max-h-80 min-w-48 overflow-y-auto p-1 outline-none"
                          >
                            {groupedProfiles.map((group, index) => (
                              <Fragment key={group.id}>
                                {index > 0 && (
                                  <DropdownMenu.Separator className="my-1 h-px bg-kw-border-subtle" />
                                )}
                                <DropdownMenu.Group>
                                  <DropdownMenu.Label className="px-2 py-1.5 text-[10px] font-medium text-kw-text-faint">
                                    {group.name}
                                  </DropdownMenu.Label>
                                  {group.profiles.map((profile) => (
                                    <SelectableItem
                                      key={profile.id}
                                      selected={profile.id === selectedProfile?.id}
                                      asChild
                                    >
                                      <DropdownMenu.Item
                                        disabled={!profile.available}
                                        onSelect={() =>
                                          updateThread.mutate({ modelProfileId: profile.id })
                                        }
                                        className="flex w-full cursor-default items-center rounded-md px-2 py-2 text-xs text-kw-text-secondary outline-none data-[disabled]:opacity-40"
                                      >
                                        {profile.name}
                                      </DropdownMenu.Item>
                                    </SelectableItem>
                                  ))}
                                </DropdownMenu.Group>
                              </Fragment>
                            ))}
                          </Surface>
                        </Reveal>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                  <SelectableList
                    data-permission-selector
                    value={thread.permissionMode}
                    orientation="horizontal"
                    selectionStyle="sliding"
                    className="relative grid h-8 grid-cols-3 rounded-md border border-kw-border-default bg-kw-surface-subtle p-[3px] [--kw-color-selection-active:var(--kw-color-selection-active-strong)]"
                  >
                    {permissionModes.map((mode) => (
                      <SelectableItem key={mode} value={mode} asChild>
                        <button
                          aria-pressed={thread.permissionMode === mode}
                          className={`relative z-10 flex h-6 min-w-[52px] items-center justify-center gap-1 rounded-sm px-2 text-[11px] font-medium ${thread.permissionMode === mode ? 'text-kw-text-primary' : 'text-kw-text-muted'}`}
                          onClick={() => updateThread.mutate({ permissionMode: mode })}
                        >
                          {modeIcons[mode]}
                          {modeLabels[mode]}
                        </button>
                      </SelectableItem>
                    ))}
                  </SelectableList>
                  {queuedCount > 0 && (
                    <span className="text-[11px] text-kw-text-muted">
                      {t('queue')} {queuedCount}
                    </span>
                  )}
                </div>
                {activeRun ? (
                  <Button
                    aria-label={t('cancel')}
                    onClick={() => cancel.mutate()}
                    size="sm"
                    variant="ghost"
                    className="size-8 shrink-0 rounded-full bg-kw-text-primary p-0 text-kw-text-inverse hover:bg-kw-text-secondary hover:text-kw-text-inverse"
                  >
                    <Square size={13} fill="currentColor" />
                  </Button>
                ) : (
                  <Button
                    aria-label={t('send')}
                    onClick={submit}
                    disabled={!value.trim()}
                    size="sm"
                    variant="primary"
                    className="size-8 shrink-0 rounded-full p-0 disabled:bg-kw-border-default disabled:text-kw-text-faint"
                  >
                    <Send size={15} />
                  </Button>
                )}
              </div>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  )
}

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronUp, CircleHelp, Gauge, Send, ShieldCheck, Square } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelProfileDto, PermissionMode, RunDto, ThreadDto } from '@kowork/contracts'
import { ApprovalBanner } from '../approvals/ApprovalBanner'

interface ComposerProps {
  thread: ThreadDto
  profiles: ModelProfileDto[]
  activeRun?: RunDto
  queuedCount: number
  onHeightChange?(height: number): void
}

const permissionModes: PermissionMode[] = ['ask', 'auto', 'yolo']

export function Composer({
  thread,
  profiles,
  activeRun,
  queuedCount,
  onHeightChange
}: ComposerProps): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
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
  const selectedModeIndex = permissionModes.indexOf(thread.permissionMode)

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
      className="pointer-events-none absolute bottom-0 left-0 right-[10px] z-10"
    >
      <div className="mx-auto w-full max-w-[860px] px-5 pb-2.5 sm:px-8">
        <ApprovalBanner threadId={thread.id} />
        <div className="relative">
          <div
            aria-hidden="true"
            data-chat-composer-occlusion
            className="absolute inset-x-0 -bottom-2.5 top-4 bg-white"
          />
          <div
            data-chat-composer
            className="pointer-events-auto relative rounded-2xl border border-neutral-300 bg-white shadow-sm transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/15 motion-reduce:transition-none"
          >
            <textarea
              ref={textarea}
              value={value}
              rows={1}
              className="max-h-40 min-h-14 w-full resize-none border-0 bg-transparent px-4 pb-2 pt-4 text-sm leading-6 text-neutral-900 outline-none placeholder:text-neutral-400"
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
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    data-model-selector
                    className="flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 text-xs text-neutral-700 hover:bg-neutral-100"
                  >
                    <Bot size={14} />{' '}
                    <span className="max-w-36 truncate">{selectedProfile?.name ?? t('model')}</span>
                    <ChevronUp size={12} />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      side="top"
                      align="start"
                      className="z-50 min-w-56 rounded-md border border-neutral-200 bg-white p-1 shadow-xl"
                    >
                      {profiles.map((profile) => (
                        <DropdownMenu.Item
                          key={profile.id}
                          disabled={!profile.available}
                          onSelect={() => updateThread.mutate({ modelProfileId: profile.id })}
                          className="flex cursor-default items-center justify-between rounded px-2 py-2 text-xs text-neutral-700 outline-none hover:bg-neutral-100 data-[disabled]:opacity-40"
                        >
                          <span>{profile.name}</span>
                          <span className="font-mono text-[10px] text-neutral-400">
                            {profile.model}
                          </span>
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
                <div
                  data-permission-selector
                  className="relative grid h-8 grid-cols-3 rounded-md border border-neutral-200 bg-neutral-50 p-[3px]"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-[3px] grid grid-cols-3"
                  >
                    <span
                      className="col-start-1 row-start-1 rounded-[4px] bg-blue-50 shadow-sm ring-1 ring-blue-100 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{ transform: `translateX(${selectedModeIndex * 100}%)` }}
                    />
                  </div>
                  {permissionModes.map((mode) => (
                    <button
                      key={mode}
                      aria-pressed={thread.permissionMode === mode}
                      className={`relative z-10 flex h-6 min-w-[52px] items-center justify-center gap-1 rounded-[4px] px-2 text-[11px] transition-colors duration-200 ${thread.permissionMode === mode ? 'font-medium text-blue-700' : 'text-neutral-500 hover:bg-neutral-100/70 hover:text-neutral-800'}`}
                      onClick={() => updateThread.mutate({ permissionMode: mode })}
                    >
                      {modeIcons[mode]}
                      {modeLabels[mode]}
                    </button>
                  ))}
                </div>
                {queuedCount > 0 && (
                  <span className="text-[11px] text-neutral-500">
                    {t('queue')} {queuedCount}
                  </span>
                )}
              </div>
              {activeRun ? (
                <button
                  aria-label={t('cancel')}
                  onClick={() => cancel.mutate()}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-900 text-white hover:bg-black"
                >
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button
                  aria-label={t('send')}
                  onClick={submit}
                  disabled={!value.trim()}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400"
                >
                  <Send size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

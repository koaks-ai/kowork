import {
  Activity,
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  Split,
  TerminalSquare
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RunEventDto } from '@kowork/contracts'
import { AnimatedDisclosure } from '../../shared/ui/AnimatedDisclosure'
import { MarkdownContent } from '../../shared/ui/MarkdownContent'
import { IconButton } from '../../shared/ui/IconButton'
import { collectTimeline, type ReasoningActivity, type ToolActivity } from './timeline-model'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

function nextStreamingFrame(current: string, target: string): string {
  if (!target.startsWith(current)) return target
  const remaining = target.length - current.length
  if (remaining <= 0) return current

  let end = current.length + Math.max(1, Math.ceil(remaining * 0.22))
  const previousCodeUnit = target.charCodeAt(end - 1)
  const nextCodeUnit = target.charCodeAt(end)
  if (
    end < target.length &&
    previousCodeUnit >= 0xd800 &&
    previousCodeUnit <= 0xdbff &&
    nextCodeUnit >= 0xdc00 &&
    nextCodeUnit <= 0xdfff
  ) {
    end += 1
  }
  return target.slice(0, end)
}

function StreamingMarkdown({
  content,
  active
}: {
  content: string
  active: boolean
}): React.JSX.Element {
  const reducedMotion = prefersReducedMotion()
  const [displayed, setDisplayed] = useState(() => (active && !reducedMotion ? '' : content))
  const displayedRef = useRef(displayed)
  const targetRef = useRef(content)
  const activeRef = useRef(active)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    targetRef.current = content
    activeRef.current = active

    if (!active || reducedMotion || !content.startsWith(displayedRef.current)) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        displayedRef.current = targetRef.current
        setDisplayed(targetRef.current)
      })
      return
    }

    const reveal = (): void => {
      const next = nextStreamingFrame(displayedRef.current, targetRef.current)
      if (next !== displayedRef.current) {
        displayedRef.current = next
        setDisplayed(next)
      }
      if (activeRef.current && next !== targetRef.current) {
        frameRef.current = requestAnimationFrame(reveal)
      } else {
        frameRef.current = null
      }
    }

    if (frameRef.current === null && displayedRef.current !== content) {
      frameRef.current = requestAnimationFrame(reveal)
    }
  }, [active, content, reducedMotion])

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    },
    []
  )

  return (
    <div
      className={active ? 'kowork-stream-enter' : undefined}
      data-streaming={active || undefined}
    >
      <MarkdownContent content={displayed} />
    </div>
  )
}

function useClipboardCopy(text?: string): {
  copyState: 'idle' | 'copied' | 'failed'
  copy(): Promise<void>
} {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    },
    []
  )

  const copy = async (): Promise<void> => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setCopyState('idle'), 5_000)
  }

  return { copyState, copy }
}

function UserMessageCopyAction({ text }: { text: string }): React.JSX.Element {
  const { t } = useTranslation()
  const { copyState, copy } = useClipboardCopy(text)
  const label =
    copyState === 'copied'
      ? t('copied')
      : copyState === 'failed'
        ? t('copyFailed')
        : t('copyMessage')

  return (
    <IconButton
      label={label}
      data-user-message-action="copy"
      className="!size-7"
      onClick={() => void copy()}
    >
      {copyState === 'copied' ? <Check size={15} /> : <Copy size={15} />}
    </IconButton>
  )
}

function RunActions({ copyText }: { copyText?: string }): React.JSX.Element {
  const { t } = useTranslation()
  const { copyState, copy } = useClipboardCopy(copyText)

  const copyLabel =
    copyState === 'copied'
      ? t('copied')
      : copyState === 'failed'
        ? t('copyFailed')
        : t('copyFinalResponse')

  return (
    <div data-run-actions className="mt-3 flex items-center gap-0.5">
      <IconButton
        label={copyLabel}
        data-run-action="copy"
        disabled={!copyText}
        onClick={() => void copy()}
      >
        {copyState === 'copied' ? <Check size={16} /> : <Copy size={16} />}
      </IconButton>
      <IconButton label={t('branchUnavailable')} data-run-action="branch" disabled>
        <Split size={17} className="rotate-90" />
      </IconButton>
    </div>
  )
}

function ReasoningActivityView({
  activity,
  active,
  label
}: {
  activity: ReasoningActivity
  active: boolean
  label: string
}): React.JSX.Element {
  const [mode, setMode] = useState<'collapsed' | 'preview' | 'expanded'>(
    active ? 'preview' : 'collapsed'
  )
  const [previousActive, setPreviousActive] = useState(active)
  const preview = useRef<HTMLPreElement>(null)

  if (active !== previousActive) {
    setPreviousActive(active)
    setMode(active ? 'preview' : 'collapsed')
  }

  useLayoutEffect(() => {
    if (mode === 'preview' && preview.current) {
      preview.current.scrollTop = preview.current.scrollHeight
    }
  }, [activity.text, mode])

  const open = mode !== 'collapsed'

  return (
    <div data-run-content="reasoning" className="text-neutral-500">
      <button
        type="button"
        aria-expanded={open}
        onClick={() =>
          setMode((current) => {
            if (current === 'collapsed' || current === 'preview') return 'expanded'
            return 'collapsed'
          })
        }
        className="flex items-center gap-2 text-sm font-[450] leading-6 transition-colors hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
      >
        <Brain size={14} className="shrink-0" />
        <span>{label}</span>
        <ChevronDown
          size={13}
          className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${
            open ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>
      <AnimatedDisclosure open={open}>
        <div className="pt-2">
          <pre
            ref={preview}
            className={`select-text whitespace-pre-wrap break-words font-sans text-[15px] leading-6 text-neutral-500 [overflow-wrap:anywhere] ${
              mode === 'preview' ? 'max-h-60 overflow-y-hidden' : ''
            }`}
          >
            {activity.text}
          </pre>
        </div>
      </AnimatedDisclosure>
    </div>
  )
}

function formatDuration(milliseconds: number, t: ReturnType<typeof useTranslation>['t']): string {
  const seconds = Math.floor(milliseconds / 1_000)
  if (seconds < 1) return t('lessThanOneSecond')
  if (seconds < 60) return t('seconds', { count: seconds })
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return t('minutes', { count: minutes })
  return t('minutesAndSeconds', { minutes, seconds: remainingSeconds })
}

function parseArguments(argumentsJson: string): unknown {
  try {
    return JSON.parse(argumentsJson)
  } catch {
    return argumentsJson
  }
}

function formatArguments(argumentsJson: string): string {
  const parsed = parseArguments(argumentsJson)
  return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)
}

function summarizeArguments(argumentsJson: string): string {
  const parsed = parseArguments(argumentsJson)
  let summary = argumentsJson
  if (typeof parsed === 'string') {
    summary = parsed
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const values = parsed as Record<string, unknown>
    const preferred = ['path', 'filePath', 'command', 'query', 'pattern']
      .map((key) => values[key])
      .find((value) => typeof value === 'string')
    summary = typeof preferred === 'string' ? preferred : JSON.stringify(parsed)
  } else {
    summary = JSON.stringify(parsed)
  }
  return summary
}

function ToolActivityView({ activity }: { activity: ToolActivity }): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const hasResult = activity.isError !== undefined

  return (
    <div data-run-content="tool" className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="group/trigger flex w-full items-center gap-2 overflow-hidden text-left text-sm leading-6 text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
      >
        <TerminalSquare
          size={14}
          className="shrink-0 transition-colors group-hover/trigger:text-blue-600"
        />
        <span className="flex min-w-0 items-center overflow-hidden whitespace-nowrap">
          <span
            className={`shrink-0 font-mono font-medium transition-colors ${
              activity.isError
                ? 'text-red-600 group-hover/trigger:text-red-700'
                : 'text-neutral-500 group-hover/trigger:text-neutral-800'
            }`}
          >
            {activity.name || t('unknownTool')}
          </span>
          {activity.argumentsJson && (
            <span className="ml-2 min-w-0 truncate text-neutral-400 transition-colors group-hover/trigger:text-neutral-600">
              {summarizeArguments(activity.argumentsJson)}
            </span>
          )}
          <span className="ml-1.5 inline-flex shrink-0 items-center gap-1 align-middle">
            {!hasResult ? <span className="text-neutral-400">{t('toolRunning')}</span> : null}
            <ChevronDown
              size={13}
              className={`shrink-0 transition-[color,transform] duration-300 ease-out motion-reduce:transition-none group-hover/trigger:text-blue-600 ${
                open ? 'rotate-0' : '-rotate-90'
              }`}
            />
          </span>
        </span>
      </button>
      <AnimatedDisclosure open={open}>
        <div className="mt-2 overflow-hidden rounded-md border border-neutral-200 bg-white">
          {activity.argumentsJson && (
            <div className="border-b border-neutral-200 px-3 py-2.5">
              <div className="mb-1.5 text-[10px] font-semibold uppercase text-neutral-400">
                {t('toolInput')}
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-neutral-600 [overflow-wrap:anywhere]">
                {formatArguments(activity.argumentsJson)}
              </pre>
            </div>
          )}
          <div className="px-3 py-2.5">
            <div className="mb-1.5 text-[10px] font-semibold uppercase text-neutral-400">
              {t('toolOutput')}
            </div>
            {hasResult ? (
              <pre
                className={`max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 [overflow-wrap:anywhere] ${
                  activity.isError ? 'text-red-700' : 'text-neutral-600'
                }`}
              >
                {activity.output || t('emptyToolOutput')}
              </pre>
            ) : (
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Clock3 size={12} className="animate-pulse" />
                {t('toolRunning')}
              </div>
            )}
          </div>
        </div>
      </AnimatedDisclosure>
    </div>
  )
}

export function Timeline({ events }: { events: RunEventDto[] }): React.JSX.Element {
  const { t } = useTranslation()
  const items = collectTimeline(events)

  return (
    <div
      data-chat-content
      className="mx-auto w-full max-w-[860px] space-y-10 px-5 py-8 sm:px-8 sm:py-10"
    >
      {items.map((item) => {
        const reasoningCount = item.activities.filter(
          (activity) => activity.kind === 'reasoning'
        ).length
        const toolCount = item.activities.filter((activity) => activity.kind === 'tool').length
        const duration = formatDuration(
          Math.max(0, (item.finishedAt ?? item.lastEventAt) - item.startedAt),
          t
        )
        const summary = [
          item.status ? t('workedFor', { duration }) : t('workingFor', { duration }),
          toolCount > 0 ? t('toolCount', { count: toolCount }) : null,
          reasoningCount > 0 ? t('reasoningCount', { count: reasoningCount }) : null
        ].filter(Boolean)
        const lastActivity = item.activities.at(-1)
        const activeReasoningId =
          !item.status &&
          item.lastEventType === 'run.reasoning' &&
          lastActivity?.kind === 'reasoning'
            ? lastActivity.id
            : undefined
        const activeTextId =
          !item.status && item.lastEventType === 'run.text' && lastActivity?.kind === 'text'
            ? lastActivity.id
            : undefined

        return (
          <article key={item.runId} className="space-y-6">
            {item.input && (
              <div className="group/user-message flex flex-col items-end">
                <div
                  data-user-message
                  className="max-w-[80%] select-text rounded-2xl bg-[#f3f3f3] px-3 py-1.5 text-neutral-900 sm:max-w-[72%]"
                >
                  <MarkdownContent content={item.input} />
                </div>
                <div
                  data-user-message-meta
                  className="pointer-events-none mt-1 flex h-7 items-center gap-0.5 pr-0.5 opacity-0 transition-opacity duration-150 group-focus-within/user-message:pointer-events-auto group-focus-within/user-message:opacity-100 group-hover/user-message:pointer-events-auto group-hover/user-message:opacity-100 motion-reduce:transition-none"
                >
                  <time className="mr-1 text-[10px] tabular-nums text-neutral-400">
                    {new Date(item.startedAt).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })}
                  </time>
                  <UserMessageCopyAction text={item.input} />
                </div>
              </div>
            )}

            <div className="min-w-0">
              <div className="mb-4 flex items-center gap-2 text-xs font-medium text-neutral-500">
                <Activity
                  size={14}
                  className={item.status ? 'text-neutral-400' : 'animate-pulse text-blue-600'}
                />
                <span>{summary.join(' · ')}</span>
              </div>

              {item.activities.length > 0 ? (
                <div className="kowork-run-activities">
                  {item.activities.map((activity) => {
                    if (activity.kind === 'text') {
                      return (
                        <div
                          key={activity.id}
                          data-run-content="text"
                          data-output-kind={activity.role}
                          className="select-text"
                        >
                          <StreamingMarkdown
                            content={activity.text}
                            active={activity.id === activeTextId}
                          />
                        </div>
                      )
                    }

                    if (activity.kind === 'compression') {
                      return (
                        <details
                          key={activity.id}
                          data-run-content="compression"
                          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500"
                        >
                          <summary className="cursor-pointer font-medium text-neutral-700">
                            {t('compressed')}
                          </summary>
                          <MarkdownContent
                            content={activity.summary}
                            variant="compact"
                            className="mt-2 text-neutral-500"
                          />
                        </details>
                      )
                    }

                    if (activity.kind === 'reasoning') {
                      return (
                        <ReasoningActivityView
                          key={activity.id}
                          activity={activity}
                          active={activity.id === activeReasoningId}
                          label={t('reasoning')}
                        />
                      )
                    }

                    return <ToolActivityView key={activity.id} activity={activity} />
                  })}
                </div>
              ) : !item.status ? (
                <div className="flex items-center gap-2 text-sm text-neutral-400">
                  <Clock3 size={14} className="animate-pulse" />
                  {t('running')}
                </div>
              ) : null}

              {item.status === 'completed' ? (
                <RunActions copyText={item.copyText} />
              ) : item.status ? (
                <div className="mt-5 flex items-center gap-1.5 text-xs text-red-600">
                  <CircleAlert size={14} />
                  {t(item.status)}
                  {item.error ? ` · ${item.error}` : ''}
                </div>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

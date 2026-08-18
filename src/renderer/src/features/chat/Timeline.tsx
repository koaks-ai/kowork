import {
  Activity,
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  Link2,
  ShieldAlert,
  Sparkles,
  Split,
  TerminalSquare
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RunEventDto } from '@kowork/contracts'
import { Disclosure, IconButton, Reveal, Surface } from '@kowork/design-system'
import { MarkdownContent } from '../../shared/ui/MarkdownContent'
import {
  collectTimeline,
  type AnnotationActivity,
  type ReasoningActivity,
  type RefusalActivity,
  type ToolActivity
} from './timeline-model'

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

  const renderedContent = <MarkdownContent content={displayed} />
  return active ? (
    <Reveal variant="stream" data-streaming>
      {renderedContent}
    </Reveal>
  ) : (
    <div>{renderedContent}</div>
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
  active
}: {
  activity: ReasoningActivity
  active: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'collapsed' | 'preview' | 'expanded'>(
    active ? 'preview' : 'collapsed'
  )
  const [previousActive, setPreviousActive] = useState(active)
  const [overflowing, setOverflowing] = useState(false)
  const preview = useRef<HTMLDivElement>(null)

  if (active !== previousActive) {
    setPreviousActive(active)
    setMode(active ? 'preview' : 'collapsed')
  }

  useLayoutEffect(() => {
    const element = preview.current
    if (!element || mode !== 'preview') {
      setOverflowing(false)
      return
    }

    element.scrollTop = element.scrollHeight
    setOverflowing(element.scrollHeight - element.clientHeight > 1)
  }, [activity.text, mode])

  const open = mode !== 'collapsed'
  const showOverflowRule = mode === 'preview' && overflowing
  const label =
    activity.reasoningKind === 'summary'
      ? t('reasoningSummary')
      : activity.reasoningKind === 'raw'
        ? t('rawReasoning')
        : t('reasoning')

  return (
    <Disclosure.Root
      open={open}
      onOpenChange={() =>
        setMode((current) => {
          if (current === 'collapsed' || current === 'preview') return 'expanded'
          return 'collapsed'
        })
      }
    >
    <div
      data-run-content="reasoning"
      data-reasoning-kind={activity.reasoningKind}
      className="text-kw-text-muted"
    >
      <Disclosure.Trigger asChild>
      <button
        type="button"
        className="kw-focus-ring flex items-center gap-2 text-sm font-[450] leading-6 hover:text-kw-text-secondary"
      >
        {activity.reasoningKind === 'summary' ? (
          <Sparkles size={14} className="shrink-0 text-kw-info" />
        ) : (
          <Brain size={14} className="shrink-0" />
        )}
        <span>{label}</span>
        <Disclosure.Chevron open={open} direction="down" asChild>
          <ChevronDown size={13} />
        </Disclosure.Chevron>
      </button>
      </Disclosure.Trigger>
      <Disclosure.Content>
        <div className="relative pt-2">
          <div
            ref={preview}
            data-reasoning-body
            className={`select-text ${mode === 'preview' ? 'max-h-60 overflow-y-hidden' : ''}`}
          >
            <MarkdownContent content={activity.text} tone="muted" />
          </div>
          {showOverflowRule ? (
            <div
              data-reasoning-overflow-rule
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-kw-border-strong/25"
            />
          ) : null}
        </div>
      </Disclosure.Content>
    </div>
    </Disclosure.Root>
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
  const pendingLabel = activity.requested ? t('toolRunning') : t('toolPreparing')

  return (
    <Disclosure.Root open={open} onOpenChange={setOpen}>
    <div data-run-content="tool" className="min-w-0">
      <Disclosure.Trigger asChild>
      <button
        type="button"
        className="kw-focus-ring group/trigger flex w-full items-center gap-2 overflow-hidden text-left text-sm leading-6 text-kw-text-secondary hover:text-kw-text-primary"
      >
        <TerminalSquare
          size={14}
          className="shrink-0 group-hover/trigger:text-kw-accent"
        />
        <span className="flex min-w-0 items-center overflow-hidden whitespace-nowrap">
          <span
            className={`shrink-0 font-mono font-medium ${
              activity.isError
                ? 'text-kw-danger'
                : 'text-kw-text-muted group-hover/trigger:text-kw-text-secondary'
            }`}
          >
            {activity.name || t('unknownTool')}
          </span>
          {activity.argumentsJson && (
            <span className="ml-2 min-w-0 truncate text-kw-text-faint group-hover/trigger:text-kw-text-secondary">
              {summarizeArguments(activity.argumentsJson)}
            </span>
          )}
          <span className="ml-1.5 inline-flex shrink-0 items-center gap-1 align-middle">
            {!hasResult ? <span className="text-kw-text-faint">{pendingLabel}</span> : null}
            <Disclosure.Chevron open={open} direction="down" asChild>
              <ChevronDown
                size={13}
                className="shrink-0 group-hover/trigger:text-kw-accent"
              />
            </Disclosure.Chevron>
          </span>
        </span>
      </button>
      </Disclosure.Trigger>
      <Disclosure.Content>
        <Surface variant="card" className="mt-2 overflow-hidden rounded-md">
          {activity.argumentsJson && (
            <div className="border-b border-kw-border-default px-3 py-2.5">
              <div className="mb-1.5 text-[10px] font-semibold uppercase text-kw-text-faint">
                {t('toolInput')}
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-kw-text-secondary [overflow-wrap:anywhere]">
                {formatArguments(activity.argumentsJson)}
              </pre>
            </div>
          )}
          <div className="px-3 py-2.5">
            <div className="mb-1.5 text-[10px] font-semibold uppercase text-kw-text-faint">
              {t('toolOutput')}
            </div>
            {hasResult ? (
              <pre
                className={`max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 [overflow-wrap:anywhere] ${
                  activity.isError ? 'text-kw-danger' : 'text-kw-text-secondary'
                }`}
              >
                {activity.output || t('emptyToolOutput')}
              </pre>
            ) : (
              <div className="flex items-center gap-2 text-xs text-kw-text-faint">
                <Clock3 size={12} className="kw-status-pulse" />
                {pendingLabel}
              </div>
            )}
          </div>
        </Surface>
      </Disclosure.Content>
    </div>
    </Disclosure.Root>
  )
}

function RefusalActivityView({ activity }: { activity: RefusalActivity }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div data-run-content="refusal" className="border-l-2 border-kw-danger-hover pl-3 text-kw-danger">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <ShieldAlert size={14} className="shrink-0 text-kw-danger" />
        <span>{t('modelRefusal')}</span>
      </div>
      <MarkdownContent content={activity.text} variant="compact" className="text-kw-danger" />
    </div>
  )
}

function annotationTitle(annotation: AnnotationActivity['annotations'][number]): string {
  if (annotation.type === 'url_citation') return annotation.title || annotation.url
  if (annotation.type === 'file_citation') return annotation.filename || annotation.fileId
  return annotation.kind
}

function AnnotationActivityView({ activity }: { activity: AnnotationActivity }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div data-run-content="annotations" className="text-sm text-kw-text-secondary">
      <div className="mb-1.5 flex items-center gap-2 font-medium text-kw-text-secondary">
        <Link2 size={14} className="shrink-0 text-kw-success" />
        <span>{t('citationCount', { count: activity.annotations.length })}</span>
      </div>
      <div className="space-y-1 pl-[22px]">
        {activity.annotations.map((annotation, index) =>
          annotation.type === 'url_citation' ? (
            <a
              key={`${annotation.url}:${index}`}
              href={annotation.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-kw-accent-foreground underline decoration-kw-accent-subtle underline-offset-2 hover:decoration-kw-accent"
            >
              {annotationTitle(annotation)}
            </a>
          ) : (
            <div key={`${annotationTitle(annotation)}:${index}`} className="truncate">
              {annotationTitle(annotation)}
            </div>
          )
        )}
      </div>
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
          !item.status && lastActivity?.kind === 'reasoning' ? lastActivity.id : undefined
        const activeTextId =
          !item.status && lastActivity?.kind === 'text' ? lastActivity.id : undefined

        return (
          <article key={item.runId} className="space-y-6">
            {item.input && (
              <div className="group/user-message flex flex-col items-end">
                <div
                  data-user-message
                  className="max-w-[80%] select-text rounded-xl bg-kw-surface-subtle px-3 py-1.5 text-kw-text-primary sm:max-w-[72%]"
                >
                  <MarkdownContent content={item.input} />
                </div>
                <div
                  data-user-message-meta
                  className="kw-hover-actions pointer-events-none mt-1 flex h-7 items-center gap-0.5 pr-0.5 opacity-0 group-focus-within/user-message:pointer-events-auto group-focus-within/user-message:opacity-100 group-hover/user-message:pointer-events-auto group-hover/user-message:opacity-100"
                >
                  <time className="mr-1 text-[10px] tabular-nums text-kw-text-faint">
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
              <div className="mb-4 flex items-center gap-2 text-xs font-medium text-kw-text-muted">
                <Activity
                  size={14}
                  className={item.status ? 'text-kw-text-faint' : 'kw-status-pulse text-kw-accent'}
                />
                <span>{summary.join(' · ')}</span>
              </div>

              {item.activities.length > 0 ? (
                <div className="kw-run-activities">
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
                          className="rounded-md border border-kw-border-default bg-kw-surface px-3 py-2 text-xs text-kw-text-muted"
                        >
                          <summary className="cursor-pointer font-medium text-kw-text-secondary">
                            {t('compressed')}
                          </summary>
                          <MarkdownContent
                            content={activity.summary}
                            variant="compact"
                            className="mt-2 text-kw-text-muted"
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
                        />
                      )
                    }

                    if (activity.kind === 'refusal') {
                      return <RefusalActivityView key={activity.id} activity={activity} />
                    }

                    if (activity.kind === 'annotations') {
                      return <AnnotationActivityView key={activity.id} activity={activity} />
                    }

                    return <ToolActivityView key={activity.id} activity={activity} />
                  })}
                </div>
              ) : !item.status ? (
                <div className="flex items-center gap-2 text-sm text-kw-text-faint">
                  <Clock3 size={14} className="kw-status-pulse" />
                  {t('running')}
                </div>
              ) : null}

              {item.status === 'completed' ? (
                <RunActions copyText={item.copyText} />
              ) : item.status ? (
                <div className="mt-5 flex items-center gap-1.5 text-xs text-kw-danger">
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

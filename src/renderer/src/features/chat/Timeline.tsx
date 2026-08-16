import {
  Activity,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  TerminalSquare
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RunEventDto } from '@kowork/contracts'
import { MarkdownContent } from '../../shared/ui/MarkdownContent'
import { collectTimeline, type ReasoningActivity, type ToolActivity } from './timeline-model'

function CollapsibleContent({
  open,
  children
}: {
  open: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
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
        className="flex items-center gap-2 text-xs font-medium transition-colors hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
      >
        <Brain size={14} className="shrink-0" />
        <span>{label}</span>
        <ChevronRight
          size={13}
          className={`transition-transform duration-200 motion-reduce:transition-none ${
            open ? 'rotate-90' : ''
          }`}
        />
      </button>
      <CollapsibleContent open={open}>
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
      </CollapsibleContent>
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
        className="group/trigger flex w-full items-center gap-2 overflow-hidden text-left text-xs text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
      >
        <TerminalSquare
          size={14}
          className="shrink-0 transition-colors group-hover/trigger:text-blue-600"
        />
        <span className="flex min-w-0 items-center overflow-hidden whitespace-nowrap">
          <span className="shrink-0 font-mono font-medium text-neutral-800 transition-colors group-hover/trigger:text-blue-700">
            {activity.name || t('unknownTool')}
          </span>
          {activity.argumentsJson && (
            <span className="ml-2 min-w-0 truncate text-neutral-400 transition-colors group-hover/trigger:text-neutral-600">
              {summarizeArguments(activity.argumentsJson)}
            </span>
          )}
          <span className="ml-1.5 inline-flex shrink-0 items-center gap-1 align-middle">
            {activity.isError ? (
              <span className="text-red-600">{t('toolFailed')}</span>
            ) : !hasResult ? (
              <span className="text-neutral-400">{t('toolRunning')}</span>
            ) : null}
            <ChevronRight
              size={13}
              className={`shrink-0 transition-[color,transform] duration-200 motion-reduce:transition-none group-hover/trigger:text-blue-600 ${
                open ? 'rotate-90' : ''
              }`}
            />
          </span>
        </span>
      </button>
      <CollapsibleContent open={open}>
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
      </CollapsibleContent>
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

        return (
          <article key={item.runId} className="space-y-6">
            {item.input && (
              <div className="flex flex-col items-end">
                <div className="max-w-[80%] rounded-lg bg-[#f3f3f3] px-3.5 py-2.5 text-neutral-900 sm:max-w-[72%]">
                  <MarkdownContent content={item.input} variant="compact" />
                </div>
                <time className="mt-1.5 pr-1 text-[10px] tabular-nums text-neutral-400">
                  {new Date(item.startedAt).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })}
                </time>
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
                <div className="space-y-5">
                  {item.activities.map((activity) => {
                    if (activity.kind === 'text') {
                      return (
                        <div key={activity.id} data-run-content="text" className="select-text">
                          <MarkdownContent content={activity.text} />
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

              {item.status && (
                <div
                  className={`mt-5 flex items-center gap-1.5 text-xs ${
                    item.status === 'completed' ? 'text-neutral-400' : 'text-red-600'
                  }`}
                >
                  {item.status === 'completed' ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <CircleAlert size={14} />
                  )}
                  {t(item.status)}
                  {item.error ? ` · ${item.error}` : ''}
                </div>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

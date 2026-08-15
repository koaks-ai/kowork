import {
  Activity,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  TerminalSquare
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { RunEventDto } from '@kowork/contracts'
import { MarkdownContent } from '../../shared/ui/MarkdownContent'
import { collectTimeline, type ReasoningActivity } from './timeline-model'

function ReasoningActivityView({
  activity,
  active,
  label
}: {
  activity: ReasoningActivity
  active: boolean
  label: string
}): React.JSX.Element {
  const details = useRef<HTMLDetailsElement>(null)
  const wasActive = useRef(active)

  useEffect(() => {
    if (details.current) {
      if (active) details.current.open = true
      else if (wasActive.current) details.current.open = false
    }
    wasActive.current = active
  }, [active])

  return (
    <details ref={details} data-run-content="reasoning" className="group text-neutral-500">
      <summary className="flex list-none items-center gap-2 text-xs font-medium hover:text-neutral-800 [&::-webkit-details-marker]:hidden">
        <Brain size={14} className="shrink-0" />
        <span>{label}</span>
        <ChevronRight size={13} className="transition-transform group-open:rotate-90" />
      </summary>
      <MarkdownContent
        content={activity.text}
        variant="compact"
        className="mt-2 pl-[22px] text-neutral-500"
      />
    </details>
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
  return summary.length > 88 ? `${summary.slice(0, 85)}...` : summary
}

export function Timeline({ events }: { events: RunEventDto[] }): React.JSX.Element {
  const { t } = useTranslation()
  const items = collectTimeline(events)

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-10 px-5 py-8 sm:px-8 sm:py-10">
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

                    const hasResult = activity.isError !== undefined
                    return (
                      <details key={activity.id} data-run-content="tool" className="group min-w-0">
                        <summary className="flex list-none items-start gap-2 text-xs text-neutral-600 hover:text-neutral-900 [&::-webkit-details-marker]:hidden">
                          <TerminalSquare size={14} className="mt-0.5 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="font-mono font-medium text-neutral-800">
                              {activity.name || t('unknownTool')}
                            </span>
                            {activity.argumentsJson && (
                              <span className="ml-2 break-all text-neutral-400">
                                {summarizeArguments(activity.argumentsJson)}
                              </span>
                            )}
                          </span>
                          <span
                            className={`shrink-0 ${
                              activity.isError
                                ? 'text-red-600'
                                : hasResult
                                  ? 'text-emerald-700'
                                  : 'text-neutral-400'
                            }`}
                          >
                            {activity.isError
                              ? t('toolFailed')
                              : hasResult
                                ? t('toolCompleted')
                                : t('toolRunning')}
                          </span>
                          <ChevronRight
                            size={13}
                            className="mt-0.5 shrink-0 transition-transform group-open:rotate-90"
                          />
                        </summary>
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
                      </details>
                    )
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

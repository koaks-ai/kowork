import type { Annotation, ModelEvent } from '@koaks/node'
import type { RunEventDto } from '@kowork/contracts'

export interface ReasoningActivity {
  id: string
  kind: 'reasoning'
  reasoningKind: 'legacy' | 'summary' | 'raw'
  itemRef?: string
  text: string
}

export interface TextActivity {
  id: string
  kind: 'text'
  role: 'process' | 'final'
  text: string
  step?: number
  itemRef?: string
}

export interface ToolActivity {
  id: string
  kind: 'tool'
  callId: string
  itemRef?: string
  name: string
  argumentsJson: string
  output: string
  requested: boolean
  isError?: boolean
  hasStreamedOutput?: boolean
}

export interface RefusalActivity {
  id: string
  kind: 'refusal'
  itemRef?: string
  text: string
}

export interface AnnotationActivity {
  id: string
  kind: 'annotations'
  itemRef?: string
  annotations: Annotation[]
}

export interface CompressionActivity {
  id: string
  kind: 'compression'
  summary: string
}

export type RunActivity =
  | TextActivity
  | ReasoningActivity
  | ToolActivity
  | RefusalActivity
  | AnnotationActivity
  | CompressionActivity
export type RunStatus = 'completed' | 'failed' | 'cancelled' | 'interrupted'

export interface RunTimelineItem {
  runId: string
  input?: string
  activities: RunActivity[]
  status?: RunStatus
  finalText?: string
  copyText?: string
  error?: string
  startedAt: number
  finishedAt?: number
  lastEventAt: number
  lastEventType?: RunEventDto['type']
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function modelEventFrom(event: RunEventDto): ModelEvent | undefined {
  const value = event.payload.event
  if (!value || typeof value !== 'object' || typeof Reflect.get(value, 'type') !== 'string') {
    return undefined
  }
  return value as ModelEvent
}

function findTool(item: RunTimelineItem, callId: string): ToolActivity | undefined {
  return item.activities.find(
    (activity): activity is ToolActivity => activity.kind === 'tool' && activity.callId === callId
  )
}

export function collectTimeline(events: RunEventDto[]): RunTimelineItem[] {
  const map = new Map<string, RunTimelineItem>()
  let currentRun: RunTimelineItem | undefined

  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    if (!event.runId) {
      if (event.type === 'memory.compressed' && currentRun && !currentRun.status) {
        currentRun.activities.push({
          id: event.id,
          kind: 'compression',
          summary: String(event.payload.summary ?? '')
        })
        currentRun.lastEventAt = event.createdAt
        currentRun.lastEventType = event.type
      }
      continue
    }
    const item = map.get(event.runId) ?? {
      runId: event.runId,
      activities: [],
      startedAt: event.createdAt,
      lastEventAt: event.createdAt
    }
    currentRun = item

    if (event.type === 'run.started') item.input = String(event.payload.input ?? '')
    if (event.type === 'run.text') {
      const text = String(event.payload.text ?? '')
      const step =
        typeof event.payload.step === 'number' && Number.isInteger(event.payload.step)
          ? event.payload.step
          : undefined
      const itemRef = stringValue(event.payload.itemRef)
      const previous = item.activities.at(-1)
      if (previous?.kind === 'text' && previous.step === step && previous.itemRef === itemRef) {
        previous.text += text
      } else {
        item.activities.push({
          id: event.id,
          kind: 'text',
          role: 'process',
          text,
          step,
          itemRef
        })
      }
    }
    if (event.type === 'run.reasoning') {
      const text = String(event.payload.text ?? '')
      const itemRef = stringValue(event.payload.itemRef)
      const reasoningKind =
        event.payload.kind === 'summary'
          ? 'summary'
          : event.payload.kind === 'raw'
            ? 'raw'
            : 'legacy'
      const previous = item.activities.at(-1)
      if (
        previous?.kind === 'reasoning' &&
        previous.reasoningKind === reasoningKind &&
        previous.itemRef === itemRef
      ) {
        previous.text += text
      } else {
        item.activities.push({
          id: event.id,
          kind: 'reasoning',
          reasoningKind,
          itemRef,
          text
        })
      }
    }
    if (event.type === 'run.tool-call-delta') {
      const detail = modelEventFrom(event)
      if (detail?.type === 'tool_call_delta') {
        const tool = findTool(item, detail.id) ?? {
          id: `tool:${detail.id}`,
          kind: 'tool' as const,
          callId: detail.id,
          itemRef: detail.itemRef,
          name: '',
          argumentsJson: '',
          output: '',
          requested: false
        }
        if (!findTool(item, detail.id)) item.activities.push(tool)
        tool.itemRef ??= detail.itemRef
        tool.name += detail.nameDelta ?? ''
        tool.argumentsJson += detail.argumentsDelta ?? ''
      }
    }
    if (event.type === 'run.tool-call') {
      const call = event.payload.call as
        { id?: string; name?: string; argumentsJson?: string } | undefined
      const callId = call?.id ?? event.id
      const existing = findTool(item, callId)
      if (existing) {
        existing.name = call?.name ?? existing.name
        existing.argumentsJson = call?.argumentsJson ?? existing.argumentsJson
        existing.requested = true
      } else {
        item.activities.push({
          id: `tool:${callId}`,
          kind: 'tool',
          callId,
          name: call?.name ?? '',
          argumentsJson: call?.argumentsJson ?? '',
          output: '',
          requested: true
        })
      }
    }
    if (event.type === 'run.tool-output') {
      const callId = stringValue(event.payload.callId)
      let tool = callId ? findTool(item, callId) : undefined

      if (!tool && callId) {
        tool = {
          id: `tool:${callId}`,
          kind: 'tool',
          callId,
          name: '',
          argumentsJson: '',
          output: '',
          requested: true
        }
        item.activities.push(tool)
      }

      if (tool) {
        const text = String(event.payload.text ?? '')
        const streamed = typeof event.payload.stream === 'string'
        if (streamed) {
          tool.output += text
          tool.hasStreamedOutput = true
        } else {
          if (!tool.hasStreamedOutput) {
            tool.output = text
          } else if (text.startsWith(tool.output)) {
            tool.output = text
          } else {
            const status = text.match(/\n\[exit code:.*\]$/s)?.[0]
            if (status && !tool.output.endsWith(status)) tool.output += status
          }
          tool.isError = Boolean(event.payload.isError)
        }
      }
    }
    if (event.type === 'run.refusal') {
      const detail = modelEventFrom(event)
      if (detail?.type === 'refusal_delta') {
        const existing = [...item.activities]
          .reverse()
          .find(
            (activity): activity is RefusalActivity =>
              activity.kind === 'refusal' && activity.itemRef === detail.itemRef
          )
        if (existing) existing.text += detail.text
        else {
          item.activities.push({
            id: event.id,
            kind: 'refusal',
            itemRef: detail.itemRef,
            text: detail.text
          })
        }
      }
    }
    if (event.type === 'run.annotation') {
      const detail = modelEventFrom(event)
      if (detail?.type === 'annotation_added') {
        const existing = item.activities.find(
          (activity): activity is AnnotationActivity =>
            activity.kind === 'annotations' && activity.itemRef === detail.itemRef
        )
        if (existing) existing.annotations.push(detail.annotation)
        else {
          item.activities.push({
            id: event.id,
            kind: 'annotations',
            itemRef: detail.itemRef,
            annotations: [detail.annotation]
          })
        }
      }
    }
    if (event.type === 'run.completed') {
      item.status = 'completed'
      const textActivities = item.activities.filter(
        (activity): activity is TextActivity => activity.kind === 'text'
      )
      const refusalActivities = item.activities.filter(
        (activity): activity is RefusalActivity => activity.kind === 'refusal'
      )
      const finalText =
        typeof event.payload.finalText === 'string' ? event.payload.finalText : undefined
      const hasFinalText = Boolean(finalText?.trim())
      const finalStep =
        typeof event.payload.finalStep === 'number' && event.payload.finalStep > 0
          ? event.payload.finalStep
          : undefined

      if (finalStep !== undefined) {
        for (const activity of textActivities) {
          activity.role = activity.step === finalStep ? 'final' : 'process'
        }
        let finalActivities = textActivities.filter((activity) => activity.role === 'final')
        if (finalText && finalActivities.length === 0) {
          const activity: TextActivity = {
            id: `final:${event.id}`,
            kind: 'text',
            role: 'final',
            text: finalText,
            step: finalStep
          }
          item.activities.push(activity)
          finalActivities = [activity]
        }
        item.finalText = hasFinalText
          ? finalText
          : finalActivities.map((activity) => activity.text).join('') || undefined
      } else {
        const finalActivity = textActivities.at(-1)
        if (finalActivity) finalActivity.role = 'final'
        item.finalText = hasFinalText ? finalText : finalActivity?.text
      }
      item.copyText = hasFinalText
        ? finalText
        : textActivities.map((activity) => activity.text).join('') ||
          refusalActivities.map((activity) => activity.text).join('\n') ||
          undefined
    }
    if (event.type === 'run.failed') {
      item.status = 'failed'
      item.error = String(event.payload.message ?? '')
    }
    if (event.type === 'run.cancelled') item.status = 'cancelled'
    if (event.type === 'run.interrupted') item.status = 'interrupted'
    if (item.status) item.finishedAt = event.createdAt

    item.lastEventAt = event.createdAt
    item.lastEventType = event.type
    map.set(event.runId, item)
  }

  return [...map.values()].sort((left, right) => left.startedAt - right.startedAt)
}

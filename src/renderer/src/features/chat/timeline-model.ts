import type { RunEventDto } from '@kowork/contracts'

export interface ReasoningActivity {
  id: string
  kind: 'reasoning'
  text: string
}

export interface TextActivity {
  id: string
  kind: 'text'
  role: 'process' | 'final'
  text: string
  step?: number
}

export interface ToolActivity {
  id: string
  kind: 'tool'
  callId: string
  name: string
  argumentsJson: string
  output: string
  isError?: boolean
  hasStreamedOutput?: boolean
}

export interface CompressionActivity {
  id: string
  kind: 'compression'
  summary: string
}

export type RunActivity = TextActivity | ReasoningActivity | ToolActivity | CompressionActivity
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
      const previous = item.activities.at(-1)
      if (
        item.lastEventType === 'run.text' &&
        previous?.kind === 'text' &&
        previous.step === step
      ) {
        previous.text += text
      } else {
        item.activities.push({ id: event.id, kind: 'text', role: 'process', text, step })
      }
    }
    if (event.type === 'run.reasoning') {
      const text = String(event.payload.text ?? '')
      const previous = item.activities.at(-1)
      if (item.lastEventType === 'run.reasoning' && previous?.kind === 'reasoning') {
        previous.text += text
      } else {
        item.activities.push({ id: event.id, kind: 'reasoning', text })
      }
    }
    if (event.type === 'run.tool-call') {
      const call = event.payload.call as
        { id?: string; name?: string; argumentsJson?: string } | undefined
      const callId = call?.id ?? event.id
      const existing = item.activities.find(
        (activity): activity is ToolActivity =>
          activity.kind === 'tool' && activity.callId === callId
      )
      if (existing) {
        existing.name = call?.name ?? existing.name
        existing.argumentsJson = call?.argumentsJson ?? existing.argumentsJson
      } else {
        item.activities.push({
          id: `tool:${callId}`,
          kind: 'tool',
          callId,
          name: call?.name ?? '',
          argumentsJson: call?.argumentsJson ?? '',
          output: ''
        })
      }
    }
    if (event.type === 'run.tool-output') {
      const callId = typeof event.payload.callId === 'string' ? event.payload.callId : undefined
      let tool = callId
        ? item.activities.find(
            (activity): activity is ToolActivity =>
              activity.kind === 'tool' && activity.callId === callId
          )
        : undefined

      if (!tool && callId) {
        tool = {
          id: `tool:${callId}`,
          kind: 'tool',
          callId,
          name: '',
          argumentsJson: '',
          output: ''
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
    if (event.type === 'run.completed') {
      item.status = 'completed'
      const textActivities = item.activities.filter(
        (activity): activity is TextActivity => activity.kind === 'text'
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
        : textActivities.map((activity) => activity.text).join('') || undefined
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

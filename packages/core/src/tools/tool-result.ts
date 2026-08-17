import type { JsonValue } from '@koaks/node'

export const DEFAULT_TOOL_OUTPUT_LIMIT = 64_000
const TOOL_OUTPUT_HEAD = 16_000

export function jsonToolResult(output: unknown): JsonValue {
  return output as JsonValue
}

function preview(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const marker = '\n\n[... output truncated ...]\n\n'
  const headLength = Math.min(TOOL_OUTPUT_HEAD, Math.max(0, maxChars - marker.length))
  const tailLength = Math.max(0, maxChars - marker.length - headLength)
  const tail = tailLength > 0 ? value.slice(-tailLength) : ''
  return `${value.slice(0, headLength)}${marker}${tail}`
}

export function limitToolOutput(
  output: string | JsonValue,
  maxChars = DEFAULT_TOOL_OUTPUT_LIMIT
): string | JsonValue {
  const serialized = typeof output === 'string' ? output : JSON.stringify(output)
  if (serialized.length <= maxChars) return output

  const envelope = { truncated: true, originalChars: serialized.length, output: '' }
  const overhead = JSON.stringify(envelope).length
  let outputBudget = Math.max(0, maxChars - overhead)
  envelope.output = preview(serialized, outputBudget)
  const excess = JSON.stringify(envelope).length - maxChars
  if (excess > 0) {
    outputBudget = Math.max(0, outputBudget - excess)
    envelope.output = preview(serialized, outputBudget)
  }
  return envelope
}

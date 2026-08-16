export const UNTITLED_THREAD_TITLE = ''

const LEGACY_UNTITLED_THREAD_TITLE = '新的会话'
const FALLBACK_THREAD_TITLE = '新的会话'
const MAX_THREAD_TITLE_LENGTH = 48

function cleanTitle(value: string): string {
  return value
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^(?:#{1,6}|[-*>])\s+/u, '')
    .replace(/^["'`“”‘’《》]+|["'`“”‘’《》]+$/gu, '')
    .replace(/[。.!?！？:：;；]+$/u, '')
    .replace(/["'`“”‘’《》]+$/gu, '')
    .trim()
}

function truncateTitle(value: string): string {
  const characters = Array.from(value)
  if (characters.length <= MAX_THREAD_TITLE_LENGTH) return value
  return `${characters.slice(0, MAX_THREAD_TITLE_LENGTH - 3).join('')}...`
}

export function isUntitledThreadTitle(title: string): boolean {
  const normalized = title.trim()
  return normalized === UNTITLED_THREAD_TITLE || normalized === LEGACY_UNTITLED_THREAD_TITLE
}

export function createFallbackThreadTitle(message: string): string {
  return truncateTitle(cleanTitle(message) || FALLBACK_THREAD_TITLE)
}

export function normalizeGeneratedThreadTitle(title: string, message: string): string {
  const normalized = cleanTitle(title)
  return normalized ? truncateTitle(normalized) : createFallbackThreadTitle(message)
}

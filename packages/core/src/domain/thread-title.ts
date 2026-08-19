export const UNTITLED_THREAD_TITLE = ''
export const MAX_GENERATED_THREAD_TITLE_LENGTH = 15
export const MAX_GENERATED_THREAD_TITLE_WORDS = 7
const LATIN_TITLE_CHAR_FALLBACK = 40

const LEGACY_UNTITLED_THREAD_TITLE = '新的会话'
const FALLBACK_THREAD_TITLE = '新的会话'

const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u

function isCjkTitle(value: string): boolean {
  return CJK_PATTERN.test(value)
}

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
  if (isCjkTitle(value)) {
    const characters = Array.from(value)
    if (characters.length <= MAX_GENERATED_THREAD_TITLE_LENGTH) return value
    return `${characters.slice(0, MAX_GENERATED_THREAD_TITLE_LENGTH - 1).join('')}…`
  }
  const words = value.split(/\s+/u).filter(Boolean)
  const truncated =
    words.length <= MAX_GENERATED_THREAD_TITLE_WORDS
      ? value
      : `${words.slice(0, MAX_GENERATED_THREAD_TITLE_WORDS).join(' ')}…`
  const characters = Array.from(truncated)
  if (characters.length <= LATIN_TITLE_CHAR_FALLBACK) return truncated
  return `${characters.slice(0, LATIN_TITLE_CHAR_FALLBACK - 1).join('')}…`
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

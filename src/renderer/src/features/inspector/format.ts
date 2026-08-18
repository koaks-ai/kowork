const TOKEN_UNITS = [
  { minimum: 1_000_000_000, divisor: 1_000_000_000, suffix: 'B' },
  { minimum: 1_000_000, divisor: 1_000_000, suffix: 'M' },
  { minimum: 1_000, divisor: 1_000, suffix: 'K' }
] as const

export function formatTokenCount(tokens: number): string {
  const unit = TOKEN_UNITS.find(({ minimum }) => tokens >= minimum)
  if (!unit) return String(tokens)

  const value = (tokens / unit.divisor).toFixed(2).replace(/\.00$/, '')
  return `${value}${unit.suffix}`
}

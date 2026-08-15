export function shouldCompress(projectedTokens: number, contextWindowTokens: number): boolean {
  return projectedTokens >= contextWindowTokens * 0.9
}

export function selectRecentTurnCount(
  turnTokenCounts: number[],
  contextWindowTokens: number,
  maximumRecentTurns = 8
): number {
  let keepCount = Math.min(maximumRecentTurns, turnTokenCounts.length)
  while (keepCount > 1) {
    const keptTokens = turnTokenCounts.slice(-keepCount).reduce((sum, value) => sum + value, 0)
    if (keptTokens < contextWindowTokens * 0.72) break
    keepCount -= 1
  }
  return keepCount
}

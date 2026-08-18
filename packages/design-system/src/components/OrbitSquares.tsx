import type { CSSProperties } from 'react'
import * as React from 'react'

const CELLS = [
  [1, 1],
  [2, 1],
  [3, 1],
  [3, 2],
  [3, 3],
  [2, 3],
  [1, 3],
  [1, 2]
] as const

export function OrbitSquares(): React.JSX.Element {
  return (
    <span data-orbit-squares aria-hidden="true" className="kw-orbit-squares">
      {CELLS.map(([column, row], index) => (
        <span key={index} style={{ gridColumn: column, gridRow: row, '--i': index } as CSSProperties} />
      ))}
      <span className="kw-orbit-center" />
    </span>
  )
}

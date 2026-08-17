import type { CSSProperties } from 'react'

const ORBIT_CELLS = [
  { column: 1, row: 1 },
  { column: 2, row: 1 },
  { column: 3, row: 1 },
  { column: 3, row: 2 },
  { column: 3, row: 3 },
  { column: 2, row: 3 },
  { column: 1, row: 3 },
  { column: 1, row: 2 }
] as const

export function OrbitSquares(): React.JSX.Element {
  return (
    <span data-orbit-squares aria-hidden="true" className="kowork-orbit-squares">
      {ORBIT_CELLS.map((cell, index) => (
        <span
          key={index}
          style={
            {
              gridColumn: cell.column,
              gridRow: cell.row,
              '--i': index
            } as CSSProperties
          }
        />
      ))}
      <span className="kowork-orbit-center" />
    </span>
  )
}

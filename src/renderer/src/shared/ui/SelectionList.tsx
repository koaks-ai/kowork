import type { CSSProperties, ReactNode } from 'react'

const SELECT_INSET_PX = 2

interface SelectionListProps {
  index: number
  itemHeight: number
  children: ReactNode
  visible?: boolean
  radius?: 'md' | 'lg'
  className?: string
}

/** Sliding selected pill. Pair items with `kowork-select-item`; use `kowork-select-item-fill` when selected should paint without a rail. */

export function SelectionList({
  index,
  itemHeight,
  children,
  visible = index >= 0,
  radius = 'md',
  className = ''
}: SelectionListProps): React.JSX.Element {
  return (
    <div
      className={`kowork-select-list relative ${className}`.trim()}
      data-radius={radius}
    >
      <span
        aria-hidden="true"
        data-selection-highlight
        className="kowork-select-highlight"
        style={
          {
            height: itemHeight - SELECT_INSET_PX * 2,
            transform: `translateY(${Math.max(index, 0) * itemHeight}px)`,
            opacity: visible ? 1 : 0
          } satisfies CSSProperties
        }
      />
      {children}
    </div>
  )
}
